/* eslint-disable @typescript-eslint/no-explicit-any */
import { semanticEqual } from './dirty.js';
import {
  flattenWorkspaceMutations,
  type UiWorkspaceRecordMutation,
} from './workspace-transaction.js';

export interface UiHierarchyChangeReportInput {
  readonly entityKey: string;
  readonly caption?: string;
  readonly identityField?: string;
  readonly entries: readonly Readonly<Record<string, unknown>>[];
  readonly entriesOriginal: readonly Readonly<Record<string, unknown>>[];
  readonly recycleBin?: readonly Readonly<Record<string, unknown>>[];
  readonly workspaceTransaction?: unknown;
  readonly ownerPath?: string | null;
}

export interface UiEntryChangeReportInput {
  readonly entityKey: string;
  readonly caption?: string;
  readonly current: Readonly<Record<string, unknown>>;
  readonly original: Readonly<Record<string, unknown>>;
  readonly ownerPath?: string | null;
  readonly identity?: string | null;
  readonly collections?: Readonly<
    Record<
      string,
      {
        readonly current?: readonly unknown[];
        readonly original?: readonly unknown[];
      }
    >
  >;
}

const browserWindow = globalThis as any;

export interface UiRecoveredFieldDeltaReportInput {
  readonly entityKey: string;
  readonly caption?: string;
  readonly fields: Readonly<
    Record<string, { readonly originalValue?: unknown; readonly restoredValue?: unknown }>
  >;
  readonly ownerPath?: string | null;
  readonly identity?: string | null;
}

/** Project a captured Entry recovery delta through the same semantic presentation catalogue. */
export const recoveredFieldDeltaReport = (input: UiRecoveredFieldDeltaReportInput) => {
  const semantic = browserWindow.ManatOS?.semanticChangePresentation;
  const details = Object.entries(input.fields).map(([fieldKey, change]) => ({
    fieldKey,
    label: semantic?.fieldLabel?.(input.entityKey, fieldKey) || fieldKey,
    ...(Object.prototype.hasOwnProperty.call(change || {}, 'originalValue')
      ? {
          from:
            semantic?.fieldDescriptor?.(
              input.entityKey,
              fieldKey,
              change?.originalValue,
              input.ownerPath ?? null,
              input.identity ?? null,
            ) ?? semantic?.descriptor?.(change?.originalValue),
          to:
            semantic?.fieldDescriptor?.(
              input.entityKey,
              fieldKey,
              change?.restoredValue,
              input.ownerPath ?? null,
              input.identity ?? null,
            ) ?? semantic?.descriptor?.(change?.restoredValue),
        }
      : {
          value:
            semantic?.fieldDescriptor?.(
              input.entityKey,
              fieldKey,
              change?.restoredValue,
              input.ownerPath ?? null,
              input.identity ?? null,
            ) ?? semantic?.descriptor?.(change?.restoredValue),
        }),
  }));
  return {
    summary: `${details.length} ${details.length === 1 ? 'change' : 'changes'} to recover.`,
    nodes: [
      {
        label: input.caption || 'Entry',
        count: details.length,
        icon: 'bi-file-earmark-check',
        expanded: true,
        details,
      },
    ],
  };
};

const entryPresentation = (
  entityKey: string,
  row: Readonly<Record<string, unknown>>,
  identityField: string,
  fallbackIdentity: string | null = null,
  ownerWorkspaceState = false,
  ownerPath: string | null = null,
) => {
  const semantic = browserWindow.ManatOS?.semanticChangePresentation;
  return (
    semantic?.entryDescriptor?.(entityKey, row, identityField, {
      ownerWorkspaceState,
      fallbackIdentity,
      ownerPath,
    }) ?? {
      label: fallbackIdentity || String(row[identityField] ?? 'Entry'),
      icons: [],
      ownerWorkspaceState,
    }
  );
};

const entryNodePresentation = (
  entityKey: string,
  row: Readonly<Record<string, unknown>>,
  identityField: string,
  fallbackIdentity: string | null = null,
  ownerWorkspaceState = false,
  ownerPath: string | null = null,
) => {
  const descriptor = entryPresentation(
    entityKey,
    row,
    identityField,
    fallbackIdentity,
    ownerWorkspaceState,
    ownerPath,
  );
  return { label: String(descriptor.label), entryDescriptor: descriptor };
};

