import type { UiInvocation, UiLevelId } from './contracts.js';
import { UiLevel } from './ui-level.js';
import type { UiContext, UiCtxMutationCause } from './ui-context.js';
import { UiRuntimeRegistries } from './registries.js';
import { GENERAL_FIELD_COMPONENTS } from './field-components.js';
import { RICH_FIELD_COMPONENTS } from './rich-field-components.js';
import type { UiOpenedSurface, UiOpenRequest, UiSurfaceDefinition } from './surface-host.js';

export const UI_STRUCTURAL_ROOT_ID = '$ui-root';

export type UiCloseDecision = 'save' | 'discard' | 'cancel';
export type UiCloseStatus = 'closed' | 'cancelled' | 'decision-required' | 'failed';

export interface UiCloseRequest {
  readonly source?: string;
  readonly removeContext?: boolean;
  readonly decision?: UiCloseDecision;
  readonly save?: () => Promise<boolean>;
  readonly discard?: () => Promise<boolean>;
  /** Called immediately before each authorized UiLevel is disposed/removed. */
  readonly dispose?: (level: UiLevel) => void;
}

export interface UiCloseResult {
  readonly status: UiCloseStatus;
  readonly levelId: UiLevelId;
}

/**
 * One typed runtime per browser application.
 *
 * Stage 20 makes host and surface registries executable and establishes one
 * canonical topology/lifecycle authority. Bootstrap topology is adopted once;
 * all later surfaces enter and leave the tree through explicit runtime operations.
 */
export class UiRuntime {
  readonly root: UiLevel;
  readonly registries: UiRuntimeRegistries;
  readonly #levels = new Map<UiLevelId, UiLevel>();
  #nextDomLevelId = 1;

  constructor(
    rootId: UiLevelId = UI_STRUCTURAL_ROOT_ID,
    registries: UiRuntimeRegistries = new UiRuntimeRegistries(),
  ) {
    this.registries = registries;
    for (const definition of [...GENERAL_FIELD_COMPONENTS, ...RICH_FIELD_COMPONENTS]) {
      if (!this.registries.components.find(definition.id)) {
        this.registries.components.register(definition);
      }
    }
    this.root = UiLevel.structuralRoot(rootId);
    this.#levels.set(rootId, this.root);
  }

  get levels(): ReadonlyMap<UiLevelId, UiLevel> {
    return this.#levels;
  }

  find(id: UiLevelId): UiLevel | undefined {
    return this.#levels.get(id);
  }

  /**
   * Current/topmost semantic surface in the canonical runtime topology.
   * Surface interaction/debug correlation must derive from this topology rather
   * than physical DOM visibility, because covered ancestors remain mounted.
   */
  currentLevel(): UiLevel | null {
    let current: UiLevel | null = null;
    let parent = this.root;
    for (;;) {
      const children = [...parent.children].filter(
        (child) => child.lifecycle !== 'closed' && child.lifecycle !== 'disposed',
      );
      if (!children.length) return current;
      current = children.at(-1) ?? null;
      if (!current) return null;
      parent = current;
    }
  }

  /**
   * Open one semantic surface through one orthogonal host strategy. The host
   * owns placement/topology; the surface owns semantic initialization. Neither
   * side may silently substitute the other's id from the invocation.
   */
  open<TResult = unknown>(request: UiOpenRequest): UiOpenedSurface<TResult> {
    const host = this.registries.hosts.resolve(request.invocation.host);
    const surface = this.registries.surfaces.resolve(
      request.invocation.surface,
    ) as UiSurfaceDefinition<TResult>;
    const level = host.open({ runtime: this, request });
    this.#assertLive(level);
    if (level.invocation?.host !== request.invocation.host) {
      throw new Error(
        `UI host ${host.id} mounted level ${level.id} with a different host invocation.`,
      );
    }
    if (level.invocation?.surface !== request.invocation.surface) {
      throw new Error(
        `UI surface ${surface.id} received level ${level.id} with a different surface invocation.`,
      );
    }
    const value = surface.open({ runtime: this, level, request });
    return Object.freeze({ level, host, surface, value });
  }

