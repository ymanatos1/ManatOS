import { describe, expect, it } from 'vitest';
import { allSysBOMetadata } from '@manatos/shared';

import { parseListQuery } from '../../src/http/query.js';

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
  it('rejects sensitive, unknown and indirect client-side predicates', () => {
    const metadata = allSysBOMetadata['sys-users'];
    const parse = (query: Record<string, unknown>) => parseListQuery({ query } as any, metadata);
    expect(() => parse({ 'filter.passwordHash': 'x' })).toThrow();
    expect(() => parse({ sort: 'passwordHash' })).toThrow();
    expect(() => parse({ 'filter.notAField': 'x' })).toThrow();
    expect(() => parse({ listExceptions: "passwordHash != ''" })).toThrow();
    expect(() => parse({ listExceptions: 'name.x == null' })).toThrow();
    expect(() => parse({ listExceptions: 'unknownField == null' })).toThrow();
    expect(() =>
      parse({ 'filter.name': 'Yiannis', sort: 'name', listExceptions: "id IN ['x']" }),
    ).not.toThrow();
  });
});
