import { randomUUID } from 'node:crypto';

export interface TransactionAction {
  description: string;
  execute: () => Promise<void>;
}

export interface TransactionActionFailure {
  description: string;
  message: string;
}

export interface TransactionHistoryEntry {
  timestamp: string;
  phase: 'begin' | 'operation' | 'commit' | 'rollback' | 'expiry';
  description: string;
  status: 'registered' | 'completed' | 'failed';
  message?: string;
}

export interface TransactionFinalizationResult {
  transactionId: string;
  phase: 'commit' | 'rollback';
  trigger: 'explicit' | 'expiry';
  failures: TransactionActionFailure[];
  history: TransactionHistoryEntry[];
}

interface TransactionContext {
  id: string;
  ownerId: string;
  createdAt: string;
  commitActions: TransactionAction[];
  rollbackActions: TransactionAction[];
  history: TransactionHistoryEntry[];
  activeOperations: number;
  expiryTimer: ReturnType<typeof setTimeout>;
  finalization?: {
    phase: 'commit' | 'rollback';
    promise: Promise<TransactionFinalizationResult>;
  };
}

interface TerminalTransaction {
  ownerId: string;
  result: TransactionFinalizationResult;
  expiresAt: number;
  cleanupTimer: ReturnType<typeof setTimeout>;
}

export interface TransactionsSupportOptions {
  /** Maximum idle lifetime of an unfinished transaction. */
  activeTimeoutMs?: number;
  /** How long terminal results remain available for idempotent retry. */
  terminalRetentionMs?: number;
  /** Diagnostic callback invoked exactly once when finalization actually completes. */
  onFinalized?: (result: TransactionFinalizationResult) => void | Promise<void>;
  /** Maintenance callback for an automatically expired transaction. */
  onExpired?: (result: TransactionFinalizationResult) => void | Promise<void>;
}

const DEFAULT_ACTIVE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_TERMINAL_RETENTION_MS = 5 * 60 * 1000;

/**
 * Generic transaction finalization/compensation journal for adapters that do
 * not have a native database transaction manager.
 *
 * The journal deliberately knows nothing about JSON, pictures or entities.
 * Callers register only work that remains outstanding after a successful step.
 */
export class TransactionsSupport {
  private readonly contexts = new Map<string, TransactionContext>();
  private readonly terminal = new Map<string, TerminalTransaction>();
  private readonly activeTimeoutMs: number;
  private readonly terminalRetentionMs: number;
  private readonly onFinalized?: TransactionsSupportOptions['onFinalized'];
  private readonly onExpired?: TransactionsSupportOptions['onExpired'];

  constructor(options: TransactionsSupportOptions = {}) {
    this.activeTimeoutMs = options.activeTimeoutMs ?? DEFAULT_ACTIVE_TIMEOUT_MS;
    this.terminalRetentionMs = options.terminalRetentionMs ?? DEFAULT_TERMINAL_RETENTION_MS;
    this.onFinalized = options.onFinalized;
    this.onExpired = options.onExpired;
  }

  begin(ownerId: string): string {
    this.purgeTerminal();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const context: TransactionContext = {
      id,
      ownerId,
      createdAt,
      commitActions: [],
      rollbackActions: [],
      history: [
        {
          timestamp: createdAt,
          phase: 'begin',
          description: 'Transaction opened',
          status: 'completed',
        },
      ],
      activeOperations: 0,
      expiryTimer: undefined as unknown as ReturnType<typeof setTimeout>,
    };
    context.expiryTimer = this.expiryTimer(context);
    this.contexts.set(id, context);
    return id;
  }

  assertOwned(transactionId: string, ownerId: string): void {
    this.purgeTerminal();
    const context = this.contexts.get(transactionId);
    if (!context) {
      const completed = this.terminal.get(transactionId);
      if (completed) {
        if (completed.ownerId !== ownerId) this.throwWrongOwner(transactionId);
        throw new Error(
          `Transaction '${transactionId}' is already ${completed.result.phase === 'commit' ? 'committed' : 'rolled back'}.`,
        );
      }
      throw new Error(`Transaction '${transactionId}' is not active.`);
    }
    if (context.ownerId !== ownerId) this.throwWrongOwner(transactionId);
    this.touch(context);
  }

  /**
   * Lease an active transaction while one participating API request is in
   * flight. Expiry is an idle-transaction safeguard and must never race an
   * operation that is still mutating storage.
   */
  acquireOperation(transactionId: string, ownerId: string): void {
    const context = this.ownedActive(transactionId, ownerId);
    if (context.activeOperations > 0) {
      throw new Error(`Transaction '${transactionId}' still has active operations.`);
    }
    if (context.finalization) {
      throw new Error(
        `Transaction '${transactionId}' is already finalizing as ${context.finalization.phase}.`,
      );
    }
    context.activeOperations += 1;
    clearTimeout(context.expiryTimer);
  }

  releaseOperation(transactionId: string, ownerId: string): void {
    const context = this.contexts.get(transactionId);
    if (!context) return;
    if (context.ownerId !== ownerId) this.throwWrongOwner(transactionId);
    if (context.activeOperations > 0) context.activeOperations -= 1;
    if (context.activeOperations === 0 && !context.finalization) this.touch(context);
  }

  register(
    transactionId: string,
    ownerId: string,
    actions: { commit?: TransactionAction[]; rollback?: TransactionAction[] },
    description: string,
  ): void {
    const context = this.ownedActive(transactionId, ownerId);
    context.commitActions.push(...(actions.commit ?? []));
    context.rollbackActions.push(...(actions.rollback ?? []));
    context.history.push({
      timestamp: new Date().toISOString(),
      phase: 'operation',
      description,
      status: 'registered',
    });
    this.touch(context);
  }

