import {
  changedFieldKeys,
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
  type UiWorkspaceRecordMutation,
  type UiWorkspaceReference,
  type UiWorkspaceTransactionSnapshot,
} from './workspace-transaction.js';

export type UiCommitOperationKind = 'create' | 'update' | 'delete';

export interface UiCommitPlanOperation {
  readonly operationId: string;
  readonly entityKey: string;
  readonly identity: string;
  readonly identityKind: 'persistent' | 'workspace';
  readonly kind: UiCommitOperationKind;
  readonly original: Readonly<Record<string, unknown>> | null;
  readonly current: Readonly<Record<string, unknown>> | null;
  readonly changedFields: readonly string[];
  readonly references: readonly UiWorkspaceReference[];
  readonly collections?: UiWorkspaceRecordMutation['collections'];
  readonly dependsOn: readonly string[];
}

export interface UiWorkspaceCommitPlan {
  readonly version: 1;
  readonly rootEntityKey: string;
  readonly identityField: string;
  /** Immutable complete root aggregate snapshots used by the atomic hierarchy executor. */
  readonly rootSnapshot: {
    readonly entries: readonly Readonly<Record<string, unknown>>[];
    readonly entriesOriginal: readonly Readonly<Record<string, unknown>>[];
  };
  readonly operations: readonly UiCommitPlanOperation[];
  /** Validated dependency order. Execution MUST use this sequence. */
  readonly executionOrder: readonly string[];
}

export interface UiWorkspaceCommitPlanInput {
  readonly rootEntityKey: string;
  readonly identityField: string;
  readonly entries: readonly Readonly<Record<string, unknown>>[];
  readonly entriesOriginal: readonly Readonly<Record<string, unknown>>[];
  readonly workspaceTransaction?: UiWorkspaceTransactionSnapshot | unknown;
}

const cloneRecord = (value: Readonly<Record<string, unknown>> | null) =>
  value ? structuredClone(value) : null;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

const rootOperations = (input: UiWorkspaceCommitPlanInput): UiCommitPlanOperation[] => {
  const originalById = new Map(
    input.entriesOriginal.map((row) => [String(row[input.identityField] ?? ''), row] as const),
  );
  const currentIds = new Set(input.entries.map((row) => String(row[input.identityField] ?? '')));
  const rootMutationByIdentity = new Map(
    flattenWorkspaceMutations(input.workspaceTransaction)
      .filter((mutation) => mutation.entityKey === input.rootEntityKey)
      .map((mutation) => [mutation.identity, mutation] as const),
  );
  const operations: UiCommitPlanOperation[] = [];
  for (const row of input.entries) {
    const identity = String(row[input.identityField] ?? '');
    if (!identity) continue;
    const original = originalById.get(identity) ?? null;
    const workspaceMutation = rootMutationByIdentity.get(identity);
    const kind: UiCommitOperationKind =
      workspaceMutation?.operation === 'create' || !original ? 'create' : 'update';
    const changedFields = original ? changedFieldKeys(original, row) : Object.keys(row);
    if (kind === 'update' && !changedFields.length) continue;
    operations.push({
      operationId: `root:${kind}:${identity}`,
      entityKey: input.rootEntityKey,
      identity,
      identityKind: workspaceMutation?.identityKind ?? (original ? 'persistent' : 'workspace'),
      kind,
      original: cloneRecord(original),
      current: cloneRecord(row),
      changedFields,
      references: [],
      dependsOn: [],
    });
  }
  for (const row of input.entriesOriginal) {
    const identity = String(row[input.identityField] ?? '');
    if (!identity || currentIds.has(identity)) continue;
    operations.push({
      operationId: `root:delete:${identity}`,
      entityKey: input.rootEntityKey,
      identity,
      identityKind: 'persistent',
      kind: 'delete',
      original: cloneRecord(row),
      current: null,
      changedFields: [],
      references: [],
      dependsOn: [],
    });
  }
  return operations;
};

