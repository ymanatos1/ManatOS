export interface CollectionResourceInput<T = unknown> {
  readonly rows: readonly T[];
  readonly references: Readonly<Record<string, readonly unknown[]>>;
}

export interface CollectionResourceSnapshot<T = unknown> {
  readonly original: readonly T[];
  readonly current: readonly T[];
  readonly references: Readonly<Record<string, readonly unknown[]>>;
}

const cloneValue = <T>(value: T): T =>
  value && typeof value === 'object' ? structuredClone(value) : value;

const cloneValues = <T>(values: readonly T[]): T[] => values.map((value) => cloneValue(value));

/**
 * Snapshot the one authoritative row projection selected for each metadata-
 * declared collection resource.
 *
 * Read/query rows versus editable working rows are resolved by the collection
 * loader, where the component metadata is known. The CTX projection boundary
 * deliberately receives only one row shape per source key; it must never infer
 * ownership by comparing or prioritizing competing presentation buffers.
 */
export function projectCollectionResources(
  collectionData: Readonly<Record<string, CollectionResourceInput>>,
): Readonly<Record<string, CollectionResourceSnapshot>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(collectionData).map(([key, source]) => [
        key,
        Object.freeze({
          original: Object.freeze(cloneValues(source.rows ?? [])),
          current: Object.freeze(cloneValues(source.rows ?? [])),
          references: Object.freeze(
            Object.fromEntries(
              Object.entries(source.references ?? {}).map(([fieldKey, values]) => [
                fieldKey,
                Object.freeze(cloneValues(values ?? [])),
              ]),
            ),
          ),
        }),
      ]),
    ),
  );
}
