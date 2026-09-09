import { describe, expect, it } from 'vitest';

import { HierarchyWorkspaceRuntime } from '../../src/runtime/state/hierarchy-workspace-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';
import { CommandRuntime } from '../../src/runtime/commands/command-runtime.js';

type Row = Readonly<{ id: string; parentId: string | null; rootId: string | null; name: string }>;

function fixture() {
  const surfaces = new SurfaceRuntime();
  const list = surfaces.open({ host: 'page', kind: 'list', mode: 'browse', name: 'principals' });
  const surface = surfaces.open({
    parentId: list.id,
    host: 'page',
    kind: 'hierarchy',
    mode: 'edit',
    name: 'organization',
    entityKey: 'sys-principals',
    list: {
      entries: [
        { id: 'p1', parentId: null, rootId: null, name: 'Root' },
        { id: 'p2', parentId: 'p1', rootId: 'p1', name: 'Child' },
      ],
      originalEntries: [
        { id: 'p1', parentId: null, rootId: null, name: 'Root' },
        { id: 'p2', parentId: 'p1', rootId: 'p1', name: 'Child' },
      ],
    },
  });
  const runtime = new HierarchyWorkspaceRuntime<Row>({
    surface,
    surfaces,
    idField: 'id',
    parentField: 'parentId',
    rootField: 'rootId',
    complete: (entries) => ({ complete: entries.length > 0 }),
  });
  return { surfaces, list, surface, runtime };
}

describe('V2 HierarchyWorkspaceRuntime', () => {
  it('owns one working graph and immutable baseline while publishing dirty/valid state', () => {
    const { surface, runtime } = fixture();
    expect(surface.state.dirty).toBe(false);
    expect(surface.state.valid).toBe(true);

    runtime.replace([
      { id: 'p1', parentId: null, rootId: null, name: 'Root' },
      { id: 'p2', parentId: null, rootId: null, name: 'Child' },
    ]);

    expect(surface.state.dirty).toBe(true);
    expect(runtime.originalEntries()[1]?.parentId).toBe('p1');
    expect(runtime.entries()[1]?.rootId).toBeNull();
  });

  it('keeps child selectors/entries as ordinary V2 descendants and restores the workspace', async () => {
    const { surfaces, surface } = fixture();
    const commands = new CommandRuntime(surfaces, surfaces.events);
    const selector = surfaces.open({
      parentId: surface.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'existing-member',
    });
    const entry = surfaces.open({
      parentId: selector.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'member',
    });

    await commands.execute({
      name: 'surface.close',
      surfaceId: selector.id,
      payload: { result: { outcome: 'cancelled' } },
    });

    expect(surfaces.find(entry.id)).toBeNull();
    expect(surfaces.find(selector.id)).toBeNull();
    expect(surfaces.activeSurface()?.id).toBe(surface.id);
  });

  it('resets graph mutations to the owner baseline without persisting child state', () => {
    const { runtime, surface } = fixture();
    runtime.remove('p2');
    expect(surface.state.dirty).toBe(true);
    runtime.reset();
    expect(surface.state.dirty).toBe(false);
    expect(runtime.entries()).toHaveLength(2);
  });
});
