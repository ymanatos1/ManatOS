import createError from 'http-errors';
import type { Request } from 'express';
import {
  normalizeMetadataFieldValues,
  relationshipForField,
  type SysBOMetadata,
} from '@manatos/shared';
import { formPayloadForMetadata } from './form-payload.js';
import { semanticEqual } from '../../../runtime/v2/dirty.js';
import {
  changedFieldKeys,
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
  parentMutationIdFor,
  removeWorkspaceMutation,
  upsertWorkspaceMutation,
  type UiWorkspaceRecordMutation,
  type UiWorkspaceTransactionSnapshot,
} from '../../../runtime/v2/workspace-transaction.js';

export interface OwnerManagedEntryContext extends Readonly<Record<string, unknown>> {
  name: string;
  kind: string;
  mode: string;
  breadcrumbItems: Array<{ label: string; href: string | null }>;
  fields: Record<string, unknown>;
  entries: Record<string, unknown>[];
  entriesOriginal: Record<string, unknown>[];
  identityField: string;
  workspaceTransaction: UiWorkspaceTransactionSnapshot;
  recycleBin: Record<string, unknown>[];
  runtimeResources: Record<string, unknown>;
  recoveryUrl: string | null;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseBreadcrumbItems(value: unknown): Array<{ label: string; href: string | null }> {
  if (typeof value !== 'string' || !value) return [];

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((item) => ({
      label: String(item.label ?? ''),
      href: typeof item.href === 'string' ? item.href : null,
    }))
    .filter((item) => Boolean(item.label));
}

function parseRows(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

/**
 * Resolve one entry directly from an owner-managed in-memory aggregate.
 * Persisted-record lookup is intentionally bypassed because the owner workspace
 * is the authoritative working copy until its aggregate commit succeeds.
 */
export function ownerManagedContextFromRequest(req: Request): OwnerManagedEntryContext {
  const entries = parseRows(req.body._ownerEntries);
  const entriesOriginal = parseRows(req.body._ownerEntriesOriginal);
  const fields =
    typeof req.body._ownerFields === 'string'
      ? (JSON.parse(req.body._ownerFields) as Record<string, unknown>)
      : {};
  return {
    name: String(req.body._ownerName || 'organization'),
    kind: String(req.body._ownerKind || 'sysbo-hierarchy'),
    mode: String(req.body._ownerMode || 'edit'),
    breadcrumbItems: parseBreadcrumbItems(req.body._ownerBreadcrumbItems),
    fields,
    entries,
    entriesOriginal,
    identityField: String(req.body._ownerIdentityField || 'id'),
    workspaceTransaction: normalizeWorkspaceTransaction(
      parseObject(req.body._ownerWorkspaceTransaction),
    ),
    recycleBin: parseRows(req.body._ownerRecycleBin),
    runtimeResources: parseObject(req.body._ownerRuntimeResources),
    recoveryUrl:
      typeof req.body._ownerRecoveryUrl === 'string' && req.body._ownerRecoveryUrl
        ? req.body._ownerRecoveryUrl
        : null,
  };
}

export function ownerManagedEntryFromRequest(
  req: Request,
  id: string,
): { item: Record<string, unknown>; parentOwnerContext: OwnerManagedEntryContext } {
  const parentOwnerContext = ownerManagedContextFromRequest(req);
  const item = parentOwnerContext.entries.find(
    (candidate) => String(candidate[parentOwnerContext.identityField] ?? '') === id,
  );
  if (!item) throw createError(404, 'The requested owner-managed entry could not be found.');

  return { item, parentOwnerContext };
}

/**
 * Merge the posted child editor values back into the owner's working entries.
 * Only canonical, non-sensitive entity fields are accepted from the child form.
 */
export function mergeOwnerManagedEntryFromRequest(
  req: Request,
  entityKey: string,
  metadata: SysBOMetadata<Record<string, unknown>>,
): {
  entries: Record<string, unknown>[];
  entriesOriginal: Record<string, unknown>[];
  originalMemberId: string | null;
  focusedMemberId: string | null;
  mode: 'create' | 'edit';
  workspaceTransaction: UiWorkspaceTransactionSnapshot;
  recycleBin: Record<string, unknown>[];
  childMutation: UiWorkspaceRecordMutation | null;
  removeMutationId: string | null;
  parentMutationId: string | null;
  identityField: string;
} {
  const id = String(req.body.id ?? '');
  const identityField = String(req.body._ownerIdentityField || 'id');
  const entries = parseRows(req.body._ownerEntries);
  const entriesOriginal = parseRows(req.body._ownerEntriesOriginal);
  // Owned Entry accepts the same canonical form-value semantics as ordinary
  // metadata-driven CRUD. In particular, checkbox transport values ("on")
  // must become booleans and picture transport controls must not overwrite the
  // semantic record. Metadata-declared normalization is then applied exactly as
  // it is at the shared entity boundary.
  const edited = normalizeMetadataFieldValues(
    metadata,
    formPayloadForMetadata(req.body, entityKey, metadata),
  );

  // Repository persistence deliberately excludes picture fields from the ordinary
  // CRUD payload because their bytes use the dedicated picture endpoint. An owned
  // Entry has a different boundary: Save returns the complete semantic current
  // record to its live owner. Preserve the canonical picture descriptor posted by
  // the Entry so the Organization working copy has the same original/current
  // semantics as the Entry itself. Binary bytes remain private browser resources.
  for (const field of Object.values(metadata.fieldDefinition)) {
    if (
      !['picture', 'pictures'].includes(field.type) ||
      !Object.prototype.hasOwnProperty.call(req.body, field.key)
    )
      continue;
    const raw = req.body[field.key];
    if (raw === '' || raw == null) {
      edited[field.key] = field.type === 'pictures' ? [] : null;
      continue;
    }
    if (typeof raw !== 'string') continue;
    try {
      const value = JSON.parse(raw);
      edited[field.key] =
        field.type === 'pictures'
          ? Array.isArray(value)
            ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
            : []
          : value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : null;
    } catch {
      throw createError(400, `Invalid ${field.type} value for '${field.key}'.`);
    }
  }
  const nextEntries = entries.map((candidate) =>
    String(candidate[identityField] ?? '') === id
      ? { ...candidate, ...edited, [identityField]: id }
      : { ...candidate },
  );
  const ownerContext = ownerManagedContextFromRequest(req);
  const focusedMemberId = String(req.body._ownerFocusedMemberId || id || '') || null;
  const originalMemberId = String(ownerContext.fields.originalMemberId || '') || null;

  const original =
    entriesOriginal.find((candidate) => String(candidate[identityField] ?? '') === id) ?? null;
  const current =
    nextEntries.find((candidate) => String(candidate[identityField] ?? '') === id) ?? null;
  const workspaceTransaction = normalizeWorkspaceTransaction(
    parseObject(req.body._ownerWorkspaceTransaction),
  );
  const existingMutation = flattenWorkspaceMutations(workspaceTransaction).find(
    (mutation) => mutation.entityKey === entityKey && mutation.identity === id,
  );

  const postedCollectionOriginals = parseObject(req.body._ownerCollectionsOriginal);
  const collectionOriginals = postedCollectionOriginals;
  const collections = Object.fromEntries(
    Object.entries(req.body)
      .filter(([key, value]) => key.startsWith('relatedChanges.') && typeof value === 'string')
      .flatMap(([key, value]) => {
        try {
          const parsed = JSON.parse(value as string) as { current?: unknown[] };
          if (!Array.isArray(parsed.current)) return [];
          const collectionKey = key.slice('relatedChanges.'.length);
          const baseline = collectionOriginals[collectionKey];
          return [
            [
              collectionKey,
              {
                original: Array.isArray(baseline) ? baseline : [],
                current: structuredClone(parsed.current),
              },
            ],
          ];
        } catch {
          return [];
        }
      }),
  );

  const changedCollections = Object.fromEntries(
    Object.entries(collections).filter(
      ([, collection]) => !semanticEqual(collection.original, collection.current),
    ),
  );

  let nextWorkspaceTransaction = workspaceTransaction;
  let childMutation: UiWorkspaceRecordMutation | null = null;
  let removeMutationId: string | null = null;
  let childParentMutationId: string | null = null;
  if (current) {
    const isWorkspaceIdentity = id.startsWith('draft:');
    const baseline = original ?? existingMutation?.original ?? null;
    const operation = isWorkspaceIdentity ? 'create' : 'update';
    const knownWorkspaceIdentities = new Set(
      flattenWorkspaceMutations(workspaceTransaction)
        .filter((candidate) => candidate.identityKind === 'workspace')
        .map((candidate) => `${candidate.entityKey}:${candidate.identity}`),
    );
    const relationshipReferences = Object.keys(metadata.fieldDefinition).flatMap((fieldKey) => {
      const relationship = relationshipForField(metadata, fieldKey);
      const value = current[fieldKey];
      if (!relationship || value === null || value === undefined || String(value) === '') return [];
      const targetEntityKey = relationship.relationship.references.objectKey;
      const identity = String(value);
      return [
        {
          key: fieldKey,
          entityKey: targetEntityKey,
          identity,
          identityKind: knownWorkspaceIdentities.has(`${targetEntityKey}:${identity}`)
            ? ('workspace' as const)
            : ('persistent' as const),
        },
      ];
    });
    const preservedReferences = (existingMutation?.references ?? []).filter(
      (reference) => !relationshipReferences.some((candidate) => candidate.key === reference.key),
    );
    const references = [...preservedReferences, ...relationshipReferences];
    const mutation: UiWorkspaceRecordMutation = {
      mutationId: existingMutation?.mutationId ?? `${entityKey}:${id}`,
      entityKey,
      identity: id,
      identityKind: isWorkspaceIdentity ? 'workspace' : 'persistent',
      operation,
      original: operation === 'create' ? null : baseline,
      current,
      ...(operation === 'update' && baseline
        ? { changedFields: changedFieldKeys(baseline, current) }
        : {}),
      ...(existingMutation?.baselineUpdatedAt !== undefined
        ? { baselineUpdatedAt: existingMutation.baselineUpdatedAt }
        : baseline && Object.hasOwn(baseline, 'updatedAt')
          ? { baselineUpdatedAt: baseline.updatedAt }
          : {}),
      ...(references.length ? { references } : {}),
      ...(Object.keys(collections).length
        ? Object.keys(changedCollections).length
          ? { collections: changedCollections }
          : {}
        : existingMutation?.collections
          ? { collections: existingMutation.collections }
          : {}),
      ...(existingMutation?.children?.length ? { children: existingMutation.children } : {}),
    };
    const parentMutationId = existingMutation
      ? (parentMutationIdFor(workspaceTransaction.mutations, existingMutation.mutationId) ?? null)
      : null;
    const hasOwnSemanticChange =
      operation === 'create' ||
      !baseline ||
      !semanticEqual(baseline, current) ||
      Object.keys(changedCollections).length > 0 ||
      Boolean(existingMutation?.children?.length);
    childParentMutationId = parentMutationId;
    if (hasOwnSemanticChange) {
      childMutation = mutation;
      nextWorkspaceTransaction = upsertWorkspaceMutation(
        workspaceTransaction,
        mutation,
        parentMutationId,
      );
    } else if (existingMutation) {
      removeMutationId = existingMutation.mutationId;
      nextWorkspaceTransaction = removeWorkspaceMutation(
        workspaceTransaction,
        existingMutation.mutationId,
      );
    }
  }

  return {
    entries: nextEntries,
    entriesOriginal,
    originalMemberId,
    focusedMemberId,
    mode: req.body._ownerMode === 'create' ? 'create' : 'edit',
    workspaceTransaction: nextWorkspaceTransaction,
    recycleBin: parseRows(req.body._ownerRecycleBin),
    childMutation,
    removeMutationId,
    parentMutationId: childParentMutationId,
    identityField,
  };
}
