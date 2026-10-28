/**
 * UIS EFFECT DISPATCHER — typed, reusable Surface-side effect execution.
 *
 * Components interpret their own actions/inputs and return declarative intents.
 * The owning Surface registers the permitted effects and applies mutations.
 * Registry lookup is O(1); neither framework nor host switches on component kinds.
 * All handlers are explicit. Unregistered effects fail closed.
 */
import type { UiEmbeddedEffect } from './component.js';

export class UiEmbeddedEffectDispatcher<Effect extends UiEmbeddedEffect> {
  private readonly handlers = new Map<string, (effect: Effect) => void>();

  /** Each effect identity has exactly one authoritative Surface handler. */
  register<Kind extends Effect['type']>(
    kind: Kind,
    handler: (effect: Extract<Effect, { readonly type: Kind }>) => void,
  ): this {
    if (this.handlers.has(kind)) throw new Error(`Duplicate UIS effect handler: ${kind}`);
    this.handlers.set(kind, handler as (effect: Effect) => void);
    return this;
  }

  dispatch(effects: readonly Effect[]): void {
    for (const effect of effects) {
      const handler = this.handlers.get(effect.type);
      if (!handler) throw new Error(`Unregistered UIS effect: ${effect.type}`);
      handler(effect);
    }
  }
}
