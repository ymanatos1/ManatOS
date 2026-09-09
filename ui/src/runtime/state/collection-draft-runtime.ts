import type { EntryAggregateStateRuntime } from './entry-aggregate-state-runtime.js';

export interface CollectionDraftSnapshot<T> {
  readonly original: readonly T[];
  readonly current: readonly T[];
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly editing: boolean;
}

export interface CollectionDraftRuntimeOptions<T> {
  readonly id: string;
  readonly values?: readonly T[];
  readonly aggregate?: EntryAggregateStateRuntime;
  readonly validate?: (values: readonly T[]) => boolean;
}

/**
 * Host-neutral semantic state for an embedded collection editor.
 *
 * Collection values are not canonical fields of the owning entity, therefore
 * they must not be inserted into EntryStateRuntime. The collection owns its
 * baseline/current values and contributes dirty/valid/blocked state to the
 * entry aggregate. Rendering and persistence payload serialization remain
 * composition concerns layered above this runtime.
 */
export class CollectionDraftRuntime<T> {
  readonly #id: string;
  readonly #aggregate: EntryAggregateStateRuntime | undefined;
  readonly #validate: (values: readonly T[]) => boolean;
  #original: T[];
  #current: T[];
  #editing = false;

  constructor(options: CollectionDraftRuntimeOptions<T>) {
    this.#id = options.id;
    this.#aggregate = options.aggregate;
    this.#validate = options.validate ?? (() => true);
    this.#original = this.#clone(options.values ?? []);
    this.#current = this.#clone(options.values ?? []);
    this.#sync();
  }

  snapshot(): CollectionDraftSnapshot<T> {
    return Object.freeze({
      original: Object.freeze(this.#clone(this.#original)),
      current: Object.freeze(this.#clone(this.#current)),
      dirty: this.#dirty(),
      valid: this.#validate(this.#current),
      editing: this.#editing,
    });
  }

  replace(values: readonly T[]): void {
    this.#current = this.#clone(values);
    this.#sync();
  }

  setEditing(editing: boolean): void {
    this.#editing = editing;
    this.#sync();
  }

  commitBaseline(): void {
    this.#original = this.#clone(this.#current);
    this.#sync();
  }

  reset(): void {
    this.#current = this.#clone(this.#original);
    this.#editing = false;
    this.#sync();
  }

  dispose(): void {
    this.#aggregate?.removeContributor(this.#id);
  }

  #dirty(): boolean {
    return JSON.stringify(this.#current) !== JSON.stringify(this.#original);
  }

  #sync(): void {
    this.#aggregate?.setContributor({
      id: this.#id,
      dirty: this.#dirty(),
      valid: this.#validate(this.#current),
      blocksPersistence: this.#editing,
    });
  }

  #clone(values: readonly T[]): T[] {
    return values.map((value) =>
      value && typeof value === 'object' ? structuredClone(value) : value,
    );
  }
}
