import type { Request, Response } from 'express';

import { entryTypeSource, resolveEntryRepresentation, type ManatOSContext } from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { renderPage } from '../../../presentation/page/render-page.js';
import { EntityListRuntime } from '../../../runtime/list/entity-list-runtime.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';
import { entityListQueryParams } from '../../../runtime/list/entity-list-query.js';
import { metadataComponentPartialFor } from '../../../presentation/metadata/component-registry.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import { entityContextName, registerContextEntity } from '../../../context/manatos-context.js';
import { metadataDrivenListQuery, metadataEntrySearchField } from './query.js';
import {
  apiPathFor,
  canonicalSysBOMetadata,
  canonicalSysBOUIMetadata,
  references,
  type SysBOListData,
} from '../shared/data-access.js';
import type { UIEntityPermissions } from '../../../sysbo/permissions.js';

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

  const ctx = res.locals.ctx as ManatOSContext;
  registerContextEntity(ctx, definition.key, metadata, metadataUI);
  const responseData = await loadV2EntityList(
    req,
    definition,
    apiPath,
    metadata,
    metadataUI,
    listQuery,
    createCalculatedRecordProjector(metadata, ctx, {
      source: 'entity-list-runtime',
      sourcePath: `ctx.entities.${entityContextName(metadata.key)}`,
      purpose: 'project calculated list record field',
    }),
  );

  let hasAnyEntries = responseData.paging.total > 0;
  const filtersActive =
    Boolean(listQuery.query.search) ||
    metadataUI.list.filterFields.some((field) => Boolean(listQuery.query[`filter.${field}`]));
  let totalEntriesUnfiltered = responseData.paging.total;

  if (filtersActive) {
    const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
      `/api/v1/${apiPath}?page=1&pageSize=1`,
      apiSessionOptions(req),
    );
    totalEntriesUnfiltered = unfiltered.data.paging.total;
    if (!hasAnyEntries) hasAnyEntries = totalEntriesUnfiltered > 0;
  }

  const entryType = entryTypeSource<Record<string, unknown>>(metadata);
  const entryTypeField =
    entryType && 'field' in entryType
      ? entryType.field
      : entryType &&
          'expression' in entryType &&
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryType.expression.trim())
        ? entryType.expression.trim()
        : null;
  const entryUsesRelations = Object.values(metadata.entry ?? {}).some(
    (source) => source && 'expression' in source && source.expression.includes('relations.'),
  );
  const listReferenceFields = [
    ...new Set([
      ...metadataUI.list.visibleFields,
      ...metadataUI.list.filterFields,
      ...(entryTypeField ? [entryTypeField] : []),
    ]),
  ];
  const listReferenceData =
    listReferenceFields.some(
      (fieldKey) => metadata.fieldDefinition[fieldKey]?.type === 'reference',
    ) || entryUsesRelations
      ? await references(req, definition, { ctx })
      : {};

  const renderQuery = {
    ...listQuery.query,
    pageSize: String(responseData.paging.pageSize),
  };

  const listItems = responseData.items;

  const addConstraintFieldKey = metadataUI.list.addAction?.disableWhenAllEnumValuesExistForField;
  const addConstraintField = addConstraintFieldKey
    ? metadata.fieldDefinition[addConstraintFieldKey]
    : undefined;
  const addConstraintValueCount = Array.isArray(addConstraintField?.enumItems)
    ? addConstraintField.enumItems.length
    : Array.isArray(addConstraintField?.enumValues)
      ? addConstraintField.enumValues.length
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
    permissions,
    hasAnyEntries,
    referenceData: listReferenceData,
    items: listItems,
    paging: responseData.paging,
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
      query: renderQuery,
      entries: listItems,
      originalEntries: listItems,
      facts: listFacts,
      resources: { referenceData: listReferenceData },
    },
  });
}

async function loadV2EntityList(
  req: Request,
  definition: SysBODefinition,
  apiPath: string,
  metadata: Awaited<ReturnType<typeof canonicalSysBOMetadata>>,
  metadataUI: Awaited<ReturnType<typeof canonicalSysBOUIMetadata>>,
  listQuery: ReturnType<typeof metadataDrivenListQuery>,
  projectEntry: (entry: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<SysBOListData<Record<string, unknown>>> {
  const filters = Object.fromEntries(
    metadataUI.list.filterFields
      .map((field) => [field, listQuery.query[`filter.${field}`] ?? ''] as const)
      .filter(([, value]) => value.length > 0),
  );
  const runtime = new EntityListRuntime<Record<string, unknown>>({
    entityKey: definition.key,
    idField: 'id',
    columns: metadataUI.list.visibleFields.map((field) => ({
      field,
      label: metadata.fieldDefinition[field]?.label ?? field,
      sortable: metadataUI.list.sortableFields.includes(field),
      filterable: metadataUI.list.filterFields.includes(field),
    })),
    selectionMode: 'none',
    initialQuery: {
      page: Number(listQuery.query.page ?? 1),
      pageSize: Number(listQuery.query.pageSize),
      direction: listQuery.query.direction === 'desc' ? 'desc' : 'asc',
      filters,
      searchField: metadataEntrySearchField(metadata),
      ...(listQuery.query.search ? { search: listQuery.query.search } : {}),
      ...(listQuery.query.sort ? { sort: listQuery.query.sort } : {}),
    },
    projectEntry,
    dataSource: {
      load: async (query) => {
        const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${apiPath}?${entityListQueryParams(query).toString()}`,
          apiSessionOptions(req),
        );
        return response.data;
      },
    },
  });
  const snapshot = await runtime.load();
  return { items: [...snapshot.entries], paging: snapshot.paging };
}
