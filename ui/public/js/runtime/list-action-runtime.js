(async () => {
  'use strict';

  /*
   * Client-owned interpretation of metadata-declared list actions.
   *
   * Canonical authored source crosses the presentation boundary. The AST is
   * resolved from the process-prepared expression registry by exact source.
   */
  const metadataElement = document.getElementById('manatosListActionMetadata');
  if (!metadataElement) return;

  let metadata;
  try {
    metadata = JSON.parse(metadataElement.textContent || 'null');
  } catch {
    metadata = null;
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;

  const ctx = window.ManatOS?.ctx;
  const expressionRuntimeReady = window.ManatOS?.expressionRuntimeReady;
  if (!ctx || !expressionRuntimeReady) return;

  const expressions = await expressionRuntimeReady;
  if (!expressions?.evaluateAstOwnedAt) return;

  const activeListSurface = () => {
    let level = ctx.value?.ui?.level ?? null;
    let ctxPath = 'ctx.ui.level';
    let list = null;
    while (level) {
      if (level.control?.kind === 'list') list = { surface: level, ctxPath };
      level = level.level ?? null;
      ctxPath += '.level';
    }
    return list;
  };

  const activeList = activeListSurface();
  if (!activeList) return;
  const { ctxPath } = activeList;

  const resolve = async (declaration, fallback) => {
    if (!declaration || typeof declaration !== 'object') return fallback;
    if (declaration.kind === 'static') return declaration.value;
    if (declaration.kind !== 'expression' || typeof declaration.source !== 'string')
      return fallback;
    const ast = await expressions.loadAstForSource?.(declaration.source);
    if (!ast) return fallback;
    try {
      return await expressions.evaluateAstOwnedAt(ast, ctxPath);
    } catch (error) {
      console.error('[ManatOS list action expression]', {
        expression: declaration.source || null,
        error,
      });
      return fallback;
    }
  };

  const setEnabled = (element, enabled, reason) => {
    const href = element.dataset.actionHref || '#';
    element.classList.toggle('disabled', !enabled);
    if (enabled) {
      element.setAttribute('href', href);
      element.removeAttribute('aria-disabled');
      element.removeAttribute('tabindex');
      if (element.dataset.actionTitle) element.title = element.dataset.actionTitle;
      return;
    }
    element.setAttribute('href', '#');
    element.setAttribute('aria-disabled', 'true');
    element.setAttribute('tabindex', '-1');
    element.title = String(reason || 'Creation is currently unavailable.');
  };

  const apply = async (selector, declaration, { enabled = false } = {}) => {
    const visible = (await resolve(declaration?.visible, true)) !== false;
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement)) continue;
      element.hidden = !visible;
      if (!visible || !enabled) continue;
      const isEnabled = (await resolve(declaration?.enabled, true)) !== false;
      const reason = await resolve(declaration?.disabledReason, null);
      setEnabled(element, isEnabled, reason);
    }
  };

  void (async () => {
    await apply('[data-v2-list-action="add"]', metadata.add, { enabled: true });
    for (const action of Array.isArray(metadata.pageActions) ? metadata.pageActions : []) {
      if (!action || typeof action !== 'object' || !action.key) continue;
      await apply(`[data-v2-list-action="page:${CSS.escape(String(action.key))}"]`, action);
    }
  })();
})();