const mutationOperation = (mutation: UiWorkspaceRecordMutation): UiCommitPlanOperation => ({
  operationId: `mutation:${mutation.mutationId}`,
  entityKey: mutation.entityKey,
  identity: mutation.identity,
  identityKind: mutation.identityKind,
  kind: mutation.operation,
  original: cloneRecord(mutation.original),
  current: cloneRecord(mutation.current),
  changedFields:
    mutation.operation === 'update'
      ? [...(mutation.changedFields ?? changedFieldKeys(mutation.original!, mutation.current!))]
      : mutation.operation === 'create'
        ? Object.keys(mutation.current ?? {})
        : [],
  references: structuredClone(mutation.references ?? []),
  ...(mutation.collections ? { collections: structuredClone(mutation.collections) } : {}),
  dependsOn: [],
});

/**
 * Build the immutable persistence authority reviewed by the user and later executed.
 * Workspace references become dependency edges; identity providers are created first.
 */
export const buildWorkspaceCommitPlan = (
  input: UiWorkspaceCommitPlanInput,
): UiWorkspaceCommitPlan => {
  const transaction = normalizeWorkspaceTransaction(input.workspaceTransaction);
  const roots = rootOperations(input);
  const rootByIdentity = new Map<string, UiCommitPlanOperation>(
    roots.map((operation) => [`${operation.entityKey}:${operation.identity}`, operation]),
  );
  const operations = [...roots];
  for (const mutation of flattenWorkspaceMutations(transaction).map(mutationOperation)) {
    const key = `${mutation.entityKey}:${mutation.identity}`;
    const root = rootByIdentity.get(key);
    if (!root) {
      operations.push(mutation);
      continue;
    }
    // The live Organization workspace intentionally retains edits for members that
    // are later removed so restoring them can recover those edits. Persistence is
    // based on final state, though: deleting an existing root member dominates any
    // retained update mutation for that same persistent record.
    if (
      root.kind === 'delete' &&
      root.identityKind === 'persistent' &&
      mutation.kind === 'update' &&
      mutation.identityKind === 'persistent'
    ) {
      continue;
    }
    if (root.kind !== mutation.kind || root.identityKind !== mutation.identityKind) {
      throw new Error(`CommitPlan has contradictory root/workspace operation '${key}'.`);
    }
    const index = operations.indexOf(root);
    const current = root.current
      ? { ...(mutation.current ?? {}), ...root.current }
      : mutation.current;
    operations[index] = {
      ...root,
      original: root.original ?? mutation.original,
      current: cloneRecord(current),
      changedFields: [...new Set([...root.changedFields, ...mutation.changedFields])].sort(),
      references: structuredClone(mutation.references),
      ...(mutation.collections ? { collections: structuredClone(mutation.collections) } : {}),
    };
  }
  const workspaceProvider = new Map<string, UiCommitPlanOperation>();
  for (const operation of operations) {
    if (operation.identityKind !== 'workspace' || operation.kind !== 'create') continue;
    const key = `${operation.entityKey}:${operation.identity}`;
    if (workspaceProvider.has(key))
      throw new Error(`CommitPlan has duplicate workspace identity '${key}'.`);
    workspaceProvider.set(key, operation);
  }

  const withDependencies = operations.map((operation) => {
    const dependencies = new Set<string>();
    // Root hierarchy rows predate explicit UiWorkspaceReference descriptors. Match
    // only exact known workspace identities; this is identity resolution, not a
    // field-name/relationship heuristic, and guarantees parent drafts are created first.
    for (const value of Object.values(operation.current ?? {})) {
      if (typeof value !== 'string') continue;
      const provider = workspaceProvider.get(`${operation.entityKey}:${value}`);
      if (provider && provider.operationId !== operation.operationId)
        dependencies.add(provider.operationId);
    }
    for (const reference of operation.references) {
      if (reference.identityKind !== 'workspace') continue;
      const provider = workspaceProvider.get(`${reference.entityKey}:${reference.identity}`);
      if (!provider)
        throw new Error(
          `CommitPlan reference '${reference.key}' targets unresolved workspace identity '${reference.entityKey}:${reference.identity}'.`,
        );
      if (provider.operationId !== operation.operationId) dependencies.add(provider.operationId);
    }
    return { ...operation, dependsOn: [...dependencies].sort() };
  });

  const byId = new Map(withDependencies.map((operation) => [operation.operationId, operation]));
  const pending = new Set(byId.keys());
  const executionOrder: string[] = [];
  while (pending.size) {
    const ready = [...pending]
      .filter((id) => byId.get(id)!.dependsOn.every((dependency) => !pending.has(dependency)))
      .sort();
    if (!ready.length)
      throw new Error(
        `CommitPlan contains a cyclic dependency: ${[...pending].sort().join(', ')}.`,
      );
    for (const id of ready) {
      executionOrder.push(id);
      pending.delete(id);
    }
  }

  return deepFreeze({
    version: 1,
    rootEntityKey: input.rootEntityKey,
    identityField: input.identityField,
    rootSnapshot: {
      entries: structuredClone(input.entries),
      entriesOriginal: structuredClone(input.entriesOriginal),
    },
    operations: withDependencies,
    executionOrder,
  });
};

