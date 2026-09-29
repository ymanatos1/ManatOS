/**
 * Runtime selection for metadata-driven related-list views.
 *
 * The server renders every effective named representation from the canonical
 * entity + relationship catalogue. Selection is surface-local UI state: it
 * never mutates authored metadata or domain data and is intentionally not
 * persisted across a newly opened surface.
 */
(() => {
  const selectionPath = (host) => {
    const form = host.closest('[data-v2-entry-form]');
    const scopePath = form?.getAttribute('data-ctx-scope-path');
    const collectionKey = host.dataset.relatedListKey;
    if (!scopePath || !collectionKey) return null;
    return `${scopePath}.state.relatedLists.${collectionKey}`;
  };

  const publishSelection = (host, viewKey) => {
    const ctx = window.ManatOS?.ctx;
    const path = selectionPath(host);
    if (!ctx || !path) return;
    const scopePath = path.slice(0, path.indexOf('.state.relatedLists.'));
    const statePath = `${scopePath}.state`;
    const currentState = ctx.resolve?.(statePath);
    if (!currentState || typeof currentState !== 'object') {
      ctx.set(
        statePath,
        { relatedLists: { [host.dataset.relatedListKey]: viewKey } },
        {
          source: 'related-list-tools',
        },
      );
      return;
    }
    const relatedListsPath = `${statePath}.relatedLists`;
    const currentRelatedLists = ctx.resolve?.(relatedListsPath);
    if (!currentRelatedLists || typeof currentRelatedLists !== 'object') {
      ctx.set(
        relatedListsPath,
        { [host.dataset.relatedListKey]: viewKey },
        {
          source: 'related-list-tools',
        },
      );
      return;
    }
    ctx.set(path, viewKey, { source: 'related-list-tools' });
  };

  const selectView = (host, viewKey, publish = true) => {
    if (!host || !viewKey) return;
    const panel = [...host.querySelectorAll('[data-related-list-view-panel]')].find(
      (candidate) => candidate.dataset.relatedListViewPanel === viewKey,
    );
    if (!panel) return;

    host.dataset.relatedListSelectedView = viewKey;
    for (const candidate of host.querySelectorAll('[data-related-list-view-panel]')) {
      candidate.hidden = candidate !== panel;
    }
    for (const action of host.querySelectorAll('[data-related-list-view-action]')) {
      const selected = action.dataset.relatedListViewKey === viewKey;
      action.setAttribute('aria-checked', selected ? 'true' : 'false');
      const check = action.querySelector('[data-related-list-view-check]');
      if (check) check.hidden = !selected;
    }
    const selectedAction = host.querySelector(
      `[data-related-list-view-action][data-related-list-view-key="${CSS.escape(viewKey)}"]`,
    );
    const caption = host.querySelector('[data-related-list-view-caption]');
    const selectedLabel = selectedAction?.querySelector('span')?.textContent?.trim();
    if (caption && selectedLabel) caption.textContent = ` (${selectedLabel})`;
    if (publish) publishSelection(host, viewKey);
  };

  document.addEventListener('click', (event) => {
    const action = event.target.closest?.('[data-related-list-view-action]');
    if (!action) return;
    const host = action.closest('[data-related-list-host]');
    selectView(host, action.dataset.relatedListViewKey);
  });

  // Publish authored defaults only after the canonical CTX runtime is available.
  const publishDefaults = () => {
    for (const host of document.querySelectorAll('[data-related-list-host]')) {
      const selected = host.dataset.relatedListSelectedView;
      if (selected) selectView(host, selected, true);
    }
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', publishDefaults);
  else publishDefaults();
})();
