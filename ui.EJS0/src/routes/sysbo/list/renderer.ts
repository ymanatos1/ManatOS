import type { Request, Response } from 'express';

import {
  enumValuesForField,
  resolveEntryRepresentation,
  resolveSysBOUIListView,
  type ManatOSContext,
} from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { renderPage } from '../../../presentation/page/render-page.js';
import { metadataComponentPartialFor } from '../../../presentation/metadata/component-registry.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import { registerContextEntity } from '../../../context/manatos-context.js';
import { metadataDrivenListQuery, metadataEntrySearchField } from './query.js';
import { listPresentationDefinition } from './presentation.js';
import {
  apiPathFor,
  canonicalSysBOMetadata,
  canonicalSysBOUIMetadata,
  type SysBOListData,
} from '../shared/data-access.js';
import type { UIEntityPermissions } from '../../../sysbo/permissions.js';
import { sysBOEntityListRuntime, sysBOListReferenceData } from '../shared/list-resource.js';

/**
 * Render one canonical metadata-driven SysBO browse/list page.
 *
 * This module owns list data acquisition and page presentation composition;
 * route registration remains in routes/sysbo/index.ts.
 */
export async function renderMetadataDrivenList(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: UIEntityPermissions,
): Promise<void> {
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const apiPath = apiPathFor(definition.key);
  const listQuery = metadataDrivenListQuery(
    req,
    metadataUI,
    req.query,
    metadataEntrySearchField(metadata),
  );
  const resolvedListUIView = resolveSysBOUIListView(metadataUI, listQuery.viewKey);
  const listMetadata = resolvedListUIView.metadata;

  const ctx = res.locals.ctx as ManatOSContext;
  registerContextEntity(ctx, definition.key, metadata, metadataUI, definition.icon);
  const listRuntime = sysBOEntityListRuntime(req, definition, metadata, ctx, {
    metadataUI,
    viewKey: listQuery.viewKey,
    query: listQuery.query,
    purpose: 'project calculated list record field',
  });
  const listSnapshot = await listRuntime.load();

  let hasAnyEntries = listSnapshot.paging.total > 0;
  const filtersActive =
    Boolean(listQuery.query.search) || Object.keys(listQuery.query.filters).length > 0;
  let totalEntriesUnfiltered = listSnapshot.paging.total;

  if (filtersActive) {
    const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
      `/api/v1/${apiPath}?page=1&pageSize=1`,
      apiSessionOptions(req),
    );
    totalEntriesUnfiltered = unfiltered.data.paging.total;
    if (!hasAnyEntries) hasAnyEntries = totalEntriesUnfiltered > 0;
  }

  const listReferenceData = await sysBOListReferenceData(
    req,
    definition,
    metadata,
    metadataUI,
    ctx,
    resolvedListUIView.key,
  );

  const renderQuery = {
    page: String(listSnapshot.paging.page),
    pageSize: String(listSnapshot.paging.pageSize),
    ...(listQuery.query.search ? { search: listQuery.query.search } : {}),
    ...(listQuery.query.sort ? { sort: listQuery.query.sort } : {}),
    direction: listQuery.query.direction,
    _listUIView: listQuery.viewKey,
    ...Object.fromEntries(
      Object.entries(listQuery.query.filters).map(([field, value]) => [`filter.${field}`, value]),
    ),
  };

  const listItems = [...listSnapshot.entries];

  const addConstraintFieldKey = listMetadata.addAction?.disableWhenAllEnumValuesExistForField;
  const addConstraintField = addConstraintFieldKey
    ? metadata.fieldDefinition[addConstraintFieldKey]
    : undefined;
  const addConstraintValueCount = addConstraintField
    ? enumValuesForField(addConstraintField).length
    : 0;
  const listFacts = {
    totalEntriesUnfiltered,
    addConstraintReached:
      addConstraintValueCount > 0 && totalEntriesUnfiltered >= addConstraintValueCount,
    // List action metadata resolves permissions.* from the active V2 list surface.
    // Keep this authorization-derived presentation fact observable in CTX instead
    // of manufacturing a detached evaluator scope in the browser.
    permissions,
  };

  /*
   * Client UI ownership: the server registers declarative metadata and supplies
   * list facts, but it does not construct a UI surface or evaluate UI action
   * expressions. The browser V2 host creates ctx.ui and the browser action
   * runtime interprets add/page-action metadata against these facts.
   */

  const entryRepresentations = new Map(
    listItems.map((item) => [
      String(item.id ?? ''),
      resolveEntryRepresentation<Record<string, unknown>>(metadata, metadataUI, item, {
        entityIcon: definition.icon,
        referenceData: listReferenceData,
      }),
    ]),
  );

  await renderPage(res, 'pages/sysbo/list', {
    title: metadata.pluralLabel,
    titleIcon: definition.icon,
    breadcrumbItems: [
      { label: 'ManatOS', href: '/' },
      { label: metadata.pluralLabel, href: null },
    ],
    definition,
    metadata,
    metadataUI,
    listMetadata,
    listUIViewKey: resolvedListUIView.key,
    listUIViewCatalog: Object.entries(metadataUI.list.views).map(([key, view]) => ({
      key,
      label: view.label || (key === 'main' ? 'Standard' : key),
      visibleFields: resolveSysBOUIListView(metadataUI, key).metadata.visibleFields,
    })),
    permissions,
    hasAnyEntries,
    referenceData: listReferenceData,
    items: listItems,
    paging: listSnapshot.paging,
    pageSizeOptions: listQuery.pageSizeOptions,
    query: renderQuery,
    metadataComponentPartialFor,
    entryRepresentations,
    uiBootstrap: {
      purpose: 'browse-entity-list',
      entityKey: definition.key,
      entityName: metadata.name,
      pluralName: metadata.pluralLabel,
      icon: definition.icon,
      list: {
        ...listSnapshot,
        resources: { referenceData: listReferenceData },
      },
      facts: listFacts,
      presentationDefinition: listPresentationDefinition(listMetadata),
    },
  });
}
