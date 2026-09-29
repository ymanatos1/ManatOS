import type { UiCtxMutationCause } from './ui-context.js';
import { UiDirtyRuntime, semanticEqual } from './dirty.js';
import type { UiLevel } from './ui-level.js';
import type {
  UiEntryTransferDto,
  UiOwnerEntryAddress,
  UiOwnerEntryProjection,
  UiOwnerSurfaceProvider,
} from './surface-providers.js';
import type { UiLayoutProjection } from './layout.js';
import { projectHierarchyMembersIntoLayout } from './hierarchy-layout.js';
import type { ManatOSObjectMetadata } from '@manatos/shared/metadata/bo';
import { relationshipForField } from '@manatos/shared/metadata/bo';

import type { UiEntryPersistenceRequest, UiOwnedEntryResult } from './entry-persistence.js';
import { ownedEntryInvocation, type UiOwnedEntryInvocation } from './owned-entry-invocation.js';
import {
  UiHierarchyRelationshipPolicy,
  type UiHierarchyEligibility,
  type UiHierarchyRelation,
  type UiHierarchyRelationshipOptions,
} from './hierarchy-relationship.js';
import {
  changedFieldKeys,
  emptyWorkspaceTransaction,
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
  parentMutationIdFor,
  removeWorkspaceMutation,
  upsertWorkspaceMutation,
  type UiWorkspaceRecordMutation,
  type UiWorkspaceTransactionSnapshot,
} from './workspace-transaction.js';

export interface OrganizationHierarchyEntryState {
  readonly persisted: boolean;
  readonly changed: boolean;
}

/** Canonical persistence/dirty projection for one Organization workspace member. */
export function organizationHierarchyEntryState(
  row: Readonly<Record<string, unknown>>,
  originals: readonly Readonly<Record<string, unknown>>[],
  identityField = 'id',
): OrganizationHierarchyEntryState {
  const identity = String(row[identityField] ?? '');
  if (!identity || identity.startsWith('draft:')) return { persisted: false, changed: false };
  const original = originals.find(
    (candidate) => String(candidate[identityField] ?? '') === identity,
  );
  // A non-draft identity already denotes an entry that exists in application storage,
  // even when it was added to this Organization during the current workspace. Only
  // members present in the immutable Organization baseline can be classified as changed.
  if (!original) return { persisted: true, changed: false };
  return { persisted: true, changed: !semanticEqual(original, row) };
}

export interface OrganizationHierarchyMutationResult {
  readonly changed: boolean;
  readonly reason: string | null;
}

export interface OrganizationOwnedEntryFieldRules {
  readonly fixedValues: Readonly<Record<string, Readonly<{ value: unknown }>>>;
}

export interface OrganizationHierarchySurfaceOptions {
  readonly identityField?: string;
  readonly normalizeEntries?: (
    rows: readonly Readonly<Record<string, unknown>>[],
  ) => readonly Readonly<Record<string, unknown>>[];
  readonly relationship?: UiHierarchyRelationshipOptions;
  readonly rootField?: string;
}

const rows = (value: unknown): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(value)
    ? value.filter(
        (candidate): candidate is Readonly<Record<string, unknown>> =>
          candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate),
      )
    : [];

const pictureResourceKeysReferencedBy = (value: unknown): ReadonlySet<string> => {
  const referenced = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object') return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    const record = candidate as Record<string, unknown>;
    const pendingIdentity = String(record.revision ?? record.id ?? '');
    if (record.pending === true && pendingIdentity.startsWith('pending:'))
      referenced.add(`picture:${pendingIdentity}`);
    const resourceIdentity = String(record.id ?? record.revision ?? '');
    if (resourceIdentity && typeof record.contentType === 'string')
      referenced.add(`picture:${resourceIdentity}`);
    Object.values(record).forEach(visit);
  };
  visit(value);
  return referenced;
};

/**
 * Typed semantic owner for one Organization/hierarchy workspace UiLevel.
 *
 * Stage 21 deliberately starts by transferring canonical CTX ownership before
 * moving graph, relationship, draft and presentation orchestration. Relationship
 * decisions now begin transferring to typed policy while browser adapters remain
 * responsible for selector/DOM orchestration and other not-yet-migrated behavior.
 */
export class OrganizationHierarchySurface {
  #ownerProvider: OrganizationOwnerSurfaceProvider | null = null;
  #relationshipPolicy: UiHierarchyRelationshipPolicy | null;
  options: OrganizationHierarchySurfaceOptions;
  readonly dirtyRuntime: UiDirtyRuntime;
  constructor(
    readonly level: UiLevel,
    options: OrganizationHierarchySurfaceOptions = {},
  ) {
    this.options = options;
    this.#relationshipPolicy = options.relationship
      ? new UiHierarchyRelationshipPolicy(options.relationship)
      : null;
    if (!level.context) throw new Error('Organization hierarchy surface requires canonical CTX.');
    if (level.invocation?.surface !== 'hierarchy') {
      throw new Error(
        `Organization hierarchy surface requires a hierarchy UiLevel, got '${level.invocation?.surface ?? ''}'.`,
      );
    }
    // The workspace resource is part of the hierarchy surface contract. Older/test
    // bootstrap shapes may omit it, so establish the canonical container once at
    // surface adoption rather than making individual workspace features compensate.
    const workspace = level.context.get('data.resources.workspace');
    if (workspace === null || typeof workspace !== 'object' || Array.isArray(workspace)) {
      level.context.replace(
        'data.resources.workspace',
        {},
        Object.freeze({
          source: 'organization-hierarchy-surface',
          action: 'initialize-workspace-resource',
          path: level.context.pathOf('data.resources.workspace'),
        }),
      );
    }
    this.dirtyRuntime = new UiDirtyRuntime(level.context, {
      evaluate: () => {
        const hierarchyDirty = !this.sameRows(this.entries, this.originalEntries);
        return (
          hierarchyDirty ||
          this.recycleBin.length > 0 ||
          this.transactionSnapshot().mutations.length > 0
        );
      },
    });
    this.dirtyRuntime.refresh('organization-hierarchy-surface:initialize');
    this.#refreshInspectionLayout('initialize');
  }

