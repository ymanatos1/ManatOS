import { describe, expect, it } from 'vitest';

import { parseListQuery } from '../src/http/query.js';

describe('generic list query parsing', () => {
  it('accepts the canonical dotted filter query shape', () => {
    const query = parseListQuery({
      query: {
        page: '1',
        pageSize: '10',
        'filter.name': 'Yiannis',
        'filter.enabled': 'true',
      },
    } as any);

    expect(query.filters).toEqual({
      name: 'Yiannis',
      enabled: 'true',
    });
  });

  it('accepts the equivalent nested filter shape produced by extended Express parsers', () => {
    const query = parseListQuery({
      query: {
        page: '1',
        pageSize: '10',
        filter: {
          name: 'Yiannis',
          enabled: 'true',
        },
      },
    } as any);

    expect(query.filters).toEqual({
      name: 'Yiannis',
      enabled: 'true',
    });
  });
});
