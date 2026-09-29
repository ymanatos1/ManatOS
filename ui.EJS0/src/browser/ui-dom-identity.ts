import type { UiRuntime } from '../runtime/v2/ui-runtime.js';

const rendererAttributes = Object.freeze([
  ['field', 'data-ctx-field-container'],
  ['action', 'data-v2-entry-action'],
  ['collection', 'data-collection-source-key'],
  ['component-instance', 'data-v2-layout-component-instance'],
  ['component', 'data-metadata-component'],
  ['column', 'data-v2-layout-column'],
  ['tab', 'data-v2-tab-id'],
  ['title', 'data-v2-layout-title'],
  ['caption', 'data-v2-layout-caption'],
  ['status', 'data-v2-layout-status'],
  ['list-action', 'data-v2-list-action'],
  ['layout-action', 'data-v2-layout-action'],
  ['list-part', 'data-v2-list-part'],
  ['list-field', 'data-list-field'],
  ['list-filter-field', 'data-v2-list-filter-field'],
  ['list-filter-action', 'data-v2-list-filter-action'],
  ['region', 'data-v2-layout-region'],
  ['actions', 'data-v2-layout-actions'],
  ['list-actions', 'data-v2-list-actions'],
] as const);

const rendererToken = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'renderer';

const levelForPath = (runtime: UiRuntime, path: string) =>
  [...runtime.levels.values()].find(
    (level) => !level.isStructuralRoot && level.diagnosticIdentity.sourceCtxPath === path,
  );

const rendererRefFor = (element: Element): string | null => {
  for (const [kind, attribute] of rendererAttributes) {
    const value = element.getAttribute(attribute);
    if (value) return `${kind}:${value}`;
  }
  return null;
};

/**
 * Project typed UiLevel identity into DOM identity. CTX paths describe semantic
 * topology; levelN identifies one physical browser UiLevel instance. Renderer
 * identities are local to that level and therefore cannot collide across
 * simultaneously mounted surfaces.
 */
export const stampUiDomIdentity = (runtime: UiRuntime): void => {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-ui-level-root]')];
  for (const root of roots) {
    const path = root.dataset.ctxScopePath;
    if (!path) continue;
    const level = levelForPath(runtime, path);
    if (!level) continue;
    const newlyMounted = root.dataset.uiLevelId !== level.domId;
    root.dataset.uiLevelId = level.domId;
    if (newlyMounted) {
      window.dispatchEvent(
        new CustomEvent('manatos:ui-surface-mounted', {
          detail: Object.freeze({ path, id: level.id, domId: level.domId }),
        }),
      );
    }

    const occurrence = new Map<string, number>();
    const candidates = [root, ...root.querySelectorAll<HTMLElement>('*')];
    for (const element of candidates) {
      if (element !== root && element.closest('[data-ui-level-root]') !== root) continue;
      const rendererRef = rendererRefFor(element);
      if (!rendererRef) continue;
      const count = (occurrence.get(rendererRef) ?? 0) + 1;
      occurrence.set(rendererRef, count);
      element.dataset.uiRendererId = `${level.domId}-${rendererToken(rendererRef)}-${count}`;
      element.dataset.uiRendererRef = rendererRef;
    }
  }
};

export const installUiDomIdentity = (runtime: UiRuntime): (() => void) => {
  let scheduled = false;
  const stamp = () => {
    scheduled = false;
    stampUiDomIdentity(runtime);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(stamp);
  };
  stamp();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-ui-level-root', 'data-ctx-scope-path'],
  });
  return () => observer.disconnect();
};
