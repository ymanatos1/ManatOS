import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { AppError, type OperationNodeSnapshot } from './errors.js';

/**
 * Execution state of one semantic application operation.
 */
type OperationStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Internal mutable operation-tree node.
 *
 * This is deliberately separate from OperationNodeSnapshot:
 *
 * - Node                  = live mutable execution state
 * - OperationNodeSnapshot = immutable diagnostic representation
 */
interface Node {
  id: string;

  description: string;
  userDescription?: string;

  status: OperationStatus;

  startedAt: Date;
  completedAt?: Date;

  /**
   * Carefully selected internal values useful for diagnostics.
   *
   * Sensitive values are replaced by "********" before they are added.
   */
  comments: Array<{
    name: string;
    value: unknown;
    sensitive: boolean;
  }>;

  /**
   * Nested semantic operations.
   *
   * Successful nested branches are pruned after completion.
   * Failed branches are retained in full.
   */
  children: Node[];

  errorCode?: string;
  errorMessage?: string;
}

/**
 * AsyncLocalStorage state for one HTTP/request execution context.
 *
 * Each concurrent request receives an independent Store instance even when
 * asynchronous operations from multiple requests are interleaved by Node.
 */
interface Store {
  requestId: string;

  /**
   * Current root operation.
   *
   * Optional means the property may be absent. Because the project uses
   * exactOptionalPropertyTypes=true, we remove the property with `delete`
   * when the root finishes rather than assigning `undefined`.
   */
  root?: Node;

  /**
   * Stack of currently active nested operations.
   */
  active: Node[];
}

/**
 * API exposed to application code while one semantic operation is active.
 *
 * Example:
 *
 * scope.addContext({
 *   userId,
 *   email,
 *   password,
 * });
 *
 * The password value will automatically become "********".
 */
export class OperationScope {
  /**
   * Context-property names considered sensitive automatically.
   *
   * Developers can also explicitly pass sensitive=true to comment().
   */
  private static readonly sensitive =
    /(password|hash|token|secret|authorization|cookie|session|api[-_]?key)/i;

  constructor(private readonly node: Node) {}

  /**
   * Add one diagnostic value to the current operation.
   *
   * Sensitive values are never retained in their original form.
   */
  comment(name: string, value: unknown, sensitive = false): void {
    const mustMask = sensitive || OperationScope.sensitive.test(name);

    this.node.comments.push({
      name,
      value: mustMask ? '********' : value,
      sensitive: mustMask,
    });
  }

  /**
   * Convenience helper for adding several diagnostic values.
   */
  addContext(values: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(values)) {
      this.comment(name, value);
    }
  }
}

/**
 * Semantic nested operation tracing.
 *
 * This complements the normal JavaScript Error.stack.
 *
 * JavaScript stack:
 *
 *   tells developers which functions executed.
 *
 * Operation tree:
 *
 *   tells developers/users what the application was actually trying to do.
 *
 * Example:
 *
 * Save SysPrincipal "John"
 * ├── ✓ Validate principal
 * ├── ✓ Update in-memory data
 * └── ✗ Persist data
 *     ├── ✓ Serialize JSON
 *     └── ✗ Replace database.json
 *
 * Successful nested details are discarded, keeping only compact successful
 * operation nodes. If a branch fails, its complete nested path is retained.
 */
export class OperationContext {
  private readonly als = new AsyncLocalStorage<Store>();

  /**
   * Establish the operation context for an incoming request.
   *
   * Normally called once by Express request-context middleware.
   */
  runRequest<T>(requestId: string, fn: () => T): T {
    return this.als.run(
      {
        requestId,
        active: [],
      },
      fn,
    );
  }

  /**
   * Obtain the request/correlation ID currently associated with execution.
   *
   * A fallback UUID is provided primarily for non-HTTP execution paths.
   */
  getRequestId(): string {
    return this.als.getStore()?.requestId ?? randomUUID();
  }

  /**
   * Run a root semantic operation.
   *
   * A root operation represents the main action that could be retried from
   * the UI, for example:
   *
   * - Create SysUser
   * - Save SysPrincipal
   * - Change password
   * - Register account
   *
   * If this function is called outside an existing request context, it creates
   * an isolated context automatically. This is useful for unit tests and
   * background/internal operations.
   */
  async runRoot<T>(
    description: string,
    fn: (scope: OperationScope) => Promise<T>,
    userDescription?: string,
  ): Promise<T> {
    /*
     * Normally request middleware has already established AsyncLocalStorage.
     * For tests/internal calls we create one automatically.
     */
    if (!this.als.getStore()) {
      return this.als.run(
        {
          requestId: randomUUID(),
          active: [],
        },
        () => this.runRoot(description, fn, userDescription),
      );
    }

    const store = this.store();

    const node = this.createNode(description, userDescription);

    store.root = node;

    try {
      return await this.execute(node, fn);
    } catch (error) {
      /*
       * Convert unknown/native errors into our transport-neutral AppError.
       */
      const appError = this.toAppError(error);

      /*
       * Attach the semantic trace only once.
       *
       * If an inner layer already captured a richer trace, preserve it.
       */
      appError.operationTrace ??= [this.snapshot(node)];

      throw appError;
    } finally {
      /*
       * IMPORTANT:
       *
       * With exactOptionalPropertyTypes=true:
       *
       *   root?: Node
       *
       * means "root may be absent", not "root may explicitly contain
       * undefined".
       *
       * Therefore:
       *
       *   store.root = undefined;
       *
       * is invalid.
       *
       * Removing the property is both semantically correct and satisfies
       * TypeScript's strict optional-property semantics.
       */
      delete store.root;

      /*
       * Defensive cleanup so no operation from one root execution remains
       * active after the root operation exits.
       */
      store.active = [];
    }
  }

