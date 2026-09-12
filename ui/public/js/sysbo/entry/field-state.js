/* ==========================================================================
 * Metadata-driven per-field change highlighting
 *
 * Change decoration is a pure presentation of canonical CTX field dirtiness.
 * `fields.<key>.originalValue` owns the baseline, `fields.<key>.value` owns the
 * live value, and `fields.<key>.dirty` is their derived comparison. This
 * runtime deliberately keeps no private baseline copy or independent equality
 * rule, so visual highlighting cannot drift from semantic CTX state.
 * ======================================================================== */
(() => {
  const form = document.querySelector('form.metadata-driven-record-form');
  if (!(form instanceof HTMLFormElement)) return;

  const runtime = window.ManatOS?.ctx;
  const containers = [...form.querySelectorAll('[data-ctx-field-container]')];
  if (!containers.length) return;

  const leafPagePath = () => {
    let node = runtime?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  const fieldDirty = (key) => {
    const pagePath = leafPagePath();
    return pagePath ? runtime?.get?.(`${pagePath}.fields.${key}.dirty`) === true : false;
  };

  const update = () => {
    for (const container of containers) {
      if (!(container instanceof HTMLElement)) continue;
      const key = container.dataset.ctxFieldContainer;
      if (!key) continue;
      container.classList.toggle('metadata-field-changed', fieldDirty(key));
    }
  };

  const schedule = () => queueMicrotask(update);
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  runtime?.trackSubscriber?.('*', { kind: 'form', label: 'Field changed-state' });
  window.addEventListener('manatos:ctx-change', schedule);
  form.addEventListener('manatos:form-saved', schedule);
  form.addEventListener('manatos:form-baseline-captured', schedule);

  // Initial decoration is derived from CTX exactly like every later refresh.
  requestAnimationFrame(update);
})();