  /**
   * Register a caller-prepared canonical child level. The caller owns the
   * invocation/context preparation; callee initialization is deliberately not
   * part of this kernel operation.
   */
  adoptChild(
    parent: UiLevel,
    id: UiLevelId,
    invocation: UiInvocation,
    context: UiContext,
  ): UiLevel {
    if (parent !== this.root && this.#levels.get(parent.id) !== parent) {
      throw new Error(`Parent UI level is not live: ${parent.id}`);
    }
    if (this.#levels.has(id)) throw new Error(`Duplicate UI level id: ${id}`);
    const level = UiLevel.child(parent, id, `level${this.#nextDomLevelId++}`, invocation, context);
    this.#levels.set(id, level);
    return level;
  }

  /** Activate a prepared level through canonical CTX. */
  activate(level: UiLevel, source = 'ui-runtime-v2'): void {
    this.#assertLive(level);
    level.setLifecycle('active', true, this.#cause(source, 'activate-level', level));
  }

  /** Deactivate a live level while a non-embedded child owns user interaction. */
  deactivate(level: UiLevel, source = 'ui-runtime-v2'): void {
    this.#assertLive(level);
    if (level.isStructuralRoot) throw new Error('The structural UI root cannot be deactivated.');
    level.setLifecycle('deactivating', false, this.#cause(source, 'deactivate-level', level));
  }

  /**
   * The single application closure gate. Dirty UiLevels cannot be destroyed
   * without an explicit lifecycle decision. Invocation policy may deliberately
   * choose silent discard (used by local embedded editors), but still passes
   * through this authority.
   */
  async requestClose(level: UiLevel, request: UiCloseRequest = {}): Promise<UiCloseResult> {
    this.#assertLive(level);
    if (level.isStructuralRoot) throw new Error('The structural UI root cannot be closed.');

    // Children close deepest-first. An explicit discard of an owning surface is
    // authorization to abandon its whole owned subtree; do not require a second
    // hidden-child decision before the owner's discard can complete. Save and
    // undecided closure still preserve independent child decisions.
    for (const child of [...level.children].reverse()) {
      const discardOwnedSubtree = request.decision === 'discard';
      const childResult = await this.requestClose(child, {
        ...(request.source ? { source: request.source } : {}),
        ...(request.dispose ? { dispose: request.dispose } : {}),
        ...(discardOwnedSubtree ? { decision: 'discard' as const, discard: async () => true } : {}),
      });
      if (childResult.status !== 'closed') return childResult;
    }

    const dirty = level.context?.get('state.dirty') === true;
    const dirtyPolicy = level.invocation?.behavior?.closePolicy?.dirty ?? 'prompt';
    let decision = request.decision;
    if (dirty && dirtyPolicy === 'discard') decision = 'discard';
    if (dirty && !decision) return { status: 'decision-required', levelId: level.id };
    if (dirty && decision === 'cancel') return { status: 'cancelled', levelId: level.id };

    if (dirty && decision === 'save') {
      if (!request.save || (await request.save()) !== true) {
        return { status: 'failed', levelId: level.id };
      }
    }
    if (dirty && decision === 'discard') {
      if (dirtyPolicy === 'prompt' && !request.discard) {
        return { status: 'failed', levelId: level.id };
      }
      if (request.discard && (await request.discard()) !== true) {
        return { status: 'failed', levelId: level.id };
      }
    }

    this.#performClose(
      level,
      request.source ?? 'ui-runtime-v2',
      request.removeContext !== false,
      request.dispose,
    );
    return { status: 'closed', levelId: level.id };
  }

  /** Replace the current root-owned page subtree rather than nesting navigation history. */
  replaceRootChild(
    id: UiLevelId,
    invocation: UiInvocation,
    context: UiContext,
    source = 'ui-runtime-v2',
  ): UiLevel {
    for (const child of [...this.root.children]) {
      if (child.context?.get('state.dirty') === true) {
        throw new Error(
          'replaceRootChild cannot bypass dirty UiLevel closure; requestClose first.',
        );
      }
      this.#performClose(child, source, true);
    }
    return this.adoptChild(this.root, id, invocation, context);
  }

  #performClose(
    level: UiLevel,
    source: string,
    removeContext: boolean,
    dispose?: (level: UiLevel) => void,
  ): void {
    for (const child of [...level.children])
      this.#performClose(child, source, removeContext, dispose);
    const context = level.context;
    if (!context) throw new Error(`UI level ${level.id} has no canonical CTX.`);
    level.setLifecycle('closing', false, this.#cause(source, 'close-level', level));
    level.setLifecycle('closed', false, this.#cause(source, 'close-level', level));
    level.setLifecycle('disposed', false, this.#cause(source, 'dispose-level', level));
    dispose?.(level);
    level.clearRuntimeResources();
    level.parent?.detachChild(level);
    this.#levels.delete(level.id);
    if (removeContext) context.deleteSelf(this.#cause(source, 'remove-level-context', level));
  }

  #assertLive(level: UiLevel): void {
    if (this.#levels.get(level.id) !== level) throw new Error(`UI level is not live: ${level.id}`);
  }

  #cause(source: string, action: string, level: UiLevel): UiCtxMutationCause {
    return { source, action, ...(level.context ? { triggerPath: level.context.path } : {}) };
  }
}