  /**
   * Run one nested operation beneath the current operation.
   */
  async run<T>(
    description: string,
    fn: (scope: OperationScope) => Promise<T>,
    userDescription?: string,
  ): Promise<T> {
    /*
     * Internal/test code may call run() without first opening a root.
     * In that case, treat this operation as a root operation.
     */
    if (!this.als.getStore()) {
      return this.als.run(
        {
          requestId: randomUUID(),
          active: [],
        },
        () => this.runRoot(description, fn, userDescription),
      );
    }

    const store = this.store();

    const node = this.createNode(description, userDescription);

    /*
     * Attach the new operation beneath the current active parent.
     *
     * If active is empty, optional chaining safely results in no parent.
     */
    store.active.at(-1)?.children.push(node);

    return this.execute(node, fn);
  }

  /**
   * Execute one live operation node.
   */
  private async execute<T>(node: Node, fn: (scope: OperationScope) => Promise<T>): Promise<T> {
    const store = this.store();

    store.active.push(node);

    try {
      const result = await fn(new OperationScope(node));

      node.status = 'completed';
      node.completedAt = new Date();

      /*
       * Requested trace behavior:
       *
       * When an operation succeeds, detailed nested operations beneath it no
       * longer provide useful failure diagnostics, so discard them.
       *
       * The successfully completed operation node itself remains available to
       * its parent as a compact summary.
       */
      node.children = [];

      return result;
    } catch (error) {
      node.status = 'failed';
      node.completedAt = new Date();

      /*
       * Keep the nested children intact.
       *
       * They represent the full semantic path to the actual failed leaf.
       */
      if (error instanceof AppError) {
        node.errorCode = error.code;
        node.errorMessage = error.message;
      } else if (error instanceof Error) {
        node.errorCode = 'UNEXPECTED_ERROR';

        node.errorMessage = error.message;
      }

      throw error;
    } finally {
      /*
       * Remove the current operation from the live active stack regardless
       * of success or failure.
       */
      store.active.pop();
    }
  }

  /**
   * Create a new live operation node.
   */
  private createNode(description: string, userDescription?: string): Node {
    return {
      id: randomUUID(),

      description,

      ...(userDescription ? { userDescription } : {}),

      status: 'running',

      startedAt: new Date(),

      comments: [],
      children: [],
    };
  }

  /**
   * Convert the live mutable operation tree into a diagnostic snapshot.
   */
  private snapshot(node: Node): OperationNodeSnapshot {
    const completedAt = node.completedAt;

    return {
      id: node.id,

      description: node.description,

      ...(node.userDescription
        ? {
            userDescription: node.userDescription,
          }
        : {}),

      status: node.status,

      startedAt: node.startedAt.toISOString(),

      ...(completedAt
        ? {
            completedAt: completedAt.toISOString(),

            durationMs: completedAt.getTime() - node.startedAt.getTime(),
          }
        : {}),

      /*
       * Values were already sanitized/masked before reaching this point.
       */
      comments: node.comments.map((comment) => ({
        ...comment,
      })),

      children: node.children.map((child) => this.snapshot(child)),

      ...(node.errorCode
        ? {
            errorCode: node.errorCode,
          }
        : {}),

      ...(node.errorMessage
        ? {
            errorMessage: node.errorMessage,
          }
        : {}),
    };
  }

  /**
   * Ensure every propagated application failure has the same AppError shape.
   */
  private toAppError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    return new AppError(
      'UNEXPECTED_ERROR',

      error instanceof Error ? error.message : String(error),

      'An unexpected application error occurred.',

      true,

      {
        cause: error,
      },
    );
  }

  /**
   * Retrieve the active AsyncLocalStorage state.
   */
  private store(): Store {
    const store = this.als.getStore();

    if (!store) {
      throw new Error('OperationContext requires request middleware.');
    }

    return store;
  }
}

/**
 * Singleton operation context shared across the application.
 *
 * AsyncLocalStorage keeps each concurrent request isolated.
 */
export const operationContext = new OperationContext();
