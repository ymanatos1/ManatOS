import { describe, expect, it } from 'vitest';
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import { UiSurfaceHostRuntime } from '../../src/runtime/surface/host-runtime.js';

/** Tests the framework contract, independent of NG/EJS lifecycle adapters. */
describe('nested Surface ownership', () => {
  const createTree = () =>
    new ContextTreeRuntime({ ui: {} }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
  const namespaces = () => ({ control: {}, state: {}, layout: {}, data: {} });

  it('keeps a nested popup as a child, never a second root Page', () => {
    const tree = createTree();
    const page = new UiSurfaceHostRuntime(tree, 'ctx.ui', namespaces());
    const popup = new UiSurfaceHostRuntime(tree, page.levelPath, namespaces());
    expect(popup.levelPath).toBe('ctx.ui.level.level');
    expect(() => new UiSurfaceHostRuntime(tree, 'ctx.ui', namespaces())).toThrow();
    expect(() => page.dispose()).toThrow();
    popup.dispose();
    page.dispose();
    const nextPage = new UiSurfaceHostRuntime(tree, 'ctx.ui', namespaces());
    expect(nextPage.levelPath).toBe(page.levelPath);
    nextPage.dispose();
  });

  it('releases nested List/Entry popup paths repeatedly without retaining a stale child owner', () => {
    const tree = createTree();
    for (let iteration = 0; iteration < 12; iteration++) {
      const page = new UiSurfaceHostRuntime(tree, 'ctx.ui', namespaces());
      const list = new UiSurfaceHostRuntime(tree, page.levelPath, namespaces());
      const entry = new UiSurfaceHostRuntime(tree, list.levelPath, namespaces());
      expect(page.hasChild()).toBe(true);
      expect(list.hasChild()).toBe(true);
      expect(() => list.dispose()).toThrow();
      entry.dispose();
      entry.dispose();
      expect(list.hasChild()).toBe(false);
      list.dispose();
      expect(page.hasChild()).toBe(false);
      page.dispose();
      expect(tree.get('ctx.ui.level')).toBeUndefined();
    }
  });

  it('does not remove a replacement Page when an old owner disposes again', () => {
    const tree = createTree();
    const prior = new UiSurfaceHostRuntime(tree, 'ctx.ui', namespaces());
    prior.dispose();
    const current = new UiSurfaceHostRuntime(tree, 'ctx.ui', namespaces());
    prior.dispose();
    expect(tree.get('ctx.ui.level')).toBe(current.level);
    current.dispose();
  });
});
