import type { CtxBinding } from './binding.js';
import type { UiContext } from './ui-context.js';
import type { UiLevel } from './ui-level.js';
import type { UiExtensionDefinition } from './registry.js';

export type UiComponentInstanceId = string;
export type UiComponentLifecycle = 'created' | 'mounted' | 'unmounted' | 'disposed';

/** Binding contract declared by a reusable component definition. */
export interface UiComponentBindingRequirement {
  readonly kinds?: ReadonlySet<string>;
  readonly writable?: boolean;
}

export interface UiComponentCreateContext<TBinding extends CtxBinding = CtxBinding> {
  readonly id: UiComponentInstanceId;
  readonly level: UiLevel;
  readonly context: UiContext;
  readonly binding: TBinding;
}

export interface UiComponentController {
  mount?(): void;
  unmount?(): void;
  dispose?(): void;
}

/**
 * Trusted TypeScript component implementation registered by stable id.
 * Metadata selects this definition; it never carries executable callbacks.
 */
export interface UiComponentDefinition<
  TBinding extends CtxBinding = CtxBinding,
> extends UiExtensionDefinition {
  readonly binding?: UiComponentBindingRequirement;
  create(context: UiComponentCreateContext<TBinding>): UiComponentController;
}

/** One live component owned by one UiLevel/view materialization. */
export class UiComponentInstance<TBinding extends CtxBinding = CtxBinding> {
  readonly controller: UiComponentController;
  #lifecycle: UiComponentLifecycle = 'created';
  readonly #disposers = new Set<() => void>();

  constructor(
    readonly id: UiComponentInstanceId,
    readonly level: UiLevel,
    readonly context: UiContext,
    readonly definition: UiComponentDefinition<TBinding>,
    readonly binding: TBinding,
  ) {
    assertComponentBindingCompatibility(definition, binding);
    this.controller = definition.create({ id, level, context, binding });
  }

  get lifecycle(): UiComponentLifecycle {
    return this.#lifecycle;
  }

  own(disposer: () => void): () => void {
    if (this.#lifecycle === 'disposed') throw new Error(`UI component is disposed: ${this.id}`);
    this.#disposers.add(disposer);
    return () => this.#disposers.delete(disposer);
  }

  mount(): void {
    if (this.#lifecycle === 'disposed') throw new Error(`UI component is disposed: ${this.id}`);
    if (this.#lifecycle === 'mounted') return;
    this.controller.mount?.();
    this.#lifecycle = 'mounted';
  }

  unmount(): void {
    if (this.#lifecycle !== 'mounted') return;
    this.controller.unmount?.();
    this.#lifecycle = 'unmounted';
  }

  dispose(): void {
    if (this.#lifecycle === 'disposed') return;
    this.unmount();
    for (const disposer of [...this.#disposers].reverse()) disposer();
    this.#disposers.clear();
    this.controller.dispose?.();
    this.#lifecycle = 'disposed';
  }
}

export function assertComponentBindingCompatibility(
  definition: UiComponentDefinition,
  binding: CtxBinding,
): void {
  const requirement = definition.binding;
  if (!requirement) return;
  if (requirement.kinds && !requirement.kinds.has(binding.kind)) {
    throw new Error(
      `UI component ${definition.id} requires binding kind ${[...requirement.kinds].join(' or ')}; received ${binding.kind}.`,
    );
  }
  if (requirement.writable === true && !binding.writable) {
    throw new Error(`UI component ${definition.id} requires a writable binding.`);
  }
}
