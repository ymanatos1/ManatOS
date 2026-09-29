import type { UiInvocation, UiLevelId } from './contracts.js';
import type { UiContext, UiCtxMutationCause } from './ui-context.js';
import type { UiOwnerSurfaceProvider } from './surface-providers.js';

export type UiLevelLifecycle =
  'created' | 'deactivating' | 'active' | 'closing' | 'closed' | 'disposed';

export interface UiLevelDiagnosticIdentity {
  readonly id: UiLevelId;
  readonly sourceCtxPath: string | null;
  readonly structuralRoot: boolean;
}

/**
 * Runtime/lifetime node for one UI invocation boundary.
 *
 * Lifecycle is read from and written to the level's canonical CTX. UiLevel does
 * not keep a shadow lifecycle/state model. The structural root is the sole
 * exception: it has topology/lifetime only and no semantic CTX.
 */
export class UiLevel {
  readonly #children = new Set<UiLevel>();
  #ownerProvider: UiOwnerSurfaceProvider | null = null;

  private constructor(
    public readonly id: UiLevelId,
    /** Short browser-process identity for the rendered UiLevel instance (level1, level2, ...). */
    public readonly domId: string,
    public readonly parent: UiLevel | null,
    public readonly invocation: UiInvocation | null,
    public readonly context: UiContext | null,
    public readonly diagnosticIdentity: UiLevelDiagnosticIdentity,
  ) {}

  static structuralRoot(id: UiLevelId): UiLevel {
    return new UiLevel(id, '$ui-root', null, null, null, {
      id,
      sourceCtxPath: null,
      structuralRoot: true,
    });
  }

  static child(
    parent: UiLevel,
    id: UiLevelId,
    domId: string,
    invocation: UiInvocation,
    context: UiContext,
  ): UiLevel {
    const level = new UiLevel(id, domId, parent, Object.freeze({ ...invocation }), context, {
      id,
      sourceCtxPath: context.path,
      structuralRoot: false,
    });
    parent.#children.add(level);
    return level;
  }

  get children(): ReadonlySet<UiLevel> {
    return this.#children;
  }

  get isStructuralRoot(): boolean {
    return this.diagnosticIdentity.structuralRoot;
  }

  /** Runtime-only owner capability. It is deliberately outside canonical CTX data. */
  get ownerProvider(): UiOwnerSurfaceProvider | null {
    return this.#ownerProvider;
  }

  /** Bind the ultimate semantic owner once and propagate it through the live subtree. */
  bindOwnerProvider(provider: UiOwnerSurfaceProvider | null): void {
    this.#ownerProvider = provider;
    for (const child of this.#children) child.bindOwnerProvider(provider);
  }

  /**
   * Compatibility resource access over this UiLevel's canonical #data.
   *
   * Resources are semantic surface state. There is deliberately no parallel
   * runtime store: accepted resources live under data.resources.runtime and
   * therefore survive/export with the owning surface CTX. Surface providers
   * are the architectural boundary; these methods remain only as the narrow
   * UiLevel storage primitive used by those providers and legacy consumers
   * while the latter are migrated.
   */
  getRuntimeResource<T = unknown>(key: string): T | undefined {
    if (!this.context) return undefined;
    const resources = this.context.get('data.resources.runtime');
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return undefined;
    return (resources as Record<string, unknown>)[key] as T | undefined;
  }

  setRuntimeResource(key: string, value: unknown): void {
    if (!key) throw new Error('UiLevel runtime resource requires a key.');
    if (!this.context) throw new Error('The structural UI root cannot own resources.');
    const resources = this.runtimeResourceSnapshot();
    this.context.replace(
      'data.resources.runtime',
      { ...resources, [key]: structuredClone(value) },
      { source: 'ui-level:resource' },
    );
  }

  deleteRuntimeResource(key: string): void {
    if (!this.context) return;
    const resources = { ...this.runtimeResourceSnapshot() };
    if (!Object.prototype.hasOwnProperty.call(resources, key)) return;
    delete resources[key];
    this.context.replace('data.resources.runtime', resources, { source: 'ui-level:resource' });
  }

  runtimeResourceSnapshot(): Readonly<Record<string, unknown>> {
    if (!this.context) return Object.freeze({});
    const resources = this.context.get('data.resources.runtime');
    if (!resources || typeof resources !== 'object' || Array.isArray(resources))
      return Object.freeze({});
    return Object.freeze(structuredClone(resources as Record<string, unknown>));
  }

  replaceRuntimeResources(resources: unknown): void {
    if (!this.context) return;
    const normalized =
      resources && typeof resources === 'object' && !Array.isArray(resources)
        ? structuredClone(resources as Record<string, unknown>)
        : {};
    this.context.replace('data.resources.runtime', normalized, { source: 'ui-level:resource' });
  }

  clearRuntimeResources(): void {
    if (!this.context) return;
    const resources = this.context.get('data.resources');
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return;
    if (!Object.prototype.hasOwnProperty.call(resources, 'runtime')) return;
    this.context.replace('data.resources.runtime', {}, { source: 'ui-level:resource' });
  }

  /** Canonical observable lifecycle; never a private mirrored value. */
  get lifecycle(): UiLevelLifecycle | null {
    if (!this.context) return null;
    const value = this.context.get('state.lifecycle');
    return typeof value === 'string' ? (value as UiLevelLifecycle) : null;
  }

  get active(): boolean {
    return this.context?.get('state.active') === true;
  }

  setLifecycle(lifecycle: UiLevelLifecycle, active: boolean, cause: UiCtxMutationCause): void {
    if (!this.context) throw new Error('The structural UI root has no semantic lifecycle.');
    const state = this.context.get('state');
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error(`UI level ${this.id} has no canonical state.`);
    }
    this.context.replace(
      'state',
      { ...(state as Record<string, unknown>), lifecycle, active },
      cause,
    );
  }

  /** Internal ownership operation used by UiRuntime only. */
  attachChild(child: UiLevel): void {
    if (child.parent !== this) throw new Error('Cannot attach a UI level to a different parent.');
    this.#children.add(child);
  }

  /** Internal ownership operation used by UiRuntime only. */
  detachChild(child: UiLevel): void {
    this.#children.delete(child);
  }
}
