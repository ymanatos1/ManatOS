import { describe, expect, it } from 'vitest';

import { CommandRuntime } from '../../src/runtime/commands/command-runtime.js';
import type { EntityListDefinition } from '../../src/runtime/list/entity-list-contracts.js';
import { EntrySelectorRuntime } from '../../src/runtime/relationships/entry-selector-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

type Row = Readonly<{ id: string; name: string }>;

const definition = (rows: readonly Row[]): EntityListDefinition<Row> => ({
  entityKey: 'SysPrincipals',
  idField: 'id',
  columns: [{ field: 'name', label: 'Name' }],
  selectionMode: 'single',
  initialQuery: { page: 1, pageSize: 10, direction: 'asc', filters: {} },
  dataSource: {
    load: async (query) => ({
      items: rows,
      paging: { total: rows.length, page: query.page, pageSize: query.pageSize, totalPages: 1 },
    }),
  },
});

describe('V2 EntrySelectorRuntime', () => {
  it('composes the canonical EntityList runtime and returns a selected SurfaceResult', async () => {
    const surfaces = new SurfaceRuntime();
    const commands = new CommandRuntime(surfaces, surfaces.events);
    const parent = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'principal' });
    const selector = surfaces.open({
      parentId: parent.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select-existing',
      name: 'parent-selector',
      invocation: { selectionMode: 'single' },
    });
    const runtime = new EntrySelectorRuntime(
      selector,
      commands,
      definition([{ id: 'p1', name: 'One' }]),
    );

    await runtime.load();
    runtime.list.select('p1');
    const result = await runtime.select();

    expect(result).toMatchObject({ outcome: 'selected', surfaceId: selector.id, value: 'p1' });
    expect(result.record).toEqual({ id: 'p1', name: 'One' });
    expect(surfaces.find(selector.id)).toBeNull();
    expect(surfaces.activeSurface()?.id).toBe(parent.id);
  });

  it('supports unlimited nested popup ownership and restores the immediate parent on close', async () => {
    const surfaces = new SurfaceRuntime();
    const commands = new CommandRuntime(surfaces, surfaces.events);
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'root' });
    const first = surfaces.open({
      parentId: page.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'first',
    });
    const second = surfaces.open({
      parentId: first.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select-existing',
      name: 'second',
      invocation: { selectionMode: 'single' },
    });
    const third = surfaces.open({
      parentId: second.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'third',
    });

    await commands.execute({
      name: 'surface.close',
      surfaceId: third.id,
      payload: { result: { outcome: 'closed' } },
    });
    expect(surfaces.activeSurface()?.id).toBe(second.id);

    const runtime = new EntrySelectorRuntime(
      second,
      commands,
      definition([{ id: 'p2', name: 'Two' }]),
    );
    await runtime.load();
    runtime.list.select('p2');
    await runtime.select();
    expect(surfaces.activeSurface()?.id).toBe(first.id);
  });
});
