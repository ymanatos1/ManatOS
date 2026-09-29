import { type Request } from 'express';

import { resolveSysBOUIListView, type SysBOMetadata, type SysBOUIMetadata } from '@manatos/shared';

import { uiBootstrapState } from '../../../bootstrap/ui-bootstrap.js';
import type { EntityListQuery } from '../../../runtime/list/entity-list-contracts.js';

export function metadataEntrySearchField(metadata: SysBOMetadata<Record<string, unknown>>): string {
  const entryNameSource = metadata.entry?.name;
  if (
    entryNameSource &&
    'field' in entryNameSource &&
    metadata.fieldDefinition[entryNameSource.field]
  ) {
    return entryNameSource.field;
  }
  if (entryNameSource && 'expression' in entryNameSource) {
    const expression = entryNameSource.expression.trim();
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expression) && metadata.fieldDefinition[expression])
      return expression;
  }
  return metadata.primaryField;
}

/**
 * Read one list filter from either supported Express query representation.
 *
 * Native form/query URLs use `filter.name=value`. Depending on the Express
 * query parser/configuration, that can arrive either as the literal dotted
 * key or as `{ filter: { name: value } }`. Treat both shapes identically so
 * list filtering is a transport/query-parser concern rather than a UI quirk.
 */
export function metadataListFilterQueryValue(
  sourceQuery: Readonly<Record<string, unknown>>,
  field: string,
): string {
  // Accept the canonical dotted browser/API query form and the equivalent
  // nested representation produced by an extended Express query parser.
  const dotted = sourceQuery[`filter.${field}`];
  if (typeof dotted === 'string') return dotted;

  const nested = sourceQuery.filter;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const value = (nested as Readonly<Record<string, unknown>>)[field];
    if (typeof value === 'string') return value;
  }

  return '';
}

export function metadataDrivenListQuery(
  req: Request,
  metadataUI: SysBOUIMetadata,
  sourceQuery: Readonly<Record<string, unknown>> = req.query,
  searchField?: string,
): {
  pageSizeOptions: number[];
  viewKey: string;
  query: EntityListQuery;
} {
  const requestedListUIView =
    typeof sourceQuery._listUIView === 'string' ? sourceQuery._listUIView : 'main';
  const resolvedList = resolveSysBOUIListView(metadataUI, requestedListUIView);
  const listMetadata = resolvedList.metadata;
  const runtimeUi = uiBootstrapState().ui;
  const pageSizeOptions = runtimeUi.pageSizeOptions.filter(
    (value) => Number.isInteger(value) && value > 0,
  );
  const safePageSizeOptions = [...new Set([runtimeUi.defaultPageSize, ...pageSizeOptions])]
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
  const requestedPageSize = Number(sourceQuery.pageSize);

  if (safePageSizeOptions.includes(requestedPageSize)) {
    req.session.uiPageSize = requestedPageSize;
  }

  const sessionPageSize = req.session.uiPageSize;
  const pageSize =
    typeof sessionPageSize === 'number' && safePageSizeOptions.includes(sessionPageSize)
      ? sessionPageSize
      : runtimeUi.defaultPageSize;

  const requestedPage = Number(sourceQuery.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters: Record<string, string> = {};

  const requestedSearch = typeof sourceQuery.search === 'string' ? sourceQuery.search.trim() : '';
  // Search is a universal list-surface affordance. For now it deliberately
  // maps onto the canonical entry-name/primary field so the UI/API contract
  // remains the existing generic filter contract rather than inventing a
  // second repository search protocol.
  const search = requestedSearch && searchField ? requestedSearch : undefined;

  const requestedSort = typeof sourceQuery.sort === 'string' ? sourceQuery.sort : '';
  const sort =
    requestedSort && listMetadata.sortableFields.includes(requestedSort)
      ? requestedSort
      : undefined;
  const direction = sort && sourceQuery.direction === 'desc' ? 'desc' : 'asc';

  for (const field of listMetadata.filterFields) {
    const value = metadataListFilterQueryValue(sourceQuery, field).trim();
    if (value) {
      filters[field] = value;
    }
  }

  const query: EntityListQuery = {
    page,
    pageSize,
    direction,
    filters,
    ...(search ? { search, searchField: searchField as string } : {}),
    ...(sort ? { sort } : {}),
  };

  return { pageSizeOptions: safePageSizeOptions, viewKey: resolvedList.key, query };
}