  configure(options: OrganizationHierarchySurfaceOptions = {}): this {
    if (!Object.keys(options).length) return this;
    this.options = { ...this.options, ...options };
    if (options.relationship)
      this.#relationshipPolicy = new UiHierarchyRelationshipPolicy(options.relationship);
    return this;
  }

  /** Opaque legacy document-continuation fields. Live Entry/Owner communication never uses them. */
  continuationFormStateSnapshot(): Readonly<Record<string, unknown>> {
    const state = this.continuationStateSnapshot();
    return Object.freeze({
      _ownerEntries: state.entries,
      _ownerEntriesOriginal: state.entriesOriginal,
      _ownerWorkspaceTransaction: state.workspaceTransaction,
      _ownerRecycleBin: state.recycleBin,
      _ownerFocusedMemberId: state.focusedMemberId,
      _ownerIdentityField: state.identityField,
      _ownerRuntimeResources: state.runtimeResources,
    });
  }

  get entries(): readonly Readonly<Record<string, unknown>>[] {
    return rows(this.level.context?.get('data.list.entries'));
  }

  get originalEntries(): readonly Readonly<Record<string, unknown>>[] {
    return rows(this.level.context?.get('data.list.originalEntries'));
  }

  /**
   * Current semantic aggregate carried only when an owned full-page Entry must
   * continue the live owner across a document boundary. Nested popup invocations
   * remain typed child invocations and never transport this aggregate.
   */
  continuationStateSnapshot(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      entries: this.entries.map((entry) => ({ ...entry })),
      entriesOriginal: this.originalEntries.map((entry) => ({ ...entry })),
      workspaceTransaction: this.transactionSnapshot(),
      recycleBin: this.recycleBin.map((entry) => ({ ...entry })),
      runtimeResources: this.runtimeResourceSnapshot(),
      focusedMemberId: this.level.context?.get('data.resources.workspace.focusedMemberId') ?? null,
      identityField:
        this.level.context?.get('data.resources.workspace.identityField') ??
        this.options.identityField ??
        'id',
    });
  }

  /** Reconcile an accepted full-page owned-entry continuation into the live owner. */
  applyContinuationStateSnapshot(snapshot: unknown, action = 'owned-entry-continuation'): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return;
    const state = snapshot as Readonly<Record<string, unknown>>;
    if (Array.isArray(state.entries)) this.replaceEntries(rows(state.entries), `${action}-entries`);
    if (Array.isArray(state.entriesOriginal))
      this.replaceOriginalEntries(rows(state.entriesOriginal), `${action}-original-entries`);
    if (state.workspaceTransaction !== undefined)
      this.replaceTransaction(state.workspaceTransaction, `${action}-transaction`);
    if (Array.isArray(state.recycleBin))
      this.replaceRecycleBin(rows(state.recycleBin), `${action}-recycle`);
    if (state.runtimeResources !== undefined) this.replaceRuntimeResources(state.runtimeResources);
    if (Object.prototype.hasOwnProperty.call(state, 'focusedMemberId'))
      this.setWorkspaceValue('focusedMemberId', state.focusedMemberId ?? null, `${action}-focus`);
    this.dirtyRuntime.refresh(`organization-hierarchy-surface:${action}`);
  }

  /** Private non-CTX resources whose lifetime is owned by this Organization UiLevel. */
  runtimeResourceSnapshot(): Readonly<Record<string, unknown>> {
    return this.level.runtimeResourceSnapshot();
  }

  /** Pending private resources required to reconstruct the complete owner workspace. */
  recoverableRuntimeResourceSnapshot(): Readonly<Record<string, unknown>> {
    const required = new Set<string>([
      ...pictureResourceKeysReferencedBy(this.entries),
      ...pictureResourceKeysReferencedBy(this.originalEntries),
      ...pictureResourceKeysReferencedBy(this.recycleBin),
      ...pictureResourceKeysReferencedBy(this.transactionSnapshot()),
    ]);

    const resources = this.level.runtimeResourceSnapshot();
    const result: Record<string, unknown> = {};
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(resources, key)) {
        throw new Error(`Organization recovery is missing required runtime resource '${key}'.`);
      }
      result[key] = resources[key];
    }
    return Object.freeze(result);
  }

  replaceRuntimeResources(resources: unknown): void {
    this.level.replaceRuntimeResources(resources);
  }

  mergeRuntimeResources(resources: unknown): void {
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return;
    for (const [key, value] of Object.entries(resources as Record<string, unknown>))
      this.level.setRuntimeResource(key, value);
  }

  runtimeResource<T = unknown>(key: string): T | undefined {
    return this.level.getRuntimeResource<T>(key);
  }

  /** Remove picture resources no longer referenced by the live workspace. */
  pruneRuntimeResources(): void {
    const referenced = new Set<string>([
      ...pictureResourceKeysReferencedBy(this.entries),
      ...pictureResourceKeysReferencedBy(this.originalEntries),
      ...pictureResourceKeysReferencedBy(this.recycleBin),
      // External owned entries are semantic members of the same Organization
      // workspace even though they are not hierarchy rows. Their pending picture
      // descriptors therefore keep Organization-owned binary resources reachable.
      ...pictureResourceKeysReferencedBy(this.transactionSnapshot()),
    ]);
    for (const key of Object.keys(this.level.runtimeResourceSnapshot())) {
      if (key.startsWith('picture:') && !referenced.has(key)) this.level.deleteRuntimeResource(key);
    }
  }

  /** Persisted members removed from the active graph but retained by the workspace for undo/recovery. */
  get recycleBin(): readonly Readonly<Record<string, unknown>>[] {
    return rows(this.level.context?.get('data.resources.workspace.recycleBin'));
  }

  replaceRecycleBin(next: readonly Readonly<Record<string, unknown>>[], action: string): void {
    this.level.context?.replace(
      'data.resources.workspace.recycleBin',
      next.map((entry) => ({ ...entry })),
      this.#cause(action, 'data.resources.workspace.recycleBin'),
    );
    this.dirtyRuntime.refresh(`organization-hierarchy-surface:${action}`);
  }

  /** Semantic hierarchy-row equality; member order is not meaningful. */
  sameRows(
    left: readonly Readonly<Record<string, unknown>>[],
    right: readonly Readonly<Record<string, unknown>>[],
  ): boolean {
    const identityField = this.options.identityField ?? 'id';
    const normalized = (items: readonly Readonly<Record<string, unknown>>[]) =>
      items
        .map((item) => ({ ...item }))
        .sort((a, b) =>
          String(a[identityField] ?? '').localeCompare(String(b[identityField] ?? '')),
        );
    return semanticEqual(normalized(left), normalized(right));
  }

  sameTransactionSnapshot(value: unknown): boolean {
    return semanticEqual(this.transactionSnapshot(), value);
  }

  /** Internal owner Open operation used only by the encapsulated provider capability. */
  provideEntry(entityKey: string, identity: string): UiEntryTransferDto {
    this.assertProviderLive();
    const invocation = this.ownedEntryInvocation(entityKey, identity);
    return {
      entityKey: invocation.entityKey,
      identity: invocation.identity,
      identityField: invocation.identityField,
      current: structuredClone(invocation.current),
      original: invocation.original ? structuredClone(invocation.original) : null,
      resources: structuredClone(invocation.runtimeResources ?? {}),
    };
  }

  provideEntryIfPresent(entityKey: string, identity: string): UiEntryTransferDto | null {
    this.assertProviderLive();
    const exists =
      entityKey === (this.level.invocation?.entity ?? entityKey)
        ? this.entries.some(
            (entry) => String(entry[this.options.identityField ?? 'id'] ?? '') === identity,
          )
        : flattenWorkspaceMutations(this.transactionSnapshot()).some(
            (mutation) => mutation.entityKey === entityKey && mutation.identity === identity,
          );
    return exists ? this.provideEntry(entityKey, identity) : null;
  }

  canOwnEntity(entityKey: string): boolean {
    this.assertProviderLive();
    return this.canOwnExternalEntity(entityKey);
  }

  subscribeChanges(listener: () => void): () => void {
    this.assertProviderLive();
    if (!this.level.context?.port.subscribe) return () => undefined;
    return this.level.context.subscribe('data.resources.workspaceTransaction', listener, {
      kind: 'owner-provider',
      label: 'owned-entry-data',
    });
  }

  queryEntries(entityKey: string): readonly UiOwnerEntryProjection[] {
    this.assertProviderLive();
    if (!this.canOwnExternalEntity(entityKey)) return Object.freeze([]);
    return Object.freeze(
      flattenWorkspaceMutations(this.transactionSnapshot())
        .filter((mutation) => mutation.entityKey === entityKey)
        .map((mutation) =>
          Object.freeze({
            identity: mutation.identity,
            current:
              mutation.operation === 'delete' || !mutation.current
                ? null
                : structuredClone(mutation.current),
            deleted: mutation.operation === 'delete' || !mutation.current,
          }),
        ),
    );
  }

  /** Owner-provider Save boundary. Workspace representation never escapes this object. */
  saveEntry(
    transfer: UiEntryTransferDto,
    request: UiEntryPersistenceRequest,
    metadata: ManatOSObjectMetadata<Record<string, unknown>>,
    parent: UiOwnerEntryAddress | null = null,
  ): UiOwnedEntryResult {
    this.assertProviderLive();
    const rootEntityKey = this.level.invocation?.entity ?? transfer.entityKey;
    let invocation: UiOwnedEntryInvocation;
    if (transfer.entityKey === rootEntityKey) {
      const existing = this.entries.some(
        (entry) =>
          String(entry[this.options.identityField ?? transfer.identityField] ?? '') ===
          transfer.identity,
      );
      invocation = existing
        ? this.ownedEntryInvocation(transfer.entityKey, transfer.identity)
        : {
            version: 1,
            entityKey: transfer.entityKey,
            identity: transfer.identity,
            identityField: transfer.identityField,
            current: structuredClone(transfer.current),
            original: transfer.original ? structuredClone(transfer.original) : null,
            parentMutationId: null,
            workspaceIdentities: flattenWorkspaceMutations(this.transactionSnapshot()).map(
              (mutation) => `${mutation.entityKey}:${mutation.identity}`,
            ),
            runtimeResources: structuredClone(transfer.resources),
          };
    } else {
      const existing = this.ownedEntryInvocationIfPresent(transfer.entityKey, transfer.identity);
      if (existing) invocation = existing;
      else {
        const parentMutation = parent
          ? flattenWorkspaceMutations(this.transactionSnapshot()).find(
              (candidate) =>
                candidate.entityKey === parent.entityKey && candidate.identity === parent.identity,
            )
          : null;
        invocation = this.newOwnedEntryInvocation(
          transfer.entityKey,
          transfer.identity,
          parentMutation?.mutationId ?? null,
          transfer.identityField,
        );
      }
    }
    return this.acceptOwnedEntryTransfer(transfer, request, invocation, metadata);
  }

  /** Stable runtime-only capability handed to owned descendants; never the Organization surface itself. */
  get ownerProvider(): UiOwnerSurfaceProvider {
    if (!this.#ownerProvider) this.#ownerProvider = new OrganizationOwnerSurfaceProvider(this);
    return this.#ownerProvider;
  }

  disposeProvider(): void {
    this.#ownerProvider?.dispose();
  }

  assertProviderLive(): void {
    if (this.level.lifecycle === 'closed' || this.level.lifecycle === 'disposed')
      throw new Error('Owner surface is no longer live.');
  }

  ownedEntryInvocation(entityKey: string, identity: string): UiOwnedEntryInvocation {
    return ownedEntryInvocation(
      entityKey,
      identity,
      this.options.identityField ?? 'id',
      this.entries,
      this.originalEntries,
      this.transactionSnapshot(),
      this.level.invocation?.entity ?? entityKey,
      this.runtimeResourceSnapshot(),
    );
  }

  /** Root hierarchy records keep their canonical hierarchy ownership path. */
  canOwnExternalEntity(entityKey: string): boolean {
    const candidate = String(entityKey || '').trim();
    const rootEntityKey = String(this.level.invocation?.entity || '').trim();
    return Boolean(candidate && rootEntityKey && candidate !== rootEntityKey);
  }

  /** Resolve an entry only when it already belongs to the heterogeneous transaction. */
  ownedEntryInvocationIfPresent(
    entityKey: string,
    identity: string,
  ): UiOwnedEntryInvocation | null {
    const exists = flattenWorkspaceMutations(this.transactionSnapshot()).some(
      (mutation) => mutation.entityKey === entityKey && mutation.identity === identity,
    );
    return exists ? this.ownedEntryInvocation(entityKey, identity) : null;
  }

  /** Workspace identities currently known to this owner, for reference classification. */
  workspaceIdentitySnapshot(): readonly string[] {
    return flattenWorkspaceMutations(this.transactionSnapshot())
      .filter((mutation) => mutation.identityKind === 'workspace')
      .map((mutation) => `${mutation.entityKey}:${mutation.identity}`);
  }

  /** Prepare a never-persisted heterogeneous child for the same Organization owner. */
  newOwnedEntryInvocation(
    entityKey: string,
    identity: string,
    parentMutationId: string | null = null,
    identityField = 'id',
  ): UiOwnedEntryInvocation {
    const transaction = this.transactionSnapshot();
    const workspaceIdentities = flattenWorkspaceMutations(transaction)
      .filter((mutation) => mutation.identityKind === 'workspace')
      .map((mutation) => `${mutation.entityKey}:${mutation.identity}`);
    const ownWorkspaceIdentity = `${entityKey}:${identity}`;
    if (!workspaceIdentities.includes(ownWorkspaceIdentity))
      workspaceIdentities.push(ownWorkspaceIdentity);
    return {
      version: 1,
      entityKey,
      identity,
      identityField,
      current: { [identityField]: identity },
      original: null,
      parentMutationId,
      workspaceIdentities,
    };
  }

  /**
   * Caller-owned field constraints for an Entry opened from this hierarchy.
   * The generic Entry invocation adapter translates fixedValues into canonical
   * invocation value/readonly rules; Entry metadata remains owner-agnostic.
   */
  ownedEntryFieldRules(identity: string): OrganizationOwnedEntryFieldRules {
    const relationship = this.options.relationship;
    if (!relationship) return Object.freeze({ fixedValues: Object.freeze({}) });
    const identityField = this.options.identityField ?? relationship.identityField ?? 'id';
    const current = this.entries.find(
      (entry) => String(entry[identityField] ?? '') === String(identity),
    );
    if (!current)
      throw new Error(`Owned entry '${identity}' was not found in its hierarchy owner.`);
    return Object.freeze({
      fixedValues: Object.freeze({
        [relationship.parentField]: Object.freeze({
          value: current[relationship.parentField] ?? null,
        }),
      }),
    });
  }

  /** Semantic descendant mutations participating in this workspace transaction. */
  transactionSnapshot(): UiWorkspaceTransactionSnapshot {
    return normalizeWorkspaceTransaction(
      this.level.context?.get('data.resources.workspaceTransaction'),
    );
  }

  replaceTransaction(snapshot: unknown, action: string): void {
    const normalized = normalizeWorkspaceTransaction(snapshot);
    this.level.context?.replace(
      'data.resources.workspaceTransaction',
      normalized,
      this.#cause(action, 'data.resources.workspaceTransaction'),
    );
    this.dirtyRuntime.refresh(`organization-hierarchy-surface:${action}`);
  }

  upsertTransactionMutation(
    mutation: UiWorkspaceRecordMutation,
    action: string,
    parentMutationId: string | null = null,
  ): void {
    this.replaceTransaction(
      upsertWorkspaceMutation(this.transactionSnapshot(), mutation, parentMutationId),
      action,
    );
  }

  removeTransactionMutation(mutationId: string, action: string): void {
    this.replaceTransaction(
      removeWorkspaceMutation(this.transactionSnapshot(), mutationId),
      action,
    );
  }

  /** Remove a never-persisted external entry and clear root references to its workspace identity. */
  removeExternalDraftMutation(
    mutationId: string,
    rootReferenceFields: readonly string[],
    action = 'remove-external-draft',
  ): OrganizationHierarchyMutationResult {
    const mutation = flattenWorkspaceMutations(this.transactionSnapshot()).find(
      (candidate) => candidate.mutationId === mutationId,
    );
    if (!mutation) return { changed: false, reason: 'Workspace entry was not found.' };
    if (mutation.entityKey === (this.level.invocation?.entity ?? ''))
      return {
        changed: false,
        reason: 'Root hierarchy entries use the hierarchy removal lifecycle.',
      };
    if (mutation.identityKind !== 'workspace' || mutation.operation !== 'create')
      return {
        changed: false,
        reason: 'Existing external entries cannot be deleted from the Organization workspace.',
      };
    const parentMutationId = parentMutationIdFor(
      this.transactionSnapshot().mutations,
      mutation.mutationId,
    );
    if (parentMutationId)
      return {
        changed: false,
        reason: 'Nested external drafts must be removed through their owning entry.',
      };

    const fields = [...new Set(rootReferenceFields.filter((field) => String(field).trim()))];
    if (fields.length) {
      const identityField = this.options.identityField ?? 'id';
      const next = this.entries.map((entry) => {
        let changed = false;
        const copy = { ...entry };
        const original = this.originalEntries.find(
          (candidate) =>
            String(candidate[identityField] ?? '') === String(entry[identityField] ?? ''),
        );
        for (const field of fields) {
          if (String(copy[field] ?? '') !== mutation.identity) continue;
          copy[field] = original?.[field] ?? null;
          changed = true;
        }
        return changed ? copy : { ...entry };
      });
      this.replaceEntries(next, `${action}-references`);
    }
    this.removeTransactionMutation(mutation.mutationId, action);
    this.pruneRuntimeResources();
    return { changed: true, reason: null };
  }

  /** Provider Save boundary. The DTO is temporary; Organization alone translates it. */
  acceptOwnedEntryTransfer(
    transfer: UiEntryTransferDto,
    request: UiEntryPersistenceRequest,
    openingInvocation: UiOwnedEntryInvocation,
    metadata: ManatOSObjectMetadata<Record<string, unknown>>,
    action = 'save-owned-entry',
  ): UiOwnedEntryResult {
    if (transfer.entityKey !== request.entityKey)
      throw new Error('Owned Entry transfer entity mismatch.');
    const canonicalRequest: UiEntryPersistenceRequest = {
      ...request,
      current: transfer.current,
      original: transfer.original ?? request.original,
    };
    return this.acceptOwnedEntrySave(
      canonicalRequest,
      openingInvocation,
      metadata,
      transfer.resources,
      action,
    );
  }

  /** Build and accept one child Entry Save contribution. The Owner alone decides
   * whether the child belongs to root entries or the heterogeneous transaction. */
  acceptOwnedEntrySave(
    request: UiEntryPersistenceRequest,
    openingInvocation: UiOwnedEntryInvocation,
    metadata: ManatOSObjectMetadata<Record<string, unknown>>,
    runtimeResources: Readonly<Record<string, unknown>>,
    action = 'save-owned-entry',
  ): UiOwnedEntryResult {
    if (request.entityKey !== openingInvocation.entityKey)
      throw new Error('Owned Entry invocation entity mismatch.');

    const rootEntityKey = this.level.invocation?.entity ?? request.entityKey;
    const liveInvocation =
      request.entityKey === rootEntityKey
        ? this.entries.some(
            (entry) =>
              String(entry[this.options.identityField ?? openingInvocation.identityField] ?? '') ===
              openingInvocation.identity,
          )
          ? this.ownedEntryInvocation(request.entityKey, openingInvocation.identity)
          : openingInvocation
        : (this.ownedEntryInvocationIfPresent(request.entityKey, openingInvocation.identity) ??
          openingInvocation);
    const current = {
      ...request.current,
      [liveInvocation.identityField]: liveInvocation.identity,
    };

    let result: UiOwnedEntryResult;
    if (request.entityKey === rootEntityKey) {
      const rootExists = this.entries.some(
        (entry) =>
          String(entry[this.options.identityField ?? liveInvocation.identityField] ?? '') ===
          liveInvocation.identity,
      );
      const record = rootExists
        ? Object.fromEntries(
            [liveInvocation.identityField, ...changedFieldKeys(request.original, current)].map(
              (key) => [key, current[key]],
            ),
          )
        : current;
      result = {
        entityKey: request.entityKey,
        identity: liveInvocation.identity,
        record,
        runtimeResources,
      };
    } else {
      const existing = liveInvocation.existingMutation;
      const baseline = existing?.original ?? liveInvocation.original ?? null;
      const identityKind = liveInvocation.identity.startsWith('draft:')
        ? ('workspace' as const)
        : ('persistent' as const);
      const operation = identityKind === 'workspace' ? ('create' as const) : ('update' as const);
      const workspaceIdentities = new Set(liveInvocation.workspaceIdentities);
      const references = Object.keys(metadata.fieldDefinition).flatMap((fieldKey) => {
        const relationship = relationshipForField(metadata, fieldKey);
        const entityKey = relationship?.relationship.references.objectKey;
        const value = current[fieldKey];
        if (!entityKey || value === null || value === undefined || String(value) === '') return [];
        const identity = String(value);
        return [
          {
            key: fieldKey,
            entityKey,
            identity,
            identityKind: workspaceIdentities.has(`${entityKey}:${identity}`)
              ? ('workspace' as const)
              : ('persistent' as const),
          },
        ];
      });
      const preservedReferences = (existing?.references ?? []).filter(
        (reference) => !references.some((candidate) => candidate.key === reference.key),
      );
      const collections = request.collections
        ? Object.fromEntries(
            Object.entries(request.collections).filter(
              ([, value]) => !semanticEqual(value.original, value.current),
            ),
          )
        : undefined;
      const mutation: UiWorkspaceRecordMutation = {
        mutationId: existing?.mutationId ?? `${request.entityKey}:${liveInvocation.identity}`,
        entityKey: request.entityKey,
        identity: liveInvocation.identity,
        identityKind,
        operation,
        original: operation === 'create' ? null : baseline,
        current,
        ...(operation === 'update' && baseline
          ? { changedFields: changedFieldKeys(baseline, current) }
          : {}),
        ...(existing?.baselineUpdatedAt !== undefined
          ? { baselineUpdatedAt: existing.baselineUpdatedAt }
          : baseline && Object.hasOwn(baseline, 'updatedAt')
            ? { baselineUpdatedAt: baseline.updatedAt }
            : {}),
        ...([...preservedReferences, ...references].length
          ? { references: [...preservedReferences, ...references] }
          : {}),
        ...(collections && Object.keys(collections).length
          ? { collections }
          : existing?.collections
            ? { collections: existing.collections }
            : {}),
        ...(existing?.children?.length ? { children: existing.children } : {}),
      };
      const hasChange =
        operation === 'create' ||
        !baseline ||
        !semanticEqual(baseline, current) ||
        Boolean(collections && Object.keys(collections).length) ||
        Boolean(existing?.children?.length);
      result = {
        entityKey: request.entityKey,
        identity: liveInvocation.identity,
        record: current,
        ...(hasChange ? { mutation } : existing ? { removeMutationId: existing.mutationId } : {}),
        parentMutationId: liveInvocation.parentMutationId ?? null,
        runtimeResources,
      };
    }

    this.applyOwnedEntryResult(result, action);
    return result;
  }

  /**
   * Accept one semantic result from an owned child editor into this already-live
   * workspace. The child returns only its own contribution; unrelated owner
   * rows and sibling/nested transaction branches remain owned here and are not
   * round-tripped through the child.
   */
  applyOwnedEntryResult(result: UiOwnedEntryResult, action = 'owned-entry-return'): void {
    const incomingResources =
      result.runtimeResources && typeof result.runtimeResources === 'object'
        ? result.runtimeResources
        : {};
    const availableResources = { ...this.runtimeResourceSnapshot(), ...incomingResources };
    const required = new Set<string>([
      ...pictureResourceKeysReferencedBy(result.record),
      ...pictureResourceKeysReferencedBy(result.mutation?.current),
    ]);
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(availableResources, key))
        throw new Error(`Owned entry result is missing required runtime resource '${key}'.`);
    }

    // Install the already-validated private resources before publishing any semantic
    // descriptor that can reference them. CTX subscribers therefore never observe a
    // pending resource reference whose bytes are not yet present in the owner UiLevel.
    this.mergeRuntimeResources(incomingResources);

    const rootEntityKey = this.level.invocation?.entity ?? result.entityKey;
    if (result.entityKey === rootEntityKey) {
      const identityField = this.options.identityField ?? 'id';
      const found = this.entries.some(
        (entry) => String(entry[identityField] ?? '') === result.identity,
      );
      const next = found
        ? this.entries.map((entry) =>
            String(entry[identityField] ?? '') === result.identity
              ? { ...entry, ...result.record, [identityField]: result.identity }
              : { ...entry },
          )
        : [
            ...this.entries.map((entry) => ({ ...entry })),
            { ...result.record, [identityField]: result.identity },
          ];
      this.replaceEntries(next, action);
      this.setWorkspaceValue('focusedMemberId', result.identity, action);
    }
    if (result.removeMutationId) {
      this.removeTransactionMutation(result.removeMutationId, action);
    } else if (result.mutation) {
      this.upsertTransactionMutation(result.mutation, action, result.parentMutationId ?? null);
    }
    this.pruneRuntimeResources();
  }

  relationshipEligibility(
    member: Readonly<Record<string, unknown>>,
    candidate: Readonly<Record<string, unknown>>,
    relation: UiHierarchyRelation,
  ): UiHierarchyEligibility {
    if (!this.#relationshipPolicy)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    return this.#relationshipPolicy.eligibility(this.entries, member, candidate, relation);
  }

  relationshipTypeOption(
    member: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> | null {
    if (!this.#relationshipPolicy)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    return this.#relationshipPolicy.typeOption(member);
  }

  allowedTypeValuesForNewMember(
    memberId: string | null,
    relation: UiHierarchyRelation,
  ): readonly string[] {
    if (!this.#relationshipPolicy)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    const relationship = this.options.relationship!;
    const identityField = this.options.identityField ?? relationship.identityField ?? 'id';
    const member = memberId
      ? this.entries.find((entry) => String(entry[identityField] ?? '') === String(memberId))
      : null;
    return this.#relationshipPolicy.allowedTypeValuesForNewMember(member, relation);
  }

  parentForNewMember(memberId: string | null, relation: UiHierarchyRelation): unknown {
    if (!this.#relationshipPolicy)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    const relationship = this.options.relationship!;
    const identityField = this.options.identityField ?? relationship.identityField ?? 'id';
    const member = memberId
      ? this.entries.find((entry) => String(entry[identityField] ?? '') === String(memberId))
      : null;
    return this.#relationshipPolicy.parentForNewMember(member, relation);
  }

  removeMember(memberId: string, action = 'remove-member'): OrganizationHierarchyMutationResult {
    const relationship = this.options.relationship;
    if (!this.#relationshipPolicy || !relationship)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    const identityField = this.options.identityField ?? relationship.identityField ?? 'id';
    const member = this.entries.find(
      (entry) => String(entry[identityField] ?? '') === String(memberId),
    );
    if (!member) return { changed: false, reason: 'Hierarchy member was not found.' };
    const originalMemberId = String(
      this.level.context?.get('data.resources.workspace.originalMemberId') ?? '',
    );
    if (originalMemberId && String(memberId) === originalMemberId)
      return { changed: false, reason: 'The original Organization member cannot be removed.' };
    if (
      this.entries.some(
        (candidate) => String(candidate[relationship.parentField] ?? '') === String(memberId),
      )
    )
      return {
        changed: false,
        reason: 'Move or remove this member’s children before removing the member.',
      };

    const persisted = this.originalEntries.some(
      (entry) => String(entry[identityField] ?? '') === String(memberId),
    );
    if (persisted) {
      const retained = { ...member };
      this.replaceRecycleBin(
        [
          ...this.recycleBin.filter(
            (entry) => String(entry[identityField] ?? '') !== String(memberId),
          ),
          retained,
        ],
        `${action}-recycle`,
      );
    }
    this.replaceEntries(
      this.entries.filter((entry) => String(entry[identityField] ?? '') !== String(memberId)),
      action,
    );
    this.pruneRuntimeResources();
    // originalEntries remains the immutable persistence baseline. Persisted members
    // additionally retain their current working snapshot in recycleBin so undo is
    // lossless; never-persisted drafts simply disappear.
    return { changed: true, reason: null };
  }

  restoreRecycledMember(
    memberId: string,
    action = 'restore-recycled-member',
  ): OrganizationHierarchyMutationResult {
    const relationship = this.options.relationship;
    if (!relationship)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    const identityField = this.options.identityField ?? relationship.identityField ?? 'id';
    const recycled = this.recycleBin.find(
      (entry) => String(entry[identityField] ?? '') === String(memberId),
    );
    if (!recycled) return { changed: false, reason: 'Recycled hierarchy member was not found.' };
    if (this.entries.some((entry) => String(entry[identityField] ?? '') === String(memberId)))
      return { changed: false, reason: 'The recycled member is already active in this hierarchy.' };

    const restored: Record<string, unknown> = {
      ...recycled,
      [relationship.parentField]: null,
    };
    if (this.options.rootField) restored[this.options.rootField] = null;
    this.replaceEntries([...this.entries.map((entry) => ({ ...entry })), restored], action);
    this.replaceRecycleBin(
      this.recycleBin.filter((entry) => String(entry[identityField] ?? '') !== String(memberId)),
      `${action}-recycle`,
    );
    this.setWorkspaceValue('focusedMemberId', memberId, action);
    return { changed: true, reason: null };
  }

  addExistingMemberForRelation(
    candidate: Readonly<Record<string, unknown>>,
    memberId: string,
    relation: UiHierarchyRelation,
    action = 'add-existing-member',
  ): OrganizationHierarchyMutationResult {
    const relationship = this.options.relationship;
    if (!this.#relationshipPolicy || !relationship)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    const identityField = this.options.identityField ?? relationship.identityField ?? 'id';
    const member = this.entries.find(
      (entry) => String(entry[identityField] ?? '') === String(memberId),
    );
    const candidateId = candidate[identityField] ?? candidate.id ?? candidate.value;
    if (!member || candidateId == null || String(candidateId) === '')
      return { changed: false, reason: 'Missing hierarchy member.' };
    if (this.entries.some((entry) => String(entry[identityField] ?? '') === String(candidateId)))
      return { changed: false, reason: 'The selected entry is already in this hierarchy.' };

    const eligibility = this.#relationshipPolicy.eligibility(
      this.entries,
      member,
      candidate,
      relation,
    );
    if (!eligibility.eligible) return { changed: false, reason: eligibility.reason };

    const row = { ...candidate, [identityField]: candidateId };
    if (
      !String(candidateId).startsWith('draft:') &&
      !this.originalEntries.some(
        (entry) => String(entry[identityField] ?? '') === String(candidateId),
      )
    ) {
      this.replaceOriginalEntries([...this.originalEntries, { ...row }], action);
    }

    const currentParent = member[relationship.parentField] ?? null;
    if (relation === 'parent') {
      row[relationship.parentField] = currentParent;
      this.replaceEntries(
        [
          ...this.entries.map((entry) =>
            String(entry[identityField] ?? '') === String(memberId)
              ? { ...entry, [relationship.parentField]: candidateId }
              : { ...entry },
          ),
          row,
        ],
        action,
      );
    } else {
      row[relationship.parentField] = relation === 'child' ? memberId : currentParent;
      this.replaceEntries([...this.entries.map((entry) => ({ ...entry })), row], action);
    }
    return { changed: true, reason: null };
  }

  hydrateOriginalSnapshots(
    candidates: readonly Readonly<Record<string, unknown>>[],
    action = 'hydrate-existing-originals',
  ): boolean {
    const relationship = this.options.relationship;
    const identityField = this.options.identityField ?? relationship?.identityField ?? 'id';
    const sourceById = new Map(
      candidates.map((record) => [
        String(record[identityField] ?? record.id ?? record.value ?? ''),
        record,
      ]),
    );
    const originalsById = new Map(
      this.originalEntries.map((record) => [String(record[identityField] ?? ''), record]),
    );
    let changed = false;
    for (const record of this.entries) {
      const identity = String(record[identityField] ?? '');
      if (!identity || identity.startsWith('draft:') || originalsById.has(identity)) continue;
      const source = sourceById.get(identity);
      if (!source) continue;
      originalsById.set(identity, { ...source, [identityField]: identity });
      changed = true;
    }
    if (changed) this.replaceOriginalEntries([...originalsById.values()], action);
    return changed;
  }

  reparentMember(memberId: string, nextParentId: unknown, action: string): boolean {
    if (!this.#relationshipPolicy)
      throw new Error('Organization hierarchy relationship policy is not configured.');
    const next = this.#relationshipPolicy.reparent(this.entries, memberId, nextParentId);
    if (!next) return false;
    this.replaceEntries(next, action);
    return true;
  }

  workspaceValue(key: string, fallback: unknown = null): unknown {
    const value = this.level.context?.get(`data.resources.workspace.${key}`);
    return value ?? fallback;
  }

  replaceEntries(next: readonly Readonly<Record<string, unknown>>[], action: string): void {
    const normalized = this.options.normalizeEntries?.(next) ?? next;
    this.level.context?.replace(
      'data.list.entries',
      normalized.map((entry) => ({ ...entry })),
      this.#cause(action, 'data.list.entries'),
    );
    this.dirtyRuntime.refresh(`organization-hierarchy-surface:${action}`);
    this.#refreshInspectionLayout(action);
  }

  replaceOriginalEntries(next: readonly Readonly<Record<string, unknown>>[], action: string): void {
    this.level.context?.replace(
      'data.list.originalEntries',
      next.map((entry) => ({ ...entry })),
      this.#cause(action, 'data.list.originalEntries'),
    );
    this.dirtyRuntime.refresh(`organization-hierarchy-surface:${action}`);
  }

  /** Promote a successfully committed aggregate to the new clean workspace baseline. */
  acceptCommittedBaseline(action = 'commit-accepted'): void {
    this.level.context?.replace(
      'data.list.originalEntries',
      this.entries.map((entry) => ({ ...entry })),
      this.#cause(action, 'data.list.originalEntries'),
    );
    this.replaceRecycleBin([], `${action}-recycle`);
    this.level.context?.replace(
      'data.resources.workspaceTransaction',
      emptyWorkspaceTransaction(),
      this.#cause(action, 'data.resources.workspaceTransaction'),
    );
    this.dirtyRuntime.refresh(`organization-hierarchy-surface:${action}`);
  }

  setWorkspaceValue(key: string, value: unknown, action: string): void {
    const relativePath = `data.resources.workspace.${key}`;
    if (this.level.context?.get(relativePath) === value) return;
    this.level.context?.replace(relativePath, value, this.#cause(action, relativePath));
  }

  setStateValue(key: string, value: unknown, action: string): void {
    const relativePath = `state.${key}`;
    if (this.level.context?.get(relativePath) === value) return;
    this.level.context?.replace(relativePath, value, this.#cause(action, relativePath));
  }

  #refreshInspectionLayout(action: string): void {
    const relationship = this.options.relationship;
    const current = this.level.context?.get('layout');
    if (!relationship || !current || typeof current !== 'object' || Array.isArray(current)) return;
    const layout = projectHierarchyMembersIntoLayout(
      current as UiLayoutProjection,
      this.entries,
      this.options.identityField ?? relationship.identityField ?? 'id',
      relationship.parentField,
      relationship.resolveName,
    );
    this.level.context?.replace('layout', layout as never, this.#cause(action, 'layout'));
  }

  get dirty(): boolean {
    return this.dirtyRuntime.evaluate();
  }

  #cause(action: string, relativePath: string): UiCtxMutationCause {
    return {
      source: 'organization-hierarchy-surface',
      action,
      triggerPath: `${this.level.context!.path}.${relativePath}`,
    };
  }
}

/**
 * Encapsulated runtime capability over one Organization owner surface.
 * Descendants receive only this object; OrganizationHierarchySurface never crosses
 * the Entry/Owner boundary. The provider owns no semantic state of its own.
 */
class OrganizationOwnerSurfaceProvider implements UiOwnerSurfaceProvider {
  #disposed = false;

  constructor(private readonly owner: OrganizationHierarchySurface) {}

  #assertLive(): void {
    if (this.#disposed) throw new Error('Owner provider is no longer live.');
    this.owner.assertProviderLive();
  }

  provideEntry(entityKey: string, identity: string): UiEntryTransferDto {
    this.#assertLive();
    return this.owner.provideEntry(entityKey, identity);
  }

  provideEntryIfPresent(entityKey: string, identity: string): UiEntryTransferDto | null {
    this.#assertLive();
    return this.owner.provideEntryIfPresent(entityKey, identity);
  }

  canOwnEntity(entityKey: string): boolean {
    this.#assertLive();
    return this.owner.canOwnEntity(entityKey);
  }

  subscribeChanges(listener: () => void): () => void {
    this.#assertLive();
    return this.owner.subscribeChanges(listener);
  }

  queryEntries(entityKey: string): readonly UiOwnerEntryProjection[] {
    this.#assertLive();
    return this.owner.queryEntries(entityKey);
  }

  saveEntry(
    transfer: UiEntryTransferDto,
    request: UiEntryPersistenceRequest,
    metadata: ManatOSObjectMetadata<Record<string, unknown>>,
    parent: UiOwnerEntryAddress | null = null,
  ): UiOwnedEntryResult {
    this.#assertLive();
    return this.owner.saveEntry(transfer, request, metadata, parent);
  }

  continuationFormStateSnapshot(): Readonly<Record<string, unknown>> {
    this.#assertLive();
    return this.owner.continuationFormStateSnapshot();
  }

  dispose(): void {
    this.#disposed = true;
  }
}
