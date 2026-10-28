import { describe, expect, it } from 'vitest';
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import { UiSurfaceHostRuntime } from '../../src/runtime/surface/host-runtime.js';
import { dirtyEntryInUiChain } from '../../src/runtime/surface/entry-dirty-level.js';
import { UiListPageRuntime } from '../../src/components/list/ListPageRuntime.js';
import { UiEntryPageRuntime } from '../../src/components/entry/EntryRuntime.js';

/** List→Entry is a continuation of the same page hierarchy, not a second root. */
describe('nested page Entry lifecycle and dirty-close authority', () => {
  function setup() {
    const tree = new ContextTreeRuntime({
      ui: {},
    }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
    const list = new UiSurfaceHostRuntime(tree, 'ctx.ui', {
      control: { kind: 'list' },
      state: {},
      layout: {},
      data: {},
    });
    const entry = new UiSurfaceHostRuntime(tree, list.levelPath, {
      control: { kind: 'entry' },
      state: { entry: { dirty: false } },
      layout: {},
      data: {},
    });
    return { tree, list, entry };
  }

  it('reuses real List and Entry content runtimes with explicit View/Edit mode', () => {
    for (const mode of ['view', 'edit'] as const) {
      const tree = new ContextTreeRuntime({
        ui: {},
      }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
      const list = new UiListPageRuntime(tree, 'sys-users');
      const original = tree.get('ctx.ui.level');
      const entry = new UiEntryPageRuntime(
        tree,
        'sys-users',
        '11111111-1111-4111-8111-111111111111',
        undefined,
        { parentLevelPath: list.levelPath, mode, permissions: { update: true } },
      );
      expect(entry.levelPath).toBe('ctx.ui.level.level');
      expect(entry.level.state.entry.mode).toBe(mode);
      expect(tree.get('ctx.ui.level')).toBe(original);
      entry.dispose();
      expect(tree.get('ctx.ui.level')).toBe(original);
      expect(tree.get('ctx.ui.level.level')).toBeUndefined();
      list.dispose();
    }
  });

  it('supports a List Page as a nested follow-up Page, not only as a popup', () => {
    const tree = new ContextTreeRuntime({
      ui: {},
    }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
    const root = new UiEntryPageRuntime(
      tree,
      'sys-users',
      '11111111-1111-4111-8111-111111111111',
      undefined,
      { mode: 'view' },
    );
    const list = new UiListPageRuntime(tree, 'sys-users', undefined, {
      host: 'page',
      parentLevelPath: root.levelPath,
    });
    expect(list.levelPath).toBe('ctx.ui.level.level');
    list.dispose();
    expect(tree.get('ctx.ui.level')).toBe(root.level);
    root.dispose();
  });

  it('retains the exact List instance across child Entry completion', () => {
    const { tree, list, entry } = setup();
    const original = tree.get('ctx.ui.level');
    expect(tree.get('ctx.ui.level.level')).toBe(entry.level);
    entry.dispose();
    expect(tree.get('ctx.ui.level')).toBe(original);
    expect(tree.get('ctx.ui.level.level')).toBeUndefined();
    list.dispose();
    expect(tree.get('ctx.ui.level')).toBeUndefined();
  });

  it('protects edits in the child Entry even if the List root is clean', () => {
    const { tree, list, entry } = setup();
    expect(dirtyEntryInUiChain(tree)).toBeNull();
    tree.set('ctx.ui.level.level.state.entry.dirty', true);
    expect(dirtyEntryInUiChain(tree)).toBe(entry.level);
    tree.set('ctx.ui.level.level.state.entry.dirty', false);
    expect(dirtyEntryInUiChain(tree)).toBeNull();
    entry.dispose();
    list.dispose();
  });

  it('does not destroy a dirty child when trying to dispose its parent first', () => {
    const { tree, list, entry } = setup();
    tree.set('ctx.ui.level.level.state.entry.dirty', true);
    expect(() => list.dispose()).toThrow();
    expect(dirtyEntryInUiChain(tree)).toBe(entry.level);
    entry.dispose();
    list.dispose();
  });

  it('protects the deepest dirty Entry in nested page/popup chains', () => {
    const { tree, list, entry } = setup();
    tree.set('ctx.ui.level.level.state.entry.dirty', true);
    const inner = new UiSurfaceHostRuntime(tree, entry.levelPath, {
      control: { kind: 'entry' },
      state: { entry: { dirty: true } },
      layout: {},
      data: {},
    });
    expect(dirtyEntryInUiChain(tree)).toBe(inner.level);
    inner.dispose();
    expect(dirtyEntryInUiChain(tree)).toBe(entry.level);
    entry.dispose();
    list.dispose();
  });
});
