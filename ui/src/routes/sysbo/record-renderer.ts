import type { Request, Response } from 'express';

import createError from 'http-errors';

import {
  allowedInvocationOptionValues,
  AppError,
  type ManatOSContext,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { renderPage } from '../../presentation/page/render-page.js';
import { registerContextEntity } from '../../context/manatos-context.js';
import { projectCollectionResources } from '../../runtime/state/collection-resource-projection.js';
import { metadataComponentPartialFor } from '../../presentation/metadata/component-registry.js';
import { metadataHierarchyWorkspaceDescriptor } from '../../presentation/metadata/hierarchy-workspace.js';
import { apiPathFor, canonicalSysBOMetadata, canonicalSysBOUIMetadata } from './data-access.js';
import { parentListContextForEntry } from './parent-list.js';
import type { UIEntityPermissions } from '../../sysbo/permissions.js';
import { entryRepresentationRuntime } from './entry-representation-runtime.js';
import {
  editPageSupplementalData,
  credentialTestResultPresentation,
} from './entry-supplemental-data.js';

import type { SysBODefinition } from '../../sysbo/types.js';
import { effectiveEntryUIMetadata, entryInvocation } from './entry-invocation.js';
import { buildEntryInitializationSeed } from './entry-initialization.js';
import { loadMetadataHierarchySnapshot } from './hierarchy-data.js';

/**
 * Render one canonical metadata-driven SysBO record page.
 *
 * Route handlers decide which record is being opened and whether access is
 * allowed. This module owns record-page composition: canonical metadata,
 * authoritative record loading, supplemental/reference data, parent-list CTX,
 * entry CTX construction and the final metadata-driven page render.
 */
export async function renderMetadataDrivenRecord(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: UIEntityPermissions,
  record: {
    isNew: boolean;
    recordId?: string;
    itemOverride?: Record<string, unknown>;
    applicationError?: AppError;
    parentOwnerContext?: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  const currentUser = res.locals.currentUser as SysBOUser | null;
  // Route orchestration already resolved the authoritative API capability
  // snapshot for this exact collection/record scope. Do not recalculate policy
  // inside the renderer or issue a second capability request.
  const effectivePermissions = permissions;
  const invocation = entryInvocation(req);
  const recordMode =
    invocation.mode === 'view'
      ? 'view'
      : record.isNew
        ? 'create'
        : effectivePermissions.update
          ? 'edit'
          : 'view';
  const [metadata, canonicalMetadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const metadataUI = effectiveEntryUIMetadata(canonicalMetadataUI, invocation);
  const modeLabel = recordMode === 'create' ? 'Add' : recordMode === 'edit' ? 'Edit' : 'View';
  const primaryField = metadata.fieldDefinition[metadata.primaryField];

  if (!primaryField) {
    throw createError(
      500,
      `Primary field '${metadata.primaryField}' is missing from ${metadata.key} metadata.`,
    );
  }

  const loadedItem =
    record.itemOverride ??
    (record.recordId
      ? (
          await apiClient.get<Record<string, unknown>>(
            `/api/v1/${apiPathFor(definition.key)}/${record.recordId}`,
            apiSessionOptions(req),
          )
        ).data
      : {});
  const item = record.isNew ? { ...loadedItem, ...invocation.defaults } : loadedItem;

  const ownerDraft =
    Boolean(record.parentOwnerContext) && String(record.recordId ?? '').startsWith('draft:');
  const supplemental = await editPageSupplementalData(
    req,
    definition,
    currentUser,
    item,
    record.isNew || ownerDraft,
    metadataUI,
    effectivePermissions,
    res.locals.ctx as ManatOSContext,
  );

  // Caller constraints narrow option catalogues without teaching the hosted
  // entry renderer about any concrete entity or relationship.
  for (const [fieldKey, override] of Object.entries(invocation.uiOverrides)) {
    const field = metadata.fieldDefinition[fieldKey];
    if (!field || field.type !== 'enum') continue;

    const allowed = allowedInvocationOptionValues(field, override);
    if (!allowed) continue;

    supplemental.referenceData[fieldKey] = allowed.map((value) => ({ value, label: value }));
    /*
     * Do not synthesize a create value here. Option-domain restrictions and
     * default reconciliation belong to EntityEntryRuntime so page and popup
     * hosts use exactly the same V2 initialization mechanics. No route-local
     * value decision is allowed to become a second defaulting implementation.
     */
  }
  const parentListContext = await parentListContextForEntry(
    req,
    definition,
    metadata,
    metadataUI,
    effectivePermissions,
    res.locals.ctx as ManatOSContext,
  );

  /*
   * Metadata components that need their own query/read model must not borrow the
   * surrounding list page's paged snapshot. Publish component-owned resources
   * on the entry surface instead. The hierarchy workspace and embedded
   * hierarchy view now share the same canonical connected-hierarchy loader.
   */
  const surfaceResources: Record<string, unknown> = {
    // Reference catalogues are factual read-model data. Browser-owned field and
    // selector runtimes consume them without asking the server to interpret UI policy.
    referenceData: supplemental.referenceData,
  };

  /*
   * Related collections are component-owned state, not canonical entity fields.
   * Publish both read-only query collections and editable collection drafts under
   * one V2 resources.collections contract. Where an editor exposes a richer
   * canonical working representation, it wins over the relationship-row query
   * shape for that source key. This keeps entry.current persistence-pure while
   * making Application/Principal Licenses and future related collections CTX
   * observable without entity-specific runtime branches.
   */
  const collectionResources = projectCollectionResources(
    supplemental.relatedData,
    supplemental.relatedEditingData,
  );
  if (Object.keys(collectionResources).length) {
    surfaceResources.collections = collectionResources;
  }
  if (Object.keys(supplemental.relatedReferenceData).length) {
    // Related reference catalogues are factual read-model data. Dynamic related-row
    // presentation resolves labels in the browser without asking SSR to evaluate UI rules.
    surfaceResources.relatedReferenceData = supplemental.relatedReferenceData;
  }
  const hierarchyDescriptor = metadataHierarchyWorkspaceDescriptor(metadata, metadataUI);
  if (hierarchyDescriptor && !record.isNew && !ownerDraft) {
    const hierarchyIdentity = item[hierarchyDescriptor.idField] ?? record.recordId;
    if (hierarchyIdentity != null && String(hierarchyIdentity) !== '') {
      const hierarchySnapshot = await loadMetadataHierarchySnapshot(
        req,
        definition,
        metadata,
        hierarchyDescriptor,
        item,
      );
      surfaceResources[hierarchyDescriptor.key] = Object.freeze({
        entries: hierarchySnapshot.entries,
        rootId: hierarchySnapshot.rootId,
        focusedMemberId: String(hierarchyIdentity),
      });
    }
  }

  // Production V2 registers canonical entity knowledge directly at the root.
  // No server-side UI entry/list tree is constructed as an intermediate source.
  const ctx = res.locals.ctx as ManatOSContext;
  registerContextEntity(ctx, definition.key, metadata, metadataUI);

  /*
   * Use the canonical static normalization contract. This is especially
   * important for create mode: a missing canonical boolean is `false`, not null,
   * before any expression is evaluated. Dynamic create defaults are deliberately
   * left declarative here and are interpreted by the browser entry-policy runtime.
   */
  const v2InitializationSeed = buildEntryInitializationSeed({
    runtimeValues: loadedItem,
    metadata,
    uiMetadata: metadataUI,
    mode: recordMode,
  });
  const v2ServerValues = v2InitializationSeed.fields;
  const v2OriginalValues = record.isNew ? {} : v2ServerValues;
  const v2RuntimeFacts = v2InitializationSeed.facts;

  const parentItems = Array.isArray(parentListContext.items) ? parentListContext.items : [];

  /*
   * SSR receives only factual record values plus the raw requested navigation.
   * It no longer receives a server-authored V2 entry view-model (tabs, field UX,
   * visibility/editability or aggregate state). Browser V2 owns those decisions.
   */
  const entryNavigation = {
    activeTabId: typeof req.query.tab === 'string' ? req.query.tab : null,
    activeInternalTabIds: {
      debugging:
        typeof req.query.debugTab === 'string' &&
        ['cli', 'entity', 'ui'].includes(req.query.debugTab)
          ? req.query.debugTab
          : null,
    },
  };

  const primaryDisplayValue =
    !record.isNew &&
    supplemental.primaryDisplayValue &&
    supplemental.primaryDisplayValue !== 'entry'
      ? ` - ${supplemental.primaryDisplayValue}`
      : '';

  await renderPage(res, 'pages/sysbo/entry', {
    title: `${modeLabel} ${metadata.name}${primaryDisplayValue}`,
    titleIcon: definition.icon,
    breadcrumbItems: [
      { label: 'ManatOS', href: '/' },
      { label: metadata.pluralName, href: `/bo/${encodeURIComponent(definition.key)}` },
      { label: `${modeLabel} ${metadata.name}${primaryDisplayValue}`, href: null },
    ],
    definition,
    metadata,
    metadataUI,
    primaryField,
    permissions: effectivePermissions,
    recordMode,
    recordId: record.recordId ?? null,
    item,
    ...supplemental,
    ...credentialTestResultPresentation(req),
    ...(record.applicationError ? { applicationError: record.applicationError } : {}),
    metadataComponentPartialFor,
    ownerEditing: Boolean(record.parentOwnerContext),
    ownerContext: record.parentOwnerContext ?? null,
    entryPopupHost: invocation.popup,
    /*
     * V2 entry pages own their TitleBar + entry-content composition.
     * Popup-hosted V2 entries render only host-neutral entry content because
     * popup caption/lifecycle are owned by the outer PopupHost.
     */
    workspaceFrameOwner: 'content',
    entryPopupToken: invocation.token,
    entryInvocationDefaults: invocation.defaults,
    entryInvocationOverrides: invocation.uiOverrides,
    entryRepresentationRuntime: entryRepresentationRuntime(
      metadata,
      metadataUI,
      supplemental.referenceData,
    ),
    entryNavigation,
    debuggingActiveScopeId:
      typeof req.query.debugTab === 'string' && ['cli', 'entity', 'ui'].includes(req.query.debugTab)
        ? req.query.debugTab
        : 'cli',
    entryRenderValues: v2ServerValues,
    uiBootstrap: {
      purpose: 'open-entity-entry',
      entityKey: definition.key,
      entityName: metadata.name,
      pluralName: metadata.pluralName,
      icon: definition.icon,
      title: `${modeLabel} ${metadata.name}`,
      recordId: record.recordId ?? null,
      isNew: record.isNew,
      readOnly: recordMode === 'view',
      popup: invocation.popup,
      defaults: invocation.defaults,
      uiOverrides: invocation.uiOverrides,
      parentEntries: parentItems,
      ...(record.parentOwnerContext
        ? {
            owner: {
              name: String(record.parentOwnerContext.name ?? 'hierarchy'),
              entries: Array.isArray(record.parentOwnerContext.entries)
                ? record.parentOwnerContext.entries
                : [],
            },
          }
        : {}),
      navigation: entryNavigation,
      entry: {
        original: v2OriginalValues,
        current: v2ServerValues,
        // Entity capability policy is a runtime fact consumed by declarative
        // entry-action expressions. It belongs to the client surface scope, not
        // to server-side UI decision execution.
        facts: { ...v2RuntimeFacts, permissions: effectivePermissions },
      },
      resources: surfaceResources,
    },
  });
}