const detailFor = (
  entityKey: string,
  fieldKey: string,
  before: unknown,
  after: unknown,
  ownerPath: string | null = null,
  identity: string | null = null,
) => {
  const semantic = browserWindow.ManatOS?.semanticChangePresentation;
  return (
    semantic?.changeDetail?.({ entityKey, fieldKey, before, after, ownerPath, identity }) ?? {
      fieldKey,
      label: semantic?.fieldLabel?.(entityKey, fieldKey) || fieldKey,
      from: { label: before == null || String(before) === '' ? '∅' : String(before) },
      to: { label: after == null || String(after) === '' ? '∅' : String(after) },
    }
  );
};

const valueDetailFor = (
  entityKey: string,
  fieldKey: string,
  value: unknown,
  ownerPath: string | null = null,
  identity: string | null = null,
) => {
  const semantic = browserWindow.ManatOS?.semanticChangePresentation;
  return {
    fieldKey,
    label: semantic?.fieldLabel?.(entityKey, fieldKey) || fieldKey,
    value: semantic?.fieldDescriptor?.(entityKey, fieldKey, value, ownerPath, identity) ??
      semantic?.referenceDescriptor?.(entityKey, fieldKey, value, ownerPath) ??
      semantic?.descriptor?.(value) ?? {
        label: value == null || String(value) === '' ? '∅' : String(value),
      },
  };
};

/** Build the semantic pending-change report for one canonical Entry UiLevel. */
export const entrySemanticChangeReport = (input: UiEntryChangeReportInput) => {
  const fields = [
    ...new Set([...Object.keys(input.original), ...Object.keys(input.current)]),
  ].filter((field) => !semanticEqual(input.original[field], input.current[field]));
  const collectionChanges = Object.entries(input.collections ?? {}).filter(
    ([, collection]) => !semanticEqual(collection.original ?? [], collection.current ?? []),
  );
  const children: any[] = [];
  if (fields.length) {
    children.push({
      label: 'Fields',
      count: fields.length,
      icon: 'bi-pencil-square',
      expanded: true,
      details: fields.map((field) =>
        detailFor(
          input.entityKey,
          field,
          input.original[field],
          input.current[field],
          input.ownerPath ?? null,
          input.identity ?? null,
        ),
      ),
    });
  }
  if (collectionChanges.length) {
    children.push({
      label: 'Related collections',
      count: collectionChanges.length,
      icon: 'bi-list-ul',
      expanded: true,
      children: collectionChanges.map(([key, collection]) => ({
        label: key,
        status: `${collection.original?.length ?? 0} → ${collection.current?.length ?? 0} entries`,
        icon: 'bi-list-check',
      })),
    });
  }
  const changeCount = fields.length + collectionChanges.length;
  return {
    summary: `${changeCount} ${changeCount === 1 ? 'change' : 'changes'} in this entry.`,
    nodes: [
      {
        label: input.caption || 'Entry',
        count: changeCount,
        icon: 'bi-pencil-square',
        expanded: true,
        children,
      },
    ],
  };
};

/**
 * Build a semantic "what changed" report for one hierarchy workspace.
 *
 * This deliberately does not build or validate a persistence CommitPlan. Dirty/change
 * reporting answers what differs from the workspace baseline; persistence planning is
 * a separate responsibility and may impose additional execution constraints.
 */