export const commitPlanReportModel = (
  plan: UiWorkspaceCommitPlan,
  options: { readonly blockers?: readonly string[] } = {},
) => {
  const entityGroups = new Map<string, UiCommitPlanOperation[]>();
  for (const operation of plan.operations) {
    const list = entityGroups.get(operation.entityKey) ?? [];
    list.push(operation);
    entityGroups.set(operation.entityKey, list);
  }
  const operationLabel = (kind: UiCommitOperationKind) =>
    kind === 'create' ? 'Create' : kind === 'delete' ? 'Delete' : 'Update';
  const operationIcon = (kind: UiCommitOperationKind) =>
    kind === 'create' ? 'bi-plus-circle' : kind === 'delete' ? 'bi-trash' : 'bi-pencil-square';
  const blockers = (options.blockers ?? []).filter((value) => String(value).trim());
  const nodes: Array<Record<string, unknown>> = [...entityGroups.entries()].map(
    ([entityKey, entityOperations]) => ({
      entityKey,
      label: entityKey,
      count: entityOperations.length,
      icon: 'bi-database',
      expanded: true,
      children: (['create', 'update', 'delete'] as const)
        .map((kind) => {
          const matching = entityOperations.filter((operation) => operation.kind === kind);
          return matching.length
            ? {
                label: operationLabel(kind),
                count: matching.length,
                icon: operationIcon(kind),
                severity: kind === 'delete' ? 'danger' : kind === 'create' ? 'success' : undefined,
                expanded: true,
                children: matching.map((operation) => ({
                  label: operation.identity,
                  status: operation.kind,
                  identity: operation.identity,
                  identityKind: operation.identityKind,
                  entryRecord: operation.current ?? operation.original ?? {},
                  references: operation.references,
                  icon: operationIcon(kind),
                  severity: kind === 'delete' ? 'danger' : undefined,
                  expanded: true,
                  details:
                    kind === 'update'
                      ? operation.changedFields.map((field) => ({
                          fieldKey: field,
                          label: field,
                          from: {
                            label: operation.original?.[field] ?? '∅',
                            rawValue: operation.original?.[field],
                          },
                          to: {
                            label: operation.current?.[field] ?? '∅',
                            rawValue: operation.current?.[field],
                          },
                        }))
                      : kind === 'create'
                        ? operation.changedFields
                            .filter((field) => {
                              if (field === plan.identityField) return false;
                              const value = operation.current?.[field];
                              return value !== null && value !== undefined && String(value) !== '';
                            })
                            .map((field) => ({
                              fieldKey: field,
                              label: field,
                              value: {
                                label: operation.current?.[field],
                                rawValue: operation.current?.[field],
                              },
                            }))
                        : [],
                })),
              }
            : null;
        })
        .filter(Boolean),
    }),
  );
  if (blockers.length) {
    nodes.unshift({
      label: 'Incomplete organization',
      status: blockers.join(' '),
      icon: 'bi-exclamation-triangle',
      severity: 'warning',
      expanded: true,
      children: [],
    });
  }
  return {
    summary: `${plan.operations.length} ${plan.operations.length === 1 ? 'operation' : 'operations'} ${blockers.length ? 'are pending; Commit is currently unavailable.' : 'will be committed.'}`,
    nodes,
  };
};
