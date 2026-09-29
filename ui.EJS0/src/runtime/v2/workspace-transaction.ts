import { semanticEqual } from './dirty.js';

export type UiWorkspaceIdentityKind = 'persistent' | 'workspace';
export type UiWorkspaceMutationOperation = 'create' | 'update' | 'delete';

export interface UiWorkspaceReference {
  /** Semantic field/relationship slot on the owning mutation. */
  readonly key: string;
  readonly entityKey: string;
  readonly identity: string;
  readonly identityKind: UiWorkspaceIdentityKind;
}

export interface UiWorkspaceRecordMutation {
  readonly mutationId: string;
  readonly entityKey: string;
  readonly identity: string;
  readonly identityKind: UiWorkspaceIdentityKind;
  readonly operation: UiWorkspaceMutationOperation;
  /** Baseline captured when an existing record entered the workspace. */
  readonly original: Readonly<Record<string, unknown>> | null;
  /** Current semantic working record. Null only for a delete mutation. */
  readonly current: Readonly<Record<string, unknown>> | null;
  /** Baseline concurrency token retained for later field-aware conflict handling. */
  readonly baselineUpdatedAt?: unknown;
  /** Existing-record fields changed inside this workspace; never inferred at Commit time. */
  readonly changedFields?: readonly string[];
  /** Semantic references, including references to records that only have workspace identities. */
  readonly references?: readonly UiWorkspaceReference[];
  /** Parent-owned aggregate payloads (for example Principal contact collections). */
  readonly collections?: Readonly<
    Record<
      string,
      {
        readonly original: readonly unknown[];
        readonly current: readonly unknown[];
      }
    >
  >;
  /**
   * Recursively owned entity mutations. A child may itself own further mutations;
   * there is deliberately no architectural depth limit.
   */
  readonly children?: readonly UiWorkspaceRecordMutation[];
}

/** Generic semantic transaction state owned by a long-lived workspace. */
export interface UiWorkspaceTransactionSnapshot {
  readonly version: 1;
  readonly mutations: readonly UiWorkspaceRecordMutation[];
}

export const emptyWorkspaceTransaction = (): UiWorkspaceTransactionSnapshot => ({
  version: 1,
  mutations: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const recordOrNull = (value: unknown): Readonly<Record<string, unknown>> | null =>
  isRecord(value) ? { ...value } : null;

const identityKind = (value: unknown): UiWorkspaceIdentityKind | null =>
  value === 'persistent' || value === 'workspace' ? value : null;

const operation = (value: unknown): UiWorkspaceMutationOperation | null =>
  value === 'create' || value === 'update' || value === 'delete' ? value : null;

const normalizeReference = (value: unknown): UiWorkspaceReference | null => {
  if (!isRecord(value)) return null;
  const kind = identityKind(value.identityKind);
  if (
    typeof value.key !== 'string' ||
    typeof value.entityKey !== 'string' ||
    typeof value.identity !== 'string' ||
    !kind
  )
    return null;
  return {
    key: value.key,
    entityKey: value.entityKey,
    identity: value.identity,
    identityKind: kind,
  };
};

const normalizeCollections = (
  value: unknown,
): UiWorkspaceRecordMutation['collections'] | undefined => {
  if (!isRecord(value)) return undefined;
  const normalized: Record<
    string,
    {
      original: readonly unknown[];
      current: readonly unknown[];
    }
  > = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (
      !isRecord(candidate) ||
      !Array.isArray(candidate.original) ||
      !Array.isArray(candidate.current)
    )
      continue;
    normalized[key] = {
      original: structuredClone(candidate.original),
      current: structuredClone(candidate.current),
    };
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeMutation = (value: unknown): UiWorkspaceRecordMutation | null => {
  if (!isRecord(value)) return null;
  const kind = identityKind(value.identityKind);
  const mutationOperation = operation(value.operation);
  if (
    typeof value.mutationId !== 'string' ||
    typeof value.entityKey !== 'string' ||
    typeof value.identity !== 'string' ||
    !kind ||
    !mutationOperation
  )
    return null;

  const original = recordOrNull(value.original);
  const current = recordOrNull(value.current);
  if (mutationOperation === 'create' && !current) return null;
  if (mutationOperation === 'update' && (!original || !current)) return null;
  if (mutationOperation === 'delete' && !original) return null;

  const children = Array.isArray(value.children)
    ? value.children
        .map(normalizeMutation)
        .filter((item): item is UiWorkspaceRecordMutation => !!item)
    : [];
  const references = Array.isArray(value.references)
    ? value.references
        .map(normalizeReference)
        .filter((item): item is UiWorkspaceReference => !!item)
    : [];
  const changedFields = Array.isArray(value.changedFields)
    ? [
        ...new Set(
          value.changedFields.filter((field): field is string => typeof field === 'string'),
        ),
      ]
    : mutationOperation === 'update'
      ? changedFieldKeys(original!, current!)
      : undefined;
  const collections = normalizeCollections(value.collections);

  return {
    mutationId: value.mutationId,
    entityKey: value.entityKey,
    identity: value.identity,
    identityKind: kind,
    operation: mutationOperation,
    original,
    current: mutationOperation === 'delete' ? null : current,
    ...(Object.hasOwn(value, 'baselineUpdatedAt')
      ? { baselineUpdatedAt: value.baselineUpdatedAt }
      : {}),
    ...(changedFields ? { changedFields } : {}),
    ...(references.length ? { references } : {}),
    ...(collections ? { collections } : {}),
    ...(children.length ? { children } : {}),
  };
};

export const changedFieldKeys = (
  original: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
): readonly string[] =>
  [...new Set([...Object.keys(original), ...Object.keys(current)])].filter(
    (key) => !semanticEqual(original[key], current[key]),
  );

export const normalizeWorkspaceTransaction = (value: unknown): UiWorkspaceTransactionSnapshot => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.mutations))
    return emptyWorkspaceTransaction();
  return {
    version: 1,
    mutations: value.mutations
      .map(normalizeMutation)
      .filter((item): item is UiWorkspaceRecordMutation => !!item),
  };
};

