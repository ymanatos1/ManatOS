import type { Request, Response } from 'express';
import createError from 'http-errors';
import { resolveEntryRepresentation, type ManatOSContext } from '@manatos/shared';

import { renderPage } from '../../presentation/page/render-page.js';
import { metadataOptionItemForField } from '../../presentation/metadata/value-presentation.js';
import {
  hierarchyFinalizationState,
  hierarchyRootIdForMember,
  metadataHierarchyWorkspaceDescriptor,
} from '../../presentation/metadata/hierarchy-workspace.js';
import { entityContextName, registerContextEntity } from '../../context/manatos-context.js';
import type { SysBODefinition } from '../../sysbo/types.js';
import { createCalculatedRecordProjector } from '../../runtime/projection/calculated-record-projector.js';

import { canonicalSysBOMetadata, canonicalSysBOUIMetadata } from './data-access.js';
import { parentListContextForEntry } from './parent-list.js';
import { metadataDrivenListQuery } from './list-query.js';
import type { UIEntityPermissions } from '../../sysbo/permissions.js';
import { entryRepresentationRuntime } from './entry-representation-runtime.js';
import { loadMetadataHierarchySnapshot } from './hierarchy-data.js';

/**
 * Render a metadata-declared hierarchy workspace.
 *
 * The initial member is only the invocation/focus parameter. When its
 * calculated root field is populated that fact identifies the persisted
 * hierarchy to load; otherwise the member itself is the root candidate. Create
 * mode has no initial member and starts with an empty keyed working graph.
 *
 * V2 CTX mirrors normal navigation nesting through ctx.ui.level...level:
 * list owner -> hierarchy workspace -> optional nested member editor/popup.
 * The workspace list.originalEntries/list.entries pair owns the complete graph.
 * Record identity, never array position, carries business meaning.
 */
