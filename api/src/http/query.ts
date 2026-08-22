import type { Request } from 'express';

import type { ListQuery } from '../storage/in-memory-repository.js';

/**
 * Converts the standard SysBO HTTP query-string parameters into
 * the storage-neutral ListQuery structure.
 *
 * Supported parameters:
 *
 *   ?page=1
 *   ?pageSize=20
 *   ?sort=name
 *   ?direction=asc
 *   ?filter.name=test
 *   ?filter.enabled=true
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
   * Protect the API from excessively large page requests.
   *
   * The current hard maximum is 500 records per page.
   */
  const pageSize = Math.min(
    positiveInteger(req.query.pageSize, 20),

    500,
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

  return {
    page,
    pageSize,

    ...(sort ? { sort } : {}),

    direction,
    filters,
  };
}
