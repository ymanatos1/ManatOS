import type { Request, Response } from 'express';

import createError from 'http-errors';

import {
  allSysBOUIMetadata,
  allowedInvocationOptionValues,
  AppError,
  resolveSysBOUIView,
  resolveSysBOUIRelatedCollection,
  type ManatOSContext,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { renderPage } from '../../../presentation/page/render-page.js';
import { registerContextEntity } from '../../../context/manatos-context.js';
import { projectCollectionResources } from '../../../runtime/state/collection-resource-projection.js';
import { entryPresentationDefinition } from '../../../runtime/v2/entry-presentation.js';
import {
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
} from '../../../runtime/v2/workspace-transaction.js';
import { metadataComponentPartialFor } from '../../../presentation/metadata/component-registry.js';
import { metadataHierarchyWorkspaceDescriptor } from '../../../presentation/metadata/hierarchy-workspace.js';
import {
  apiPathFor,
  canonicalSysBOMetadata,
  canonicalSysBOUIMetadata,
} from '../shared/data-access.js';
import { parentListContextForEntry } from '../list/parent-list.js';
import type { UIEntityPermissions } from '../../../sysbo/permissions.js';
import { entryRepresentationRuntime } from './representation-runtime.js';
import { editPageSupplementalData, credentialTestResultPresentation } from './supplemental-data.js';

import type { SysBODefinition } from '../../../sysbo/types.js';
import { effectiveEntryUIMetadata, entryInvocation } from './invocation.js';
import { buildEntryInitializationSeed } from './initialization.js';
import { loadMetadataHierarchySnapshot } from '../hierarchy/data.js';
import { planEntryResources } from './resource-plan.js';

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
  surface: {
    purpose?: string;
    forceReadOnly?: boolean;
    title?: string;
    titleIcon?: string;
    breadcrumbItems?: Array<{ label: string; href: string | null }>;
    pageModel?: Record<string, unknown>;
    uiViewKey?: string;
    showEntryActions?: boolean;
  } = {},
): Promise<void> {
  const currentUser = res.locals.currentUser as SysBOUser | null;
  // Route orchestration already resolved the authoritative API capability
  // snapshot for this exact collection/record scope. Do not recalculate policy
  // inside the renderer or issue a second capability request.
  const effectivePermissions = permissions;
  const invocation = entryInvocation(req);
  const directHostFragment = req.query._entryDirectHost === '1';
  const pageEntryLevelPath =
    surface.purpose === 'open-account-entry'
      ? 'ctx.ui.level'
      : record.parentOwnerContext
        ? 'ctx.ui.level.level.level'
        : 'ctx.ui.level.level';
  const directHostPath =
    directHostFragment && typeof req.query._entryCtxPath === 'string'
      ? req.query._entryCtxPath.trim()
      : '';
  if (directHostFragment && !/^ctx\.ui\.level(?:\.level)+$/.test(directHostPath)) {
    throw createError(400, 'Direct entry host requires a canonical UI-level CTX path.');
  }
  const [metadata, canonicalMetadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const resolvedUIView = resolveSysBOUIView(
    canonicalMetadataUI,
    surface.uiViewKey ?? invocation.uiViewKey,
  );
  const invocationMetadataUI = effectiveEntryUIMetadata(resolvedUIView.metadata, invocation);
  const metadataUI = {
    ...invocationMetadataUI,
    record: {
      ...invocationMetadataUI.record,
      ...(invocationMetadataUI.record.relatedCollections && {
        relatedCollections: Object.fromEntries(
          Object.entries(invocationMetadataUI.record.relatedCollections).map(
            ([key, relationship]) => {
              const relatedKey = relationship.relatedEntityKey ?? relationship.entityKey;
              const relatedMetadata =
                allSysBOUIMetadata[relatedKey as keyof typeof allSysBOUIMetadata];
              return [key, resolveSysBOUIRelatedCollection(relationship, relatedMetadata)];
            },
          ),
        ),
      }),
    },
  };
  const recordMode =
    surface.forceReadOnly || metadataUI.record.readOnly === true || invocation.mode === 'view'
      ? 'view'
      : record.isNew
        ? 'create'
        : effectivePermissions.update
          ? 'edit'
          : 'view';
  const declaredUIViewKeys = canonicalMetadataUI.uiViews
    ? Object.keys(canonicalMetadataUI.uiViews)
    : [resolvedUIView.key];
  const entryUIViewCatalog = declaredUIViewKeys.map((key) => {
    const resolved = resolveSysBOUIView(canonicalMetadataUI, key);
    return {
      key: resolved.key,
      label: resolved.label ?? resolved.key,
      viewType: resolved.viewType,
      // A view switch preserves the owning entry mode. An intrinsically read-only
      // view is therefore incompatible with an editable surface, while every
      // view remains effectively read-only on an already read-only surface.
      readOnly: recordMode === 'view' || resolved.metadata.record.readOnly === true,
    };
  });
  const resourcePlan = planEntryResources(metadata, metadataUI, recordMode === 'view');
  /*
   * One authoritative structural projection feeds both SSR materialization and
   * browser CTX #layout.  Semantic field/action metadata remains available to
   * the renderer, but it may not independently decide tabs-vs-content topology.
   */
  const entryPresentation = entryPresentationDefinition({
    ...resolvedUIView,
    metadata: metadataUI,
  });

  /* Register canonical entity knowledge before supplemental/reference projection. */
  const ctx = res.locals.ctx as ManatOSContext;
  registerContextEntity(ctx, definition.key, metadata, canonicalMetadataUI, definition.icon);

  const modeLabel = res.locals.metadataText(
    recordMode === 'create' ? '@CM.Add' : recordMode === 'edit' ? '@CM.Edit' : '@CM.View',
  );
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
    ctx,
    resourcePlan,
    recordMode === 'view',
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
     * default reconciliation belong to the browser entry-policy runtime so page and popup
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
    ctx,
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
   * The supplemental-data boundary has already selected the one authoritative
   * row representation for every source key: query rows for read-only resources,
   * or editor working rows only when metadata explicitly declares an editor.
   * CTX therefore receives one canonical projection rather than resolving a
   * precedence conflict between presentation buffers.
   */
  const collectionResources = projectCollectionResources(supplemental.collectionResourceData);
  const ownerWorkspaceMutation = record.parentOwnerContext
    ? flattenWorkspaceMutations(
        normalizeWorkspaceTransaction(record.parentOwnerContext.workspaceTransaction),
      ).find(
        (mutation) =>
          mutation.entityKey === definition.key &&
          mutation.identity ===
            String(
              record.recordId ??
                item[String(record.parentOwnerContext?.identityField ?? 'id')] ??
                '',
            ),
      )
    : undefined;
  /*
   * An owner-managed entry may be reopened after its related collections were
   * already staged into the aggregate transaction. In that case the workspace
   * mutation, not the repository snapshot loaded as supplemental data, is the
   * authoritative working copy. Preserve the original collection baseline while
   * rematerializing the staged current rows so another Save cannot accidentally
   * replace pending aggregate work with stale repository state.
   */
  const canonicalCollections = Object.fromEntries(
    Object.entries(collectionResources).map(([key, resource]) => {
      const staged = ownerWorkspaceMutation?.collections?.[key];
      return [
        key,
        staged
          ? { original: staged.original, current: staged.current }
          : { original: resource.original, current: resource.current },
      ];
    }),
  );
  if (Object.keys(collectionResources).length) {
    // References remain factual resource catalogues. Mutable collection drafts live
    // at the canonical entry-level `collections` branch consumed by the V2 runtime.
    surfaceResources.collections = Object.fromEntries(
      Object.entries(collectionResources)
        .filter(([, resource]) => resource.references && Object.keys(resource.references).length)
        .map(([key, resource]) => [key, { references: resource.references }]),
    );
    if (!Object.keys(surfaceResources.collections as Record<string, unknown>).length) {
      delete surfaceResources.collections;
    }
  }
  const hierarchyDescriptor = resourcePlan.componentKeys.has('hierarchy-tree')
    ? metadataHierarchyWorkspaceDescriptor(metadata, metadataUI)
    : null;
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

  const entityLabel = res.locals.metadataText(metadata.label);
  const defaultTitle = `${modeLabel} ${entityLabel}${primaryDisplayValue}`;
  const defaultBreadcrumbLabel = `${modeLabel} ${entityLabel}`;
  await renderPage(res, 'pages/sysbo/entry', {
    title: surface.title ?? defaultTitle,
    titleIcon: surface.titleIcon ?? definition.icon,
    breadcrumbItems: surface.breadcrumbItems ?? [
      { label: 'ManatOS', href: '/' },
      {
        label: res.locals.metadataText(metadata.pluralLabel),
        href: `/bo/${encodeURIComponent(definition.key)}`,
      },
      { label: defaultBreadcrumbLabel, href: null },
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
    ownerCollectionBaselines: Object.fromEntries(
      Object.entries(canonicalCollections).map(([key, collection]) => [key, collection.original]),
    ),
    entryPopupHost: invocation.popup,
    directHostFragment,
    /*
     * V2 entry pages own their TitleBar + entry-content composition.
     * Popup-hosted V2 entries render only host-neutral entry content because
     * popup caption/lifecycle are owned by the outer PopupHost.
     */
    workspaceFrameOwner: 'content',
    entryPopupToken: invocation.token,
    entryDensity: invocation.density,
    entryRecoverable: invocation.recoverable,
    entryInvocationDefaults: invocation.defaults,
    entryInvocationOverrides: invocation.uiOverrides,
    entryUIViewKey: resolvedUIView.key,
    entryUIViewType: resolvedUIView.viewType,
    entryUIViewCatalog,
    entryUIViewMetadata: metadataUI,
    entryPresentation,
    entryActionsVisible: surface.showEntryActions !== false,
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
      purpose: surface.purpose ?? 'open-entity-entry',
      showEntryActions: surface.showEntryActions !== false,
      // PAGE entry surfaces are the canonical child of the page shell level.
      // Direct hosts (POPUP/embedded) provide their already-created canonical path.
      // Templates consume this identity; they never infer CTX topology themselves.
      levelPath: directHostPath || pageEntryLevelPath,
      entityKey: definition.key,
      entityName: metadata.name,
      pluralName: metadata.pluralLabel,
      icon: definition.icon,
      title: surface.title ?? defaultTitle,
      recordId: record.recordId ?? null,
      isNew: record.isNew,
      readOnly: recordMode === 'view',
      popup: invocation.popup,
      recoverable: invocation.recoverable,
      defaults: invocation.defaults,
      uiOverrides: invocation.uiOverrides,
      uiView: { key: resolvedUIView.key, viewType: resolvedUIView.viewType, metadata: metadataUI },
      parentEntries: parentItems,
      parentPresentationDefinition: parentListContext.presentationDefinition,
      ...(record.parentOwnerContext
        ? {
            owner: {
              name: String(record.parentOwnerContext.name ?? 'hierarchy'),
              mode: String(record.parentOwnerContext.mode ?? 'edit'),
              identityField: String(record.parentOwnerContext.identityField ?? 'id'),
              entries: Array.isArray(record.parentOwnerContext.entries)
                ? record.parentOwnerContext.entries
                : [],
              originalEntries: Array.isArray(record.parentOwnerContext.entriesOriginal)
                ? record.parentOwnerContext.entriesOriginal
                : [],
              // The owner remains a distinct ancestor UiLevel on an owned-Entry page.
              // Preserve its workspace state as owner state; none of this belongs to
              // the Entry surface itself.
              fields:
                record.parentOwnerContext.fields &&
                typeof record.parentOwnerContext.fields === 'object' &&
                !Array.isArray(record.parentOwnerContext.fields)
                  ? { ...(record.parentOwnerContext.fields as Record<string, unknown>) }
                  : {},
              workspaceTransaction: record.parentOwnerContext.workspaceTransaction,
              recycleBin: Array.isArray(record.parentOwnerContext.recycleBin)
                ? record.parentOwnerContext.recycleBin
                : [],
              runtimeResources:
                record.parentOwnerContext.runtimeResources &&
                typeof record.parentOwnerContext.runtimeResources === 'object' &&
                !Array.isArray(record.parentOwnerContext.runtimeResources)
                  ? record.parentOwnerContext.runtimeResources
                  : {},
              recoveryUrl: record.parentOwnerContext.recoveryUrl ?? null,
            },
          }
        : {}),
      navigation: entryNavigation,
      entry: {
        // An owned Entry starts a fresh local editing baseline from the owner's
        // accepted current state. The owner's transaction baseline stays with Owner.
        original: v2OriginalValues,
        current: v2ServerValues,
        // Entity capability policy is a runtime fact consumed by declarative
        // entry-action expressions. It belongs to the client surface scope, not
        // to server-side UI decision execution.
        facts: { ...v2RuntimeFacts, permissions: effectivePermissions },
      },
      resources: surfaceResources,
      ...(Object.keys(canonicalCollections).length ? { collections: canonicalCollections } : {}),
    },
    ...(surface.pageModel ?? {}),
  });
}
