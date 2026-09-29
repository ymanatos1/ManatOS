(() => {
  'use strict';

  const tools = window.ManatOS?.surfaceTools;
  if (!tools?.register) return;

  const parseCatalog = (anchor) => {
    try {
      const value = JSON.parse(anchor.dataset.listUiViewCatalog || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const apply = (anchor, key) => {
    const catalog = parseCatalog(anchor);
    const view = catalog.find((candidate) => String(candidate?.key || '') === key);
    if (!view) return false;
    const visible = new Set(
      Array.isArray(view.visibleFields) ? view.visibleFields.map(String) : [],
    );
    const scope =
      anchor.closest('section, [data-selector-surface], .modal-content, .card') || document;
    scope.querySelectorAll('[data-list-field]').forEach((cell) => {
      if (cell instanceof HTMLElement)
        cell.hidden = !visible.has(String(cell.dataset.listField || ''));
    });
    anchor.dataset.listUiViewKey = key;
    tools.render(anchor);
    return true;
  };

  tools.register('list-ui-view', {
    resolve(anchor, context) {
      const kind = context?.surface?.control?.kind;
      if (
        !(anchor instanceof HTMLElement) ||
        anchor.dataset.surfaceToolsKind !== 'list' ||
        (kind !== 'list' && kind !== 'selector')
      )
        return null;
      const catalog = parseCatalog(anchor);
      const current = anchor.dataset.listUiViewKey || 'main';
      return {
        direction: anchor.dataset.surfaceToolsDirection,
        anchor,
        model: {
          groups: [
            {
              key: 'view',
              label: 'View',
              items: catalog.map((view) => ({
                key: String(view?.key || ''),
                label: String(view?.label || (view?.key === 'main' ? 'Standard' : view?.key) || ''),
                selected: String(view?.key || '') === current,
                enabled: String(view?.key || '') !== current,
              })),
            },
          ],
        },
      };
    },
    invoke(result, group, key) {
      if (group === 'view' && result?.anchor instanceof HTMLElement) apply(result.anchor, key);
    },
  });

  const initialize = (root = document) => {
    const anchors = [];
    if (root instanceof HTMLElement && root.matches('[data-surface-tools-kind="list"]'))
      anchors.push(root);
    root
      .querySelectorAll?.('[data-surface-tools-kind="list"]')
      .forEach((anchor) => anchors.push(anchor));
    for (const anchor of anchors) {
      const key = anchor.dataset.listUiViewKey || 'main';
      apply(anchor, key);
    }
  };
  initialize();
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) if (node instanceof Element) initialize(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
