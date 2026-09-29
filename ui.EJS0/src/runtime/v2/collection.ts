import type { UiContext } from './ui-context.js';

export type UiCollectionRow = Readonly<Record<string, unknown>>;

export type UiCollectionIdentityFields = readonly string[];

/**
 * Compare collection members by canonical record identity. Explicit identity
 * fields support value objects/composite keys; ordinary entity collections use
 * `id` by default. Missing identity values never make two draft rows equal.
 */
export function sameCollectionRowIdentity(
  left: UiCollectionRow,
  right: UiCollectionRow,
  identityFields: UiCollectionIdentityFields = ['id'],
): boolean {
  if (identityFields.length === 0) return false;
  return identityFields.every((field) => {
    const leftValue = left[field];
    const rightValue = right[field];
    return (
      leftValue !== null &&
      leftValue !== undefined &&
      rightValue !== null &&
      rightValue !== undefined &&
      Object.is(leftValue, rightValue)
    );
  });
}

/**
 * Parent-owned semantic collection draft. Collection editors and embedded child
 * levels mutate this canonical CTX state; they never persist members directly.
 */
export class EntityCollectionRuntime {
  constructor(
    readonly context: UiContext,
    readonly key: string,
  ) {}

  original(): readonly UiCollectionRow[] {
    return this.#rows('original');
  }

  current(): readonly UiCollectionRow[] {
    return this.#rows('current');
  }

  replace(rows: readonly UiCollectionRow[], source = 'collection-runtime:replace'): void {
    this.context.replace(`data.collections.${this.key}.current`, cloneRows(rows), { source });
  }

  add(row: UiCollectionRow, source = 'collection-runtime:add'): void {
    this.replace([...this.current(), structuredClone(row)], source);
  }

  /** Candidates a selector may still add to this parent-owned draft. */
  selectable(
    candidates: readonly UiCollectionRow[],
    identityFields: UiCollectionIdentityFields = ['id'],
  ): readonly UiCollectionRow[] {
    const current = this.current();
    return candidates.filter(
      (candidate) =>
        !current.some((row) => sameCollectionRowIdentity(row, candidate, identityFields)),
    );
  }

  /**
   * Add one selector result without allowing the same semantic member twice.
   * Returns false when that member is already present.
   */
  select(
    row: UiCollectionRow,
    identityFields: UiCollectionIdentityFields = ['id'],
    source = 'collection-runtime:select',
  ): boolean {
    if (
      this.current().some((candidate) => sameCollectionRowIdentity(candidate, row, identityFields))
    ) {
      return false;
    }
    this.add(row, source);
    return true;
  }

  update(
    predicate: (row: UiCollectionRow, index: number) => boolean,
    update: UiCollectionRow,
    source = 'collection-runtime:update',
  ): void {
    this.replace(
      this.current().map((row, index) =>
        predicate(row, index) ? { ...row, ...structuredClone(update) } : row,
      ),
      source,
    );
  }

  remove(
    predicate: (row: UiCollectionRow, index: number) => boolean,
    source = 'collection-runtime:remove',
  ): void {
    this.replace(
      this.current().filter((row, index) => !predicate(row, index)),
      source,
    );
  }

  promote(rows: readonly UiCollectionRow[] = this.current()): void {
    const authoritative = cloneRows(rows);
    this.context.replace(`data.collections.${this.key}.current`, cloneRows(authoritative), {
      source: 'collection-runtime:save-reconcile',
    });
    this.context.replace(`data.collections.${this.key}.original`, authoritative, {
      source: 'collection-runtime:save-baseline',
    });
  }

  #rows(kind: 'original' | 'current'): readonly UiCollectionRow[] {
    const value = this.context.get(`data.collections.${this.key}.${kind}`);
    if (!Array.isArray(value)) {
      throw new Error(`Collection '${this.key}' has no canonical ${kind} rows.`);
    }
    return value as readonly UiCollectionRow[];
  }
}

export function cloneRows(rows: readonly UiCollectionRow[]): UiCollectionRow[] {
  return structuredClone(rows) as UiCollectionRow[];
}