export async function renderMetadataDrivenHierarchyWorkspace(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: UIEntityPermissions,
  initialMemberId: string | null,
  workspaceOverride?: {
    entries: Record<string, unknown>[];
    entriesOriginal: Record<string, unknown>[];
    mode: 'create' | 'edit';
    focusedMemberId?: string | null;
  },
): Promise<void> {
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const hierarchyDescriptor = metadataHierarchyWorkspaceDescriptor(metadata, metadataUI);
  if (!hierarchyDescriptor) {
    throw createError(404, `${metadata.name} does not declare a hierarchy workspace.`);
  }

  const parentListContext = await parentListContextForEntry(
    req,
    definition,
    metadata,
    metadataUI,
    permissions,
    res.locals.ctx as ManatOSContext,
  );

  const ctx = res.locals.ctx as ManatOSContext;
  const projectRecord = createCalculatedRecordProjector(metadata, ctx, {
    source: 'entity-list-runtime',
    sourcePath: `ctx.entities.${entityContextName(metadata.key)}`,
    purpose: 'project calculated hierarchy-workspace record field',
  });

  let focusedMember: Record<string, unknown> | null = null;
  let hierarchyItems: Record<string, unknown>[] = [];
  let hierarchyRootId: string | null = null;

  if (workspaceOverride) {
    hierarchyItems = workspaceOverride.entries.map((item) => ({ ...item }));
    const overrideFocusedId = workspaceOverride.focusedMemberId ?? initialMemberId;
    focusedMember = overrideFocusedId
      ? (hierarchyItems.find(
          (item) => String(item[hierarchyDescriptor.idField] ?? '') === String(overrideFocusedId),
        ) ?? null)
      : null;
    hierarchyRootId = focusedMember
      ? hierarchyRootIdForMember(focusedMember, hierarchyDescriptor)
      : null;
  } else if (initialMemberId) {
    const snapshot = await loadMetadataHierarchySnapshot(
      req,
      definition,
      metadata,
      hierarchyDescriptor,
      initialMemberId,
    );
    focusedMember = { ...snapshot.focusedMember };
    hierarchyRootId = snapshot.rootId;
    hierarchyItems = snapshot.entries.map((item) => ({ ...item }));
  }

  hierarchyItems = await Promise.all(hierarchyItems.map((item) => projectRecord(item)));
  const hierarchyOriginalItems = await Promise.all(
    (workspaceOverride?.entriesOriginal ?? hierarchyItems).map((item) => projectRecord(item)),
  );
  focusedMember = focusedMember ? await projectRecord(focusedMember) : null;

  const hierarchyRuntime = {
    entriesOriginal: Object.freeze(
      hierarchyOriginalItems.map((item) => Object.freeze({ ...item })),
    ),
    entries: Object.freeze(hierarchyItems.map((item) => Object.freeze({ ...item }))),
  };
  const finalization = hierarchyFinalizationState(hierarchyItems, metadata, hierarchyDescriptor);
  const hierarchyMode = workspaceOverride?.mode ?? (initialMemberId ? 'edit' : 'create');
  const breadcrumbTitle = `${hierarchyMode === 'create' ? 'Create' : 'Edit'} ${hierarchyDescriptor.label}`;
  const focusedId = focusedMember
    ? String(
        focusedMember[hierarchyDescriptor.idField] ??
          workspaceOverride?.focusedMemberId ??
          initialMemberId ??
          '',
      ) || null
    : (workspaceOverride?.focusedMemberId ?? null);

  const parentItems = Array.isArray(parentListContext.items)
    ? parentListContext.items.filter(
        (item): item is Readonly<Record<string, unknown>> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];

  registerContextEntity(ctx, definition.key, metadata, metadataUI);
  /*
   * Runtime UI topology is browser-owned. The hierarchy workspace receives data
   * facts below, while hierarchy-workspace.js resolves the active ctx.ui leaf
   * after ui-host-runtime.js has authored the client surface chain.
   */

  const entryRepresentationConfig = entryRepresentationRuntime(
    metadata,
    metadataUI,
    parentListContext.referenceData && typeof parentListContext.referenceData === 'object'
      ? (parentListContext.referenceData as Readonly<Record<string, unknown>>)
      : {},
  );
  const focusedRepresentation = focusedMember
    ? resolveEntryRepresentation<Record<string, unknown>>(metadata, metadataUI, focusedMember, {
        entityIcon: definition.icon,
        ...(parentListContext.referenceData && typeof parentListContext.referenceData === 'object'
          ? {
              referenceData: parentListContext.referenceData as Readonly<
                Record<string, readonly Readonly<Record<string, unknown>>[]>
              >,
            }
          : {}),
      })
    : null;
  const focusedLabel = focusedRepresentation?.name ?? '';
  await renderPage(res, 'components/sysbo/hierarchy/hierarchy-workspace', {
    title: focusedLabel ? `${breadcrumbTitle} - ${focusedLabel}` : breadcrumbTitle,
    titleIcon: 'bi-diagram-3',
    breadcrumbItems: [
      { label: 'ManatOS', href: '/' },
      { label: metadata.pluralName, href: `/bo/${encodeURIComponent(definition.key)}` },
      {
        label: focusedLabel ? `${breadcrumbTitle} - ${focusedLabel}` : breadcrumbTitle,
        href: null,
      },
    ],
    definition,
    metadata,
    metadataUI,
    permissions,
    focusedMember,
    hierarchyDescriptor,
    hierarchyFinalization: finalization,
    hierarchyMode,
    entryRepresentationRuntime: entryRepresentationConfig,
    focusedRepresentation,
    selectorReferenceData:
      parentListContext.referenceData && typeof parentListContext.referenceData === 'object'
        ? parentListContext.referenceData
        : {},
    selectorPageSizeOptions: metadataDrivenListQuery(req, metadataUI, {}).pageSizeOptions,
    metadataOptionItemForField,
    uiBootstrap: {
      purpose: 'manage-entity-hierarchy',
      entityKey: definition.key,
      pluralName: metadata.pluralName,
      icon: definition.icon,
      title: breadcrumbTitle,
      create: hierarchyMode === 'create',
      workspaceName: hierarchyDescriptor.key,
      focusedMemberId: focusedId,
      parentEntries: parentItems,
      entries: hierarchyRuntime.entries,
      originalEntries: hierarchyRuntime.entriesOriginal,
      resources: {
        referenceData:
          parentListContext.referenceData &&
          typeof parentListContext.referenceData === 'object' &&
          !Array.isArray(parentListContext.referenceData)
            ? parentListContext.referenceData
            : {},
        workspace: {
          focusedMemberId: focusedId,
          hierarchyRootId,
          identityField: hierarchyDescriptor.idField,
          parentField: hierarchyDescriptor.parentField,
          rootField: hierarchyDescriptor.rootField,
          typeField: hierarchyDescriptor.typeField,
          containerTrait: hierarchyDescriptor.containerTrait,
          canHaveParentTrait: hierarchyDescriptor.canHaveParentTrait,
          rootEligibleTrait: hierarchyDescriptor.rootEligibleTrait,
          standAloneEligibleTrait: hierarchyDescriptor.standAloneEligibleTrait,
          hierarchyStatus: finalization.complete ? 'complete' : 'incomplete',
          finalizable: finalization.complete,
          draftStatus: 'none',
        },
      },
    },
  });
}
