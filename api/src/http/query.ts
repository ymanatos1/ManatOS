import type { Request } from 'express';

import { compileExpression } from '@manatos/shared';

import type { ListQuery } from '../storage/in-memory-repository.js';

import { config } from '../config.js';
import { runtimeNumber } from '../runtime-configuration.js';

/**
 * Converts the standard SysBO HTTP query-string parameters into
 * the storage-neutral ListQuery structure.
 *
 * Supported parameters:
 *
 *   ?page=1
 *   ?pageSize=10
 *   ?sort=name
 *   ?direction=asc
 *   ?filter.name=test
 *   ?filter.enabled=true
 *   ?listExceptions=id%20IN%20%5B%27id1%27%2C%27id2%27%5D
 *
 * Multiple filter.* parameters use AND semantics in the repository.
 */
export function parseListQuery(req: Request): ListQuery {
  /**
   * Parse a positive integer or return the supplied fallback.
   */
  const positiveInteger = (value: unknown, fallback: number): number => {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  /**
   * Pagination.
   */
  const page = positiveInteger(req.query.page, 1);

  /*
   * Protect the API from excessively large page requests while keeping
   * both the default and maximum independently configurable.
   */
  const pageSize = Math.min(
    positiveInteger(req.query.pageSize, runtimeNumber('API_DEFAULT_PAGE_SIZE', config.API_DEFAULT_PAGE_SIZE)),

    runtimeNumber('API_MAX_PAGE_SIZE', config.API_MAX_PAGE_SIZE),
  );

  /**
   * Optional ordering field.
   */
  const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;

  /**
   * Default ordering is ascending.
   *
   * Only an explicit "desc" selects descending order.
   */
  const direction = req.query.direction === 'desc' ? 'desc' : 'asc';

  /**
   * Extract filter.<fieldName>=<value> parameters.
   */
  const filters: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith('filter.') && typeof value === 'string') {
      /*
       * Remove the "filter." prefix.
       *
       * Example:
       *
       *   filter.email
       *
       * becomes:
       *
       *   email
       */
      const fieldName = key.slice(7);

      filters[fieldName] = value;
    }
  }

  /*
   * Express can also expose the same URL query as a nested object when an
   * extended query parser is active:
   *
   *   ?filter.name=Admin  ->  { filter: { name: 'Admin' } }
   *
   * Accept both representations. The HTTP contract remains filter.<field>;
   * parser configuration must not decide whether a valid list filter works.
   */
  const nestedFilters = req.query.filter;
  if (nestedFilters && typeof nestedFilters === 'object' && !Array.isArray(nestedFilters)) {
    for (const [field, value] of Object.entries(nestedFilters)) {
      if (typeof value === 'string') filters[field] = value;
    }
  }

  const listExceptionsSource = typeof req.query.listExceptions === 'string'
    ? req.query.listExceptions.trim()
    : '';
  const listExceptions = listExceptionsSource
    ? compileExpression(listExceptionsSource)
    : undefined;

  return {
    page,
    pageSize,

    ...(sort ? { sort } : {}),
    ...(listExceptions ? { listExceptions } : {}),

    direction,
    filters,
  };
}