  async commit(transactionId: string, ownerId: string): Promise<TransactionFinalizationResult> {
    return this.finalize(transactionId, ownerId, 'commit', 'explicit');
  }

  async rollback(transactionId: string, ownerId: string): Promise<TransactionFinalizationResult> {
    return this.finalize(transactionId, ownerId, 'rollback', 'explicit');
  }

  private async finalize(
    transactionId: string,
    ownerId: string,
    phase: 'commit' | 'rollback',
    trigger: 'explicit' | 'expiry',
  ): Promise<TransactionFinalizationResult> {
    this.purgeTerminal();
    const completed = this.terminal.get(transactionId);
    if (completed) {
      if (completed.ownerId !== ownerId) this.throwWrongOwner(transactionId);
      if (completed.result.phase !== phase) {
        throw new Error(
          `Transaction '${transactionId}' is already ${completed.result.phase === 'commit' ? 'committed' : 'rolled back'}.`,
        );
      }
      return completed.result;
    }

    const context = this.ownedActive(transactionId, ownerId);
    if (context.activeOperations > 0) {
      throw new Error(`Transaction '${transactionId}' still has active operations.`);
    }
    if (context.finalization) {
      if (context.finalization.phase !== phase) {
        throw new Error(
          `Transaction '${transactionId}' is already finalizing as ${context.finalization.phase}.`,
        );
      }
      return context.finalization.promise;
    }

    clearTimeout(context.expiryTimer);
    const promise = this.runFinalization(context, phase, trigger);
    context.finalization = { phase, promise };
    return promise;
  }

  private async runFinalization(
    context: TransactionContext,
    phase: 'commit' | 'rollback',
    trigger: 'explicit' | 'expiry',
  ): Promise<TransactionFinalizationResult> {
    const failures: TransactionActionFailure[] = [];
    try {
      const actions =
        phase === 'commit' ? context.commitActions : [...context.rollbackActions].reverse();
      for (const action of actions) await this.executeAction(context, phase, action, failures);
      const result: TransactionFinalizationResult = {
        transactionId: context.id,
        phase,
        trigger,
        failures,
        history: [...context.history],
      };
      this.rememberTerminal(context, result);
      try {
        await this.onFinalized?.(result);
      } catch {
        // Diagnostics are best-effort and must never affect transaction outcome.
      }
      return result;
    } finally {
      // Terminal cleanup is unconditional even when an unexpected implementation
      // error escapes the finalizer itself.
      this.contexts.delete(context.id);
    }
  }

  private ownedActive(transactionId: string, ownerId: string): TransactionContext {
    const context = this.contexts.get(transactionId);
    if (!context) throw new Error(`Transaction '${transactionId}' is not active.`);
    if (context.ownerId !== ownerId) this.throwWrongOwner(transactionId);
    return context;
  }

  private throwWrongOwner(transactionId: string): never {
    throw new Error(`Transaction '${transactionId}' belongs to another API session.`);
  }

  private touch(context: TransactionContext): void {
    clearTimeout(context.expiryTimer);
    if (context.activeOperations > 0 || context.finalization) return;
    context.expiryTimer = this.expiryTimer(context);
  }

  private expiryTimer(context: TransactionContext): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      void this.expire(context.id);
    }, this.activeTimeoutMs);
    timer.unref?.();
    return timer;
  }

  private async expire(transactionId: string): Promise<void> {
    const context = this.contexts.get(transactionId);
    if (!context) return;
    if (context.activeOperations > 0) {
      // Normally no expiry timer exists while leased. If a timer callback was
      // already queued when the lease was acquired, defer expiry until idle.
      return;
    }
    context.history.push({
      timestamp: new Date().toISOString(),
      phase: 'expiry',
      description: 'Abandoned transaction expired; rollback started',
      status: 'completed',
    });
    try {
      const result = await this.finalize(transactionId, context.ownerId, 'rollback', 'expiry');
      await this.onExpired?.(result);
    } catch {
      // finalize() guarantees active-context destruction in finally. The normal
      // rollback action path records individual compensation failures in result.
      this.contexts.delete(transactionId);
    }
  }

  private rememberTerminal(
    context: TransactionContext,
    result: TransactionFinalizationResult,
  ): void {
    const transactionId = context.id;
    const cleanupTimer = setTimeout(
      () => this.terminal.delete(transactionId),
      this.terminalRetentionMs,
    );
    cleanupTimer.unref?.();
    this.terminal.set(transactionId, {
      ownerId: context.ownerId,
      result,
      expiresAt: Date.now() + this.terminalRetentionMs,
      cleanupTimer,
    });
  }

  private purgeTerminal(): void {
    const now = Date.now();
    for (const [id, completed] of this.terminal) {
      if (completed.expiresAt <= now) {
        clearTimeout(completed.cleanupTimer);
        this.terminal.delete(id);
      }
    }
  }

  private async executeAction(
    context: TransactionContext,
    phase: 'commit' | 'rollback',
    action: TransactionAction,
    failures: TransactionActionFailure[],
  ): Promise<void> {
    try {
      await action.execute();
      context.history.push({
        timestamp: new Date().toISOString(),
        phase,
        description: action.description,
        status: 'completed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ description: action.description, message });
      context.history.push({
        timestamp: new Date().toISOString(),
        phase,
        description: action.description,
        status: 'failed',
        message,
      });
    }
  }
}
