import type { EntityListQuery } from './entity-list-contracts.js';

export function normalizeEntityListQuery(query: EntityListQuery): EntityListQuery {
  const page = Number.isInteger(query.page) && query.page > 0 ? query.page : 1;
  const pageSize = Number.isInteger(query.pageSize) && query.pageSize > 0 ? query.pageSize : 10;
  const search = query.search?.trim();
  const searchField = query.searchField?.trim();
  const sort = query.sort?.trim();
  const filters = Object.fromEntries(
    Object.entries(query.filters)
      .map(([field, value]) => [field, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  );

  return {
    page,
    pageSize,
    direction: query.direction === 'desc' ? 'desc' : 'asc',
    filters,
    ...(search ? { search } : {}),
    ...(searchField ? { searchField } : {}),
    ...(sort ? { sort } : {}),
    ...(query.listExceptions ? { listExceptions: query.listExceptions } : {}),
  };
}

/**
 * HTTP transport adapter for the existing generic SysBO list API.
 * The runtime retains the compiled predicate; only its canonical source crosses
 * the current query-string boundary. The API compiles once at its trust boundary
 * and storage receives the canonical AST, preserving future SQL translation.
 */
export function entityListQueryParams(query: EntityListQuery): URLSearchParams {
  const normalized = normalizeEntityListQuery(query);
  const params = new URLSearchParams({
    page: String(normalized.page),
    pageSize: String(normalized.pageSize),
  });

  if (normalized.search && normalized.searchField) {
    params.set(`filter.${normalized.searchField}`, normalized.search);
  }
  if (normalized.sort) {
    params.set('sort', normalized.sort);
    params.set('direction', normalized.direction);
  }
  for (const [field, value] of Object.entries(normalized.filters)) {
    params.set(`filter.${field}`, value);
  }
  if (normalized.listExceptions) {
    params.set('listExceptions', normalized.listExceptions.source);
  }
  return params;
}
