import type { Request, Response } from 'express';
import createError from 'http-errors';
import {
  resolveEntryRepresentation,
  type ManatOSContext,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { renderPage } from '../../presentation/render-page.js';
import { metadataOptionItemForField } from '../../presentation/metadata-value-presentation.js';
import {
  hierarchyFinalizationState,
  hierarchyRootIdForMember,
  metadataHierarchyWorkspaceDescriptor,
} from '../../presentation/metadata-hierarchy-workspace.js';
import {
  contextFields,
  entityContextName,
  pageCollectionRuntimeContext,
  pageContextNode,
  pageListRuntimeContext,
  registerContextEntity,
  setPageContext,
} from '../../context/manatos-context.js';
import type { SysBODefinition } from '../../sysbo/types.js';

import { apiPathFor, canonicalSysBOMetadata, canonicalSysBOUIMetadata, type SysBOListData } from './data-access.js';
import { parentListContextForEntry } from './parent-list.js';
import { metadataDrivenListQuery } from './list-query.js';
import type { UIEntityPermissions } from '../../sysbo/permissions.js';
import { compiledEntryRepresentationRuntime } from './entry-representation-runtime.js';

/**
 * Render a metadata-declared hierarchy workspace.
 *
 * The initial member is only the invocation/focus parameter. When its
 * calculated root field is populated that fact identifies the persisted
 * hierarchy to load; otherwise the member itself is the root candidate. Create
 * mode has no initial member and starts with an empty keyed working graph.
 *
 * CTX deliberately mirrors normal navigation nesting:
 *   ctx.page              -> entity/list context
 *   ctx.page.page         -> hierarchy workspace
 *   ctx.page.page.page    -> reserved for a member editor opened in-workspace
 *
 * entriesOriginal[]/entries[] on the workspace contain the complete hierarchy.
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
  );

  let focusedMember: Record<string, unknown> | null = null;
  let hierarchyItems: Record<string, unknown>[] = [];
  let hierarchyRootId: string | null = null;

  if (workspaceOverride) {
    hierarchyItems = workspaceOverride.entries.map((item) => ({ ...item }));
    const overrideFocusedId = workspaceOverride.focusedMemberId ?? initialMemberId;
    focusedMember = overrideFocusedId
      ? hierarchyItems.find((item) => String(item[hierarchyDescriptor.idField] ?? '') === String(overrideFocusedId)) ?? null
      : null;
    hierarchyRootId = focusedMember ? hierarchyRootIdForMember(focusedMember, hierarchyDescriptor) : null;
  } else if (initialMemberId) {
    // Keep the freshly loaded member in a non-null local. Besides making the
    // invariant explicit, this preserves TypeScript narrowing throughout the
    // asynchronous hierarchy-discovery branch.
    const loadedFocusedMember = await apiClient.get<Record<string, unknown>>(
      `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(initialMemberId)}`,
      apiSessionOptions(req),
    ).then((response) => response.data);
    focusedMember = loadedFocusedMember;
    hierarchyRootId = hierarchyRootIdForMember(loadedFocusedMember, hierarchyDescriptor);

    if (!hierarchyRootId) {
      throw createError(500, `The selected ${metadata.name} does not expose a valid hierarchy identity.`);
    }

    const hierarchyById = new Map<string, Record<string, unknown>>();
    const addRow = (row: Record<string, unknown> | null | undefined) => {
      if (!row) return;
      const id = row[hierarchyDescriptor.idField];
      if (id !== null && id !== undefined && String(id) !== '') {
        hierarchyById.set(String(id), row);
      }
    };

    if (hierarchyDescriptor.rootField) {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '10000',
        sort: hierarchyDescriptor.labelField,
        direction: 'asc',
      });
      params.set(`filter.${hierarchyDescriptor.rootField}`, hierarchyRootId);

      const [membersResponse, rootMember] = await Promise.all([
        apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${apiPathFor(definition.key)}?${params.toString()}`,
          apiSessionOptions(req),
        ),
        String(loadedFocusedMember[hierarchyDescriptor.idField] ?? '') === hierarchyRootId
          ? Promise.resolve(loadedFocusedMember)
          : apiClient.get<Record<string, unknown>>(
              `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(hierarchyRootId)}`,
              apiSessionOptions(req),
            ).then((response) => response.data),
      ]);

      addRow(rootMember);
      for (const row of membersResponse.data.items) addRow(row);
      addRow(loadedFocusedMember);
    } else {
      /*
       * A future self-referencing entity may not materialize a root field. In
       * that case load the entity snapshot and derive only the connected tree
       * containing the initial member from the declared parent field.
       */
      const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
        `/api/v1/${apiPathFor(definition.key)}?page=1&pageSize=10000&sort=${encodeURIComponent(hierarchyDescriptor.labelField)}&direction=asc`,
        apiSessionOptions(req),
      );
      const allById = new Map(
        response.data.items
          .map((row) => [String(row[hierarchyDescriptor.idField] ?? ''), row] as const)
          .filter(([id]) => Boolean(id)),
      );

      let rootCandidate: Record<string, unknown> | null = loadedFocusedMember;
      const visited = new Set<string>();
      while (rootCandidate) {
        const currentId = String(rootCandidate[hierarchyDescriptor.idField] ?? '');
        if (!currentId || visited.has(currentId)) break;
        visited.add(currentId);
        const parentId = rootCandidate[hierarchyDescriptor.parentField];
        if (parentId === null || parentId === undefined || String(parentId) === '') break;
        const parent = allById.get(String(parentId));
        if (!parent) break;
        rootCandidate = parent;
      }
      hierarchyRootId = String(rootCandidate?.[hierarchyDescriptor.idField] ?? hierarchyRootId);

      const pending = hierarchyRootId ? [hierarchyRootId] : [];
      const included = new Set<string>();
      while (pending.length) {
        const id = pending.shift()!;
        if (included.has(id)) continue;
        included.add(id);
        addRow(allById.get(id));
        for (const [candidateId, candidate] of allById) {
          if (String(candidate[hierarchyDescriptor.parentField] ?? '') === id) pending.push(candidateId);
        }
      }
      addRow(focusedMember);
    }

    hierarchyItems = [...hierarchyById.values()].sort((left, right) =>
      String(left[hierarchyDescriptor.labelField] ?? '').localeCompare(
        String(right[hierarchyDescriptor.labelField] ?? ''),
        undefined,
        { sensitivity: 'base' },
      ),
    );
  }

  const hierarchyRuntime = workspaceOverride
    ? {
        entriesOriginal: Object.freeze(workspaceOverride.entriesOriginal.map((item) => Object.freeze({ ...item }))),
        entries: Object.freeze(hierarchyItems.map((item) => Object.freeze({ ...item }))),
      }
    : pageCollectionRuntimeContext(hierarchyItems);
  const finalization = hierarchyFinalizationState(hierarchyItems, metadata, hierarchyDescriptor);
  const hierarchyMode = workspaceOverride?.mode ?? (initialMemberId ? 'edit' : 'create');
  const breadcrumbTitle = `${hierarchyMode === 'create' ? 'Create' : 'Edit'} ${hierarchyDescriptor.label}`;
  const focusedId = focusedMember
    ? String(focusedMember[hierarchyDescriptor.idField] ?? workspaceOverride?.focusedMemberId ?? initialMemberId ?? '') || null
    : (workspaceOverride?.focusedMemberId ?? null);

  const ctx = res.locals.ctx as ManatOSContext;
  registerContextEntity(ctx, definition.key, metadata, metadataUI);

  const hierarchyPage = pageContextNode(
    hierarchyDescriptor.key,
    'sysbo-hierarchy',
    hierarchyMode,
    contextFields({
      title: breadcrumbTitle,
      entity: entityContextName(definition.key),
      initialMemberId: focusedId,
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
    }),
    null,
    hierarchyRuntime,
  );

  const parentItems = Array.isArray(parentListContext.items)
    ? parentListContext.items.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  const parentQuery = parentListContext.query && typeof parentListContext.query === 'object' && !Array.isArray(parentListContext.query)
    ? parentListContext.query as Readonly<Record<string, unknown>>
    : {};
  const listPage = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
      ...(parentListContext.paging !== undefined ? { paging: parentListContext.paging } : {}),
      ...(parentListContext.permissions !== undefined ? { permissions: parentListContext.permissions } : {}),
      ...(parentListContext.referenceData !== undefined ? { referenceData: parentListContext.referenceData } : {}),
    }),
    hierarchyPage,
    pageListRuntimeContext(parentItems, metadataUI.list.filterFields, parentQuery),
  );

  res.locals.ctx = setPageContext(ctx, listPage);

  const entryRepresentationRuntime = compiledEntryRepresentationRuntime(
    metadata,
    metadataUI,
    parentListContext.referenceData && typeof parentListContext.referenceData === 'object'
      ? parentListContext.referenceData as Readonly<Record<string, unknown>>
      : {},
  );
  const focusedRepresentation = focusedMember
    ? resolveEntryRepresentation<Record<string, unknown>>(metadata, metadataUI, focusedMember, {
        entityIcon: definition.icon,
        ...(parentListContext.referenceData && typeof parentListContext.referenceData === 'object'
          ? { referenceData: parentListContext.referenceData as Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> }
          : {}),
      })
    : null;
  const focusedLabel = focusedRepresentation?.name ?? '';
  await renderPage(res, 'components/sysbo/hierarchy/hierarchy-workspace', {
    title: focusedLabel ? `${breadcrumbTitle} - ${focusedLabel}` : breadcrumbTitle,
    titleIcon: 'bi-diagram-3',
    definition,
    metadata,
    metadataUI,
    permissions,
    focusedMember,
    hierarchyDescriptor,
    hierarchyFinalization: finalization,
    hierarchyMode,
    entryRepresentationRuntime,
    focusedRepresentation,
    selectorReferenceData: parentListContext.referenceData && typeof parentListContext.referenceData === 'object'
      ? parentListContext.referenceData
      : {},
    selectorPageSizeOptions: metadataDrivenListQuery(req, metadataUI, {}).pageSizeOptions,
    metadataOptionItemForField,
  });
}
