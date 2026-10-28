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
      viewKey: 'main',
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
    expect(runtime.snapshot.definition).toEqual({
      entityKey: 'sys-principals',
      idField: 'id',
      viewKey: 'main',
      columns: [{ field: 'name', label: 'Name' }],
      selectionMode: 'single',
    });
    expect(seen[0]?.search).toBe('Admin');
    expect(runtime.snapshot.entries[0]?.name).toBe('Admin');
    expect(runtime.snapshot.loading).toBe(false);
    runtime.select('1');
    expect(runtime.snapshot.selectedIds).toEqual(['1']);
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
      viewKey: 'main',
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

  it('projects each loaded record before publishing entries without a duplicate baseline', async () => {
    const seen: EntityListQuery[] = [];
    const runtime = new EntityListRuntime<Row>({
      entityKey: 'sys-users',
      idField: 'id',
      viewKey: 'main',
      columns: [{ field: 'name', label: 'Name' }],
      selectionMode: 'none',
      dataSource: source([{ id: '1', name: 'yiannis' }], seen),
      projectEntry: async (entry) => ({ ...entry, name: entry.name.toUpperCase() }),
      initialQuery: { page: 1, pageSize: 10, direction: 'asc', filters: {} },
    });

    await runtime.load();
    expect(runtime.snapshot.entries).toEqual([{ id: '1', name: 'YIANNIS' }]);
    expect(runtime.snapshot).not.toHaveProperty('originalEntries');
  });

  it('clears stale result data immediately on reload and preserves selection on failure', async () => {
    const pendingControl: { reject?: (error: Error) => void } = {};
    let second = false;
    const runtime = new EntityListRuntime<Row>({
      entityKey: 'sys-principals',
      idField: 'id',
      viewKey: 'main',
      columns: [],
      selectionMode: 'multiple',
      dataSource: {
        load: async () => {
          if (second)
            return new Promise<never>((_, reject) => {
              pendingControl.reject = reject;
            });
          return {
            items: [{ id: '1', name: 'One' }],
            references: { 'sys-principals': [{ id: '2', name: 'Two' }] },
            paging: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
          };
        },
      },
      initialQuery: { page: 1, pageSize: 10, direction: 'asc', filters: {} },
    });
    await runtime.load();
    runtime.select('1');
    second = true;
    const pending = runtime.setSearch('different');
    expect(runtime.snapshot.entries).toEqual([]);
    expect(runtime.snapshot.references).toEqual({});
    expect(runtime.snapshot.paging.total).toBe(0);
    expect(runtime.snapshot.loading).toBe(true);
    expect(runtime.snapshot.selectedIds).toEqual(['1']);
    pendingControl.reject?.(new Error('Offline'));
    await expect(pending).rejects.toThrow('Offline');
    expect(runtime.snapshot.loading).toBe(false);
    expect(runtime.snapshot.paging.totalPages).toBe(0);
  });

  it('retains selection across page loads so selector hosts do not own cross-page selection state', async () => {
    const runtime = new EntityListRuntime<Row>({
      entityKey: 'sys-principals',
      idField: 'id',
      viewKey: 'main',
      columns: [],
      selectionMode: 'multiple',
      dataSource: {
        load: async (query) => ({
          items: query.page === 1 ? [{ id: '1', name: 'One' }] : [{ id: '2', name: 'Two' }],
          paging: { total: 2, page: query.page, pageSize: 1, totalPages: 2 },
        }),
      },
      initialQuery: { page: 1, pageSize: 1, direction: 'asc', filters: {} },
    });

    await runtime.load();
    runtime.select('1');
    await runtime.setPage(2);
    runtime.select('2');
    expect(runtime.snapshot.selectedIds).toEqual(['1', '2']);
  });
});
