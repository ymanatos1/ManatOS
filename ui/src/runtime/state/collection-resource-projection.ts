export interface CollectionResourceSnapshot<T = unknown> {
  readonly original: readonly T[];
  readonly current: readonly T[];
}

const cloneValue = <T>(value: T): T =>
  value && typeof value === 'object' ? structuredClone(value) : value;

const cloneValues = <T>(values: readonly T[]): T[] => values.map((value) => cloneValue(value));

/**
 * Project metadata-declared related collections into the canonical V2 resource
 * channel used by both read-only collections and editable collection drafts.
 *
 * `relatedData` is the rendered/query result. When an editor exposes a richer
 * canonical working representation through `editingData`, that representation
 * wins for the same source key. This keeps one V2 CTX location for collection
 * state without leaking relationship/component values into `entry.current`.
 */
export function projectCollectionResources(
  relatedData: Readonly<Record<string, readonly unknown[]>>,
  editingData: Readonly<Record<string, readonly unknown[]>>,
): Readonly<Record<string, CollectionResourceSnapshot>> {
  const keys = new Set([...Object.keys(relatedData), ...Object.keys(editingData)]);

  return Object.freeze(
    Object.fromEntries(
      [...keys].map((key) => {
        const source = Object.prototype.hasOwnProperty.call(editingData, key)
          ? (editingData[key] ?? [])
          : (relatedData[key] ?? []);
        return [
          key,
          Object.freeze({
            original: Object.freeze(cloneValues(source)),
            current: Object.freeze(cloneValues(source)),
          }),
        ];
      }),
    ),
  );
}
