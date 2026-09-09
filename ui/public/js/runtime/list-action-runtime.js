(() => {
  'use strict';

  /*
   * Client-owned interpretation of metadata-declared list actions.
   *
   * Canonical expression source crosses the boundary. The browser compiles it
   * locally with the shared parser and evaluates it against the active V2 list
   * surface after ctx.ui has been authored by ui-host-runtime.js.
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
  const expressions = window.ManatOS?.expression;
  const compilerReady = window.ManatOS?.expressionCompilerReady;
  if (!ctx || !expressions?.evaluateAstWithScope || !compilerReady) return;

  const activeListSurface = () => {
    let level = ctx.value?.ui?.level ?? null;
    let list = null;
    while (level) {
      if (level.kind === 'list') list = level;
      level = level.level ?? null;
    }
    return list;
  };

  const surface = activeListSurface();
  if (!surface) return;
  const listFacts =
    surface.resources?.listFacts && typeof surface.resources.listFacts === 'object'
      ? surface.resources.listFacts
      : {};
  const entityContext = Object.values(ctx.value?.entities || {}).find(
    (candidate) => candidate?.key === surface.entityKey,
  );
  const entityMetadata = entityContext?.metadata || null;
  const entityUiMetadata = entityContext?.uiMetadata || null;
  const constraintFieldKey =
    entityUiMetadata?.list?.addAction?.disableWhenAllEnumValuesExistForField;
  const constraintField = constraintFieldKey
    ? entityMetadata?.fieldDefinition?.[constraintFieldKey]
    : null;
  const enumValueCount = Array.isArray(constraintField?.enumValues)
    ? constraintField.enumValues.length
    : Array.isArray(constraintField?.enumItems)
      ? constraintField.enumItems.length
      : 0;
  const addConstraintReached =
    enumValueCount > 0 && Number(listFacts.totalEntriesUnfiltered || 0) >= enumValueCount;
  const scope = { ...listFacts, addConstraintReached };

  const resolve = async (declaration, fallback) => {
    if (!declaration || typeof declaration !== 'object') return fallback;
    if (declaration.kind === 'static') return declaration.value;
    if (declaration.kind !== 'expression' || typeof declaration.source !== 'string')
      return fallback;
    try {
      const compiler = await compilerReady;
      const ast = compiler.ast(declaration.source);
      return ast ? expressions.evaluateAstWithScope(ast, scope) : fallback;
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
