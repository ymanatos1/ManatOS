import { describe, expect, it } from 'vitest';
import { UiSurfaceLayoutHighlight } from '../../src/debugger/layout/UiSurfaceLayoutHighlight.js';
import type { CtxTreeSource } from '../../src/debugger/ctx-inspection.js';

const PATH = 'ctx.ui.level.layout.Entry';
const OWNER = 'ctx.ui.level';
const PROPERTIES = Symbol.for('manatos.ctx.node-properties');

/** Minimal measured host DOM: keep tests independent of browser/Angular packages. */
function fixture() {
  const overlays: { remove: () => void; style: Record<string, unknown> }[] = [];
  const bounds = { left: 12, top: 15, right: 110, bottom: 75 };
  const root = {
    dataset: { uiLevelPath: OWNER },
    isConnected: true,
    getClientRects: () => [bounds],
    matches: () => false,
    querySelectorAll: () => [target],
  };
  const target = {
    getClientRects: () => [bounds],
    getBoundingClientRect: () => bounds,
    closest: (selector: string) => (selector === '[data-ui-level-path]' ? root : null),
  };
  const doc = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelectorAll: () => [root],
    createElement: () => {
      const overlay = {
        style: {} as Record<string, unknown>,
        remove: () => {
          const at = overlays.indexOf(overlay);
          if (at >= 0) overlays.splice(at, 1);
        },
        setAttribute: () => undefined,
      };
      return overlay;
    },
    body: { appendChild: (element: (typeof overlays)[number]) => overlays.push(element) },
  };
  const node = { [PROPERTIES]: { domSelector: '[data-entry-layout-id="Entry"]' } };
  const source = {
    get: (path: string) => (path === PATH ? node : null),
  } as CtxTreeSource;
  return { overlays, doc: doc as unknown as Document, source };
}

describe('CTX layout highlighting is hover-only', () => {
  it('does not paint selection and clears immediately after hover leaves', () => {
    const { overlays, doc, source } = fixture();
    const highlight = new UiSurfaceLayoutHighlight(doc);
    highlight.select(PATH, source);
    expect(overlays).toHaveLength(0);
    highlight.enter(PATH, source);
    expect(overlays).toHaveLength(1);
    highlight.select(PATH, source);
    expect(overlays).toHaveLength(1);
    highlight.leave(PATH);
    expect(overlays).toHaveLength(0);
    highlight.sync(PATH, source);
    expect(overlays).toHaveLength(0);
    highlight.dispose();
  });

  it('clears a hover if its CTX row disappears during reconciliation', () => {
    const { overlays, doc, source } = fixture();
    const highlight = new UiSurfaceLayoutHighlight(doc);
    highlight.enter(PATH, source);
    expect(overlays).toHaveLength(1);
    highlight.pruneVisiblePaths(new Set(['ctx.ui.level.layout.Other']));
    expect(overlays).toHaveLength(0);
    highlight.select(PATH, source);
    expect(overlays).toHaveLength(0);
    highlight.dispose();
  });
});