/** Depth-first semantic mutation sequence used by reporting/planning without flattening ownership. */
export const flattenWorkspaceMutations = (
  snapshot: UiWorkspaceTransactionSnapshot | unknown,
): readonly UiWorkspaceRecordMutation[] => {
  const normalized = normalizeWorkspaceTransaction(snapshot);
  const result: UiWorkspaceRecordMutation[] = [];
  const visit = (mutation: UiWorkspaceRecordMutation): void => {
    result.push(mutation);
    for (const child of mutation.children ?? []) visit(child);
  };
  for (const mutation of normalized.mutations) visit(mutation);
  return result;
};

const replaceRecursive = (
  mutations: readonly UiWorkspaceRecordMutation[],
  mutation: UiWorkspaceRecordMutation,
  parentMutationId: string | null,
): { readonly mutations: readonly UiWorkspaceRecordMutation[]; readonly foundParent: boolean } => {
  if (!parentMutationId) {
    return {
      mutations: [...mutations.filter((item) => item.mutationId !== mutation.mutationId), mutation],
      foundParent: true,
    };
  }
  let foundParent = false;
  const next = mutations.map((item) => {
    if (item.mutationId === parentMutationId) {
      foundParent = true;
      return {
        ...item,
        children: [
          ...(item.children ?? []).filter((child) => child.mutationId !== mutation.mutationId),
          mutation,
        ],
      };
    }
    const nested = replaceRecursive(item.children ?? [], mutation, parentMutationId);
    if (!nested.foundParent) return item;
    foundParent = true;
    return { ...item, children: nested.mutations };
  });
  return { mutations: next, foundParent };
};

export const upsertWorkspaceMutation = (
  snapshot: UiWorkspaceTransactionSnapshot | unknown,
  mutation: UiWorkspaceRecordMutation,
  parentMutationId: string | null = null,
): UiWorkspaceTransactionSnapshot => {
  const normalized = normalizeWorkspaceTransaction(snapshot);
  const normalizedMutation = normalizeMutation(mutation);
  if (!normalizedMutation) throw new Error('Invalid workspace mutation.');
  const withoutExisting = removeRecursive(normalized.mutations, normalizedMutation.mutationId);
  const next = replaceRecursive(withoutExisting, normalizedMutation, parentMutationId);
  if (!next.foundParent)
    throw new Error(`Workspace mutation parent '${parentMutationId}' was not found.`);
  return { version: 1, mutations: next.mutations };
};

const removeRecursive = (
  mutations: readonly UiWorkspaceRecordMutation[],
  mutationId: string,
): readonly UiWorkspaceRecordMutation[] =>
  mutations
    .filter((item) => item.mutationId !== mutationId)
    .map((item) => {
      const existingChildren = item.children ?? [];
      const children = removeRecursive(existingChildren, mutationId);
      const changed =
        children.some((child, index) => child !== existingChildren[index]) ||
        children.length !== existingChildren.length;
      return changed ? { ...item, children } : item;
    });

export const parentMutationIdFor = (
  mutations: readonly UiWorkspaceRecordMutation[],
  mutationId: string,
  parentMutationId: string | null = null,
): string | null | undefined => {
  for (const mutation of mutations) {
    if (mutation.mutationId === mutationId) return parentMutationId;
    const nested = parentMutationIdFor(mutation.children ?? [], mutationId, mutation.mutationId);
    if (nested !== undefined) return nested;
  }
  return undefined;
};

export const removeWorkspaceMutation = (
  snapshot: UiWorkspaceTransactionSnapshot | unknown,
  mutationId: string,
): UiWorkspaceTransactionSnapshot => {
  const normalized = normalizeWorkspaceTransaction(snapshot);
  return { version: 1, mutations: removeRecursive(normalized.mutations, mutationId) };
};
