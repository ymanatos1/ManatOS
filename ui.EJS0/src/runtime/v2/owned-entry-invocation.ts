import {
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
  type UiWorkspaceRecordMutation,
  type UiWorkspaceTransactionSnapshot,
} from './workspace-transaction.js';

export interface UiOwnedEntryInvocation {
  readonly version: 1;
  readonly entityKey: string;
  readonly identity: string;
  readonly identityField: string;
  readonly current: Readonly<Record<string, unknown>>;
  readonly original: Readonly<Record<string, unknown>> | null;
  readonly existingMutation?: UiWorkspaceRecordMutation;
  readonly parentMutationId?: string | null;
  /** Workspace identities are facts needed to classify semantic references on Save. */
  readonly workspaceIdentities: readonly string[];
  /** Private resources referenced by this child state; copied at the owned Open boundary. */
  readonly runtimeResources?: Readonly<Record<string, unknown>>;
}

const parentMutationIdFor = (
  mutations: readonly UiWorkspaceRecordMutation[],
  mutationId: string,
  parentId: string | null = null,
): string | null | undefined => {
  for (const mutation of mutations) {
    if (mutation.mutationId === mutationId) return parentId;
    const nested = parentMutationIdFor(mutation.children ?? [], mutationId, mutation.mutationId);
    if (nested !== undefined) return nested;
  }
  return undefined;
};

/**
 * Materialize the semantic state required by one owned Entry without transferring
 * ownership of the caller's aggregate transaction. The caller remains authoritative;
 * the child receives only its own current/original state and reference facts.
 */
export function ownedEntryInvocation(
  entityKey: string,
  identity: string,
  identityField: string,
  entries: readonly Readonly<Record<string, unknown>>[],
  originalEntries: readonly Readonly<Record<string, unknown>>[],
  transaction: UiWorkspaceTransactionSnapshot | unknown,
  rootEntityKey: string = entityKey,
  runtimeResources: Readonly<Record<string, unknown>> = {},
): UiOwnedEntryInvocation {
  const normalized = normalizeWorkspaceTransaction(transaction);
  const mutations = flattenWorkspaceMutations(normalized);
  const existingMutation = mutations.find(
    (mutation) => mutation.entityKey === entityKey && mutation.identity === identity,
  );

  /*
   * Root hierarchy members live in entries/originalEntries. Heterogeneous owned
   * descendants (User today, any entity later) live only in workspaceTransaction.
   * Resolve both through the same invocation boundary so nested Entry opening does
   * not require entity-specific owner stores. Root entries remain authoritative
   * when present; transaction current/original is the external-entry fallback.
   */
  const rootCurrent =
    entityKey === rootEntityKey
      ? entries.find((entry) => String(entry[identityField] ?? '') === identity)
      : undefined;
  const current = rootCurrent ?? existingMutation?.current ?? null;
  if (!current)
    throw new Error(`Owned entry '${entityKey}:${identity}' was not found in its owner.`);
  const rootOriginal =
    originalEntries.find((entry) => String(entry[identityField] ?? '') === identity) ?? null;
  const original = rootCurrent ? rootOriginal : (existingMutation?.original ?? null);
  const parentMutationId = existingMutation
    ? (parentMutationIdFor(normalized.mutations, existingMutation.mutationId) ?? null)
    : null;
  const workspaceIdentities = mutations
    .filter((mutation) => mutation.identityKind === 'workspace')
    .map((mutation) => `${mutation.entityKey}:${mutation.identity}`);
  const referenced = new Set<string>();
  const required = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    const resourceId = String(record.id ?? record.revision ?? '');
    if (resourceId && typeof record.contentType === 'string') {
      const key = `picture:${resourceId}`;
      referenced.add(key);
      if (record.pending === true) required.add(key);
    }
    Object.values(record).forEach(visit);
  };
  // The child starts a fresh local editing baseline from the owner's accepted current.
  visit(current);
  const childResources = Object.fromEntries(
    [...referenced].flatMap((key) => {
      if (!Object.prototype.hasOwnProperty.call(runtimeResources, key)) {
        if (required.has(key))
          throw new Error(
            `Owned entry '${entityKey}:${identity}' is missing required runtime resource '${key}'.`,
          );
        // Persisted resources are fetched through the canonical server/API resource service
        // when the owner does not already hold their bytes.
        return [];
      }
      return [[key, structuredClone(runtimeResources[key])] as const];
    }),
  );

  return {
    version: 1,
    entityKey,
    identity,
    identityField,
    current: { ...current },
    original: original ? { ...original } : null,
    ...(existingMutation ? { existingMutation } : {}),
    parentMutationId,
    workspaceIdentities,
    ...(Object.keys(childResources).length ? { runtimeResources: childResources } : {}),
  };
}

export function normalizeOwnedEntryInvocation(value: unknown): UiOwnedEntryInvocation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.entityKey !== 'string' ||
    typeof candidate.identity !== 'string' ||
    typeof candidate.identityField !== 'string' ||
    !candidate.current ||
    typeof candidate.current !== 'object' ||
    Array.isArray(candidate.current)
  )
    return null;
  const existing = candidate.existingMutation;
  const normalizedExisting = existing
    ? flattenWorkspaceMutations({ version: 1, mutations: [existing] })[0]
    : undefined;
  return {
    version: 1,
    entityKey: candidate.entityKey,
    identity: candidate.identity,
    identityField: candidate.identityField,
    current: { ...(candidate.current as Record<string, unknown>) },
    original:
      candidate.original &&
      typeof candidate.original === 'object' &&
      !Array.isArray(candidate.original)
        ? { ...(candidate.original as Record<string, unknown>) }
        : null,
    ...(normalizedExisting ? { existingMutation: normalizedExisting } : {}),
    parentMutationId:
      typeof candidate.parentMutationId === 'string' ? candidate.parentMutationId : null,
    workspaceIdentities: Array.isArray(candidate.workspaceIdentities)
      ? candidate.workspaceIdentities.filter((item): item is string => typeof item === 'string')
      : [],
    ...(candidate.runtimeResources &&
    typeof candidate.runtimeResources === 'object' &&
    !Array.isArray(candidate.runtimeResources)
      ? { runtimeResources: structuredClone(candidate.runtimeResources as Record<string, unknown>) }
      : {}),
  };
}
