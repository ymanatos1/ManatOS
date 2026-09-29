import type { UiContext, UiCtxChange } from './ui-context.js';

export type UiDirtyListener = (dirty: boolean, change?: UiCtxChange) => void;
export type UiDirtyEvaluator = (context: UiContext) => boolean;

export interface UiDirtyRuntimeOptions {
  /** Optional surface-specific semantic evaluator. Entry semantics remain the default. */
  readonly evaluate?: UiDirtyEvaluator;
}

/**
 * Canonical dirty-state owner for one semantic UiLevel.
 *
 * Entry surfaces use the built-in entry/current + collections evaluator. Other semantic surfaces
 * may supply an evaluator while retaining the same single state.dirty projection contract.
 * Components and views never own independent dirty flags.
 */
export class UiDirtyRuntime {
  #disposeSubscription: (() => void) | null = null;

  constructor(
    readonly context: UiContext,
    readonly options: UiDirtyRuntimeOptions = {},
  ) {}

  evaluate(): boolean {
    if (this.options.evaluate) return this.options.evaluate(this.context);
    if (
      !semanticEqual(
        this.context.get('data.entry.current'),
        this.context.get('data.entry.original'),
      )
    ) {
      return true;
    }
    const collections = this.context.get('data.collections');
    if (!collections || typeof collections !== 'object' || Array.isArray(collections)) return false;
    return Object.values(collections as Record<string, unknown>).some((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const collection = value as Record<string, unknown>;
      return !semanticEqual(collection.current, collection.original);
    });
  }

  refresh(cause = 'dirty-runtime:refresh'): boolean {
    const dirty = this.evaluate();
    if (this.context.get('state.dirty') !== dirty) {
      this.context.replace('state.dirty', dirty, { source: cause });
    }
    return dirty;
  }

  start(listener?: UiDirtyListener): void {
    if (this.#disposeSubscription || !this.context.port.subscribe) return;
    this.refresh('dirty-runtime:start');
    const releases = [
      this.context.subscribe(
        'data.entry.current',
        (change) => {
          const dirty = this.refresh('dirty-runtime:current-change');
          listener?.(dirty, change);
        },
        { kind: 'dirty', label: 'data.entry.current' },
      ),
      this.context.subscribe(
        'data.collections',
        (change) => {
          const dirty = this.refresh('dirty-runtime:collection-change');
          listener?.(dirty, change);
        },
        { kind: 'dirty', label: 'data.collections' },
      ),
    ];
    this.#disposeSubscription = () => releases.forEach((release) => release());
  }

  dispose(): void {
    this.#disposeSubscription?.();
    this.#disposeSubscription = null;
  }
}

/** Structural semantic equality for CTX-compatible values; object key order is irrelevant. */
export function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => semanticEqual(value, right[index]));
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject);
  const rightKeys = Object.keys(rightObject);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightObject, key) &&
      semanticEqual(leftObject[key], rightObject[key]),
  );
}