export const hierarchySemanticChangeReport = (input: UiHierarchyChangeReportInput) => {
  const identityField = input.identityField ?? 'id';
  const originals = new Map(
    input.entriesOriginal.map((row) => [String(row[identityField] ?? ''), row] as const),
  );
  const current = new Map(
    input.entries.map((row) => [String(row[identityField] ?? ''), row] as const),
  );
  const mutations = flattenWorkspaceMutations(input.workspaceTransaction);
  const mutationByWorkspaceIdentity = new Map(
    mutations.map((mutation) => [`${mutation.entityKey}:${mutation.identity}`, mutation] as const),
  );
  const workspaceReferenceDescriptor = (
    sourceMutation: UiWorkspaceRecordMutation | undefined,
    fieldKey: string,
    value: unknown,
  ) => {
    const reference = sourceMutation?.references?.find(
      (candidate) =>
        candidate.key === fieldKey &&
        candidate.identityKind === 'workspace' &&
        candidate.identity === String(value ?? ''),
    );
    if (!reference) return null;
    const target = mutationByWorkspaceIdentity.get(`${reference.entityKey}:${reference.identity}`);
    if (!target) return null;
    return entryPresentation(
      target.entityKey,
      (target.current ?? target.original ?? {}) as Readonly<Record<string, unknown>>,
      '',
      target.identity,
      target.identityKind === 'workspace',
      input.ownerPath ?? null,
    );
  };
  const rootMutationByIdentity = new Map(
    mutations
      .filter((mutation) => mutation.entityKey === input.entityKey)
      .map((mutation) => [mutation.identity, mutation] as const),
  );
  const collectionChildren = (mutation: UiWorkspaceRecordMutation | undefined) => {
    const changes = Object.entries(mutation?.collections ?? {}).filter(
      ([, collection]) => !semanticEqual(collection.original ?? [], collection.current ?? []),
    );
    return changes.length
      ? [
          {
            label: 'Related collections',
            count: changes.length,
            icon: 'bi-list-ul',
            expanded: true,
            children: changes.map(([key, collection]) => ({
              label: key,
              status: `${collection.original?.length ?? 0} → ${collection.current?.length ?? 0} entries`,
              icon: 'bi-list-check',
            })),
          },
        ]
      : [];
  };
  const recycledByIdentity = new Map(
    (input.recycleBin ?? []).map((row) => [String(row[identityField] ?? ''), row]),
  );
  const added: Readonly<Record<string, unknown>>[] = [];
  const changed: Array<{
    row: Readonly<Record<string, unknown>>;
    before: Readonly<Record<string, unknown>>;
    fields: string[];
    mutation?: UiWorkspaceRecordMutation;
  }> = [];
  const removed: Readonly<Record<string, unknown>>[] = [];

  for (const row of input.entries) {
    const identity = String(row[identityField] ?? '');
    const before = originals.get(identity);
    if (!before) {
      added.push(row);
      continue;
    }
    const fields = [...new Set([...Object.keys(before), ...Object.keys(row)])].filter(
      (field) => !semanticEqual(before[field], row[field]),
    );
    const mutation = rootMutationByIdentity.get(identity);
    if (fields.length || collectionChildren(mutation).length)
      changed.push({ row, before, fields, ...(mutation ? { mutation } : {}) });
  }
  for (const row of input.entriesOriginal) {
    const identity = String(row[identityField] ?? '');
    if (identity && !current.has(identity)) removed.push(row);
  }

  const children: any[] = [];
  if (added.length) {
    children.push({
      label: 'Added to organization',
      count: added.length,
      icon: 'bi-plus-circle',
      severity: 'success',
      expanded: true,
      children: added.map((row) => {
        const identity = String(row[identityField] ?? '');
        const mutation = rootMutationByIdentity.get(identity);
        return {
          ...entryNodePresentation(
            input.entityKey,
            row,
            identityField,
            null,
            mutation?.identityKind === 'workspace',
            input.ownerPath ?? null,
          ),
          identity,
          status: mutation?.identityKind === 'workspace' ? 'new' : 'added',
          icon: 'bi-person-plus',
          expanded: true,
          details: Object.keys(row)
            .filter((field) => {
              if (field === identityField) return false;
              const value = row[field];
              return value !== null && value !== undefined && String(value) !== '';
            })
            .map((field) =>
              valueDetailFor(input.entityKey, field, row[field], input.ownerPath ?? null, identity),
            ),
          children: collectionChildren(rootMutationByIdentity.get(identity)),
        };
      }),
    });
  }
  if (changed.length) {
    children.push({
      label: 'Changed members',
      count: changed.length,
      icon: 'bi-pencil-square',
      expanded: true,
      children: changed.map(({ row, before, fields, mutation }) => {
        const related = collectionChildren(mutation);
        return {
          ...entryNodePresentation(
            input.entityKey,
            row,
            identityField,
            null,
            mutation?.identityKind === 'workspace',
            input.ownerPath ?? null,
          ),
          identity: String(row[identityField] ?? ''),
          count: fields.length + related.length,
          status: 'changed',
          icon: 'bi-person-gear',
          expanded: true,
          details: fields.map((field) => {
            const detail = detailFor(
              input.entityKey,
              field,
              before[field],
              row[field],
              input.ownerPath ?? null,
              String(row[identityField] ?? ''),
            );
            const workspaceDescriptor = workspaceReferenceDescriptor(mutation, field, row[field]);
            return workspaceDescriptor ? { ...detail, to: workspaceDescriptor } : detail;
          }),
          children: related,
        };
      }),
    });
  }
  if (removed.length) {
    children.push({
      label: 'Removed from organization',
      count: removed.length,
      icon: 'bi-dash-circle',
      severity: 'danger',
      expanded: true,
      children: removed.map((row) => {
        const identity = String(row[identityField] ?? '');
        const retained = recycledByIdentity.get(identity);
        const fields = retained
          ? [...new Set([...Object.keys(row), ...Object.keys(retained)])].filter(
              (field) => !semanticEqual(row[field], retained[field]),
            )
          : [];
        return {
          ...entryNodePresentation(
            input.entityKey,
            retained ?? row,
            identityField,
            null,
            rootMutationByIdentity.get(identity)?.identityKind === 'workspace',
            input.ownerPath ?? null,
          ),
          identity,
          status: 'recycle bin',
          statuses: fields.length ? ['recycle bin', 'changed'] : ['recycle bin'],
          icon: 'bi-trash3',
          severity: 'danger',
          ...(fields.length
            ? {
                details: fields.map((field) =>
                  detailFor(
                    input.entityKey,
                    field,
                    row[field],
                    retained?.[field],
                    input.ownerPath ?? null,
                    identity,
                  ),
                ),
              }
            : {}),
        };
      }),
    });
  }

  const mutationDetails = (mutation: UiWorkspaceRecordMutation) => {
    const currentRecord = mutation.current ?? {};
    const originalRecord = mutation.original ?? {};
    if (mutation.operation === 'delete') return [];
    const fields =
      mutation.operation === 'create'
        ? Object.keys(currentRecord).filter((field) => {
            const value = currentRecord[field];
            return value !== null && value !== undefined && String(value) !== '';
          })
        : (mutation.changedFields ??
          [...new Set([...Object.keys(originalRecord), ...Object.keys(currentRecord)])].filter(
            (field) => !semanticEqual(originalRecord[field], currentRecord[field]),
          ));
    return fields.map((field) => {
      if (mutation.operation === 'create') {
        const detail = valueDetailFor(
          mutation.entityKey,
          field,
          currentRecord[field],
          input.ownerPath ?? null,
          mutation.identity,
        );
        const workspaceDescriptor = workspaceReferenceDescriptor(
          mutation,
          field,
          currentRecord[field],
        );
        return workspaceDescriptor ? { ...detail, value: workspaceDescriptor } : detail;
      }
      const detail = detailFor(
        mutation.entityKey,
        field,
        originalRecord[field],
        currentRecord[field],
        input.ownerPath ?? null,
        mutation.identity,
      );
      const workspaceDescriptor = workspaceReferenceDescriptor(
        mutation,
        field,
        currentRecord[field],
      );
      return workspaceDescriptor ? { ...detail, to: workspaceDescriptor } : detail;
    });
  };

  const descendantMutations = mutations.filter(
    (mutation) => mutation.entityKey !== input.entityKey,
  );
  if (descendantMutations.length) {
    const semantic = browserWindow.ManatOS?.semanticChangePresentation;
    const byEntity = new Map<string, UiWorkspaceRecordMutation[]>();
    for (const mutation of descendantMutations) {
      const group = byEntity.get(mutation.entityKey) ?? [];
      group.push(mutation);
      byEntity.set(mutation.entityKey, group);
    }
    children.push({
      label: 'Related changes',
      count: descendantMutations.length,
      icon: 'bi-diagram-3',
      expanded: true,
      children: [...byEntity.entries()].map(([entityKey, entityMutations]) => ({
        entityKey,
        label: semantic?.entityLabel?.(entityKey) || entityKey,
        count: entityMutations.length,
        icon: `bi-${semantic?.entityIcon?.(entityKey) || 'box'}`,
        expanded: true,
        children: entityMutations.map((mutation) => ({
          ...entryNodePresentation(
            mutation.entityKey,
            (mutation.current ?? mutation.original ?? {}) as Readonly<Record<string, unknown>>,
            '',
            mutation.identity,
            mutation.identityKind === 'workspace',
            input.ownerPath ?? null,
          ),
          identity: mutation.identity,
          status: mutation.operation,
          icon:
            mutation.operation === 'create'
              ? 'bi-plus-circle'
              : mutation.operation === 'delete'
                ? 'bi-trash'
                : 'bi-pencil-square',
          severity: mutation.operation === 'delete' ? 'danger' : undefined,
          details: mutationDetails(mutation),
          expanded: true,
        })),
      })),
    });
  }

  const changeCount = added.length + changed.length + removed.length + descendantMutations.length;
  return {
    summary: `${changeCount} ${
      changeCount === 1 ? 'change' : 'changes'
    } in this organization workspace.`,
    nodes: [
      {
        label: input.caption || 'Organization workspace',
        count: changeCount,
        status: `${input.entries.length} ${
          input.entries.length === 1 ? 'member' : 'members'
        } in workspace${
          (input.recycleBin?.length ?? 0) > 0 ? `, ${input.recycleBin!.length} in recycle bin` : ''
        }`,
        icon: 'bi-diagram-3-fill',
        expanded: true,
        children,
      },
    ],
  };
};
