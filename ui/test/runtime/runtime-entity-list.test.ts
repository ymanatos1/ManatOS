import { compileExpression } from '@manatos/shared';
import { describe, expect, it } from 'vitest';

import type {
  EntityListDataSource,
  EntityListQuery,
} from '../../src/runtime/list/entity-list-contracts.js';
import { entityListQueryParams } from '../../src/runtime/list/entity-list-query.js';
import { EntityListRuntime } from '../../src/runtime/list/entity-list-runtime.js';

type Row = Readonly<{ id: string; name: string }>;

function source(rows: readonly Row[], seen: EntityListQuery[]): EntityListDataSource<Row> {
  return {
    load: async (query) => {
      seen.push(query);
      return {
        items: rows,
        paging: {
          total: rows.length,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: 1,
        },
      };
    },
  };
}

describe('UI Runtime V2 EntityList', () => {
  it('uses one host-neutral query contract for browse and selector surfaces', async () => {
    const seen: EntityListQuery[] = [];
    const runtime = new EntityListRuntime<Row>({
      entityKey: 'sys-principals',
      idField: 'id',
      columns: [{ field: 'name', label: 'Name' }],
      selectionMode: 'single',
      dataSource: source([{ id: '1', name: 'Admin' }], seen),
      initialQuery: {
        page: 1,
        pageSize: 10,
        direction: 'asc',
        filters: {},
        searchField: 'name',
      },
    });

    await runtime.setSearch('Admin');
    expect(seen[0]?.search).toBe('Admin');
    expect(runtime.snapshot.entries[0]?.name).toBe('Admin');
    runtime.select('1');
    expect(runtime.selectedEntries()).toEqual([{ id: '1', name: 'Admin' }]);
  });

  it('preserves canonical list exceptions through the HTTP query adapter', () => {
    const predicate = compileExpression("id IN ['a', 'b']");
    const params = entityListQueryParams({
      page: 2,
      pageSize: 25,
      direction: 'desc',
      sort: 'name',
      filters: { enabled: 'true' },
      search: 'adm',
      searchField: 'name',
      listExceptions: predicate,
    });

    expect(params.get('filter.name')).toBe('adm');
    expect(params.get('filter.enabled')).toBe('true');
    expect(params.get('listExceptions')).toBe(predicate.source);
    expect(params.get('sort')).toBe('name');
    expect(params.get('direction')).toBe('desc');
  });

  it('keeps selection semantics in the shared runtime rather than the host', async () => {
    const seen: EntityListQuery[] = [];
    const runtime = new EntityListRuntime<Row>({
      entityKey: 'sys-principals',
      idField: 'id',
      columns: [],
      selectionMode: 'single',
      dataSource: source(
        [
          { id: '1', name: 'One' },
          { id: '2', name: 'Two' },
        ],
        seen,
      ),
      initialQuery: { page: 1, pageSize: 10, direction: 'asc', filters: {} },
    });
    await runtime.load();
    runtime.select('1');
    runtime.select('2');
    expect(runtime.snapshot.selectedIds).toEqual(['2']);
  });

  it('projects each loaded record before publishing entries and originalEntries', async () => {
    const seen: EntityListQuery[] = [];
    const runtime = new EntityListRuntime<Row>({
      entityKey: 'sys-users',
      idField: 'id',
      columns: [{ field: 'name', label: 'Name' }],
      selectionMode: 'none',
      dataSource: source([{ id: '1', name: 'yiannis' }], seen),
      projectEntry: async (entry) => ({ ...entry, name: entry.name.toUpperCase() }),
      initialQuery: { page: 1, pageSize: 10, direction: 'asc', filters: {} },
    });

    await runtime.load();
    expect(runtime.snapshot.entries).toEqual([{ id: '1', name: 'YIANNIS' }]);
    expect(runtime.snapshot.originalEntries).toEqual([{ id: '1', name: 'YIANNIS' }]);
  });
});
