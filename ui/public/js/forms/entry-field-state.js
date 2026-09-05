/* ==========================================================================
 * Metadata-driven per-field change highlighting
 *
 * Change decoration is derived from the initialized CTX/form baseline rather
 * than from a one-way input latch. Direct edits and evaluator/calculation writes
 * therefore use the same reversible rule, and returning to the original value
 * removes the visual marker again.
 * ======================================================================== */
(() => {
  const form = document.querySelector('form.metadata-driven-record-form');
  if (!(form instanceof HTMLFormElement)) return;

  const runtime = window.ManatOS?.ctx;
  const containers = [...form.querySelectorAll('[data-ctx-field-container]')];
  if (!containers.length) return;

  const leafPagePath = () => {
    if (!runtime?.value?.page) return null;
    let node = runtime.value.page;
    let path = 'ctx.page';
    while (node?.page) { node = node.page; path += '.page'; }
    return path;
  };

  const cloneValue = (value) => {
    if (value === undefined) return undefined;
    try { return structuredClone(value); }
    catch {
      try { return JSON.parse(JSON.stringify(value)); }
      catch { return value; }
    }
  };

  const sameValue = (left, right) => {
    try { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
    catch { return String(left ?? '') === String(right ?? ''); }
  };

  const domFieldValue = (container, key) => {
    const control = container.querySelector('[data-ctx-field]');
    if (control instanceof HTMLInputElement) {
      if (control.type === 'checkbox') return control.checked;
      if (control.dataset.ctxValueType === 'duration') {
        if (!control.value) return null;
        try { return JSON.parse(control.value); } catch { return control.value; }
      }
      return control.value;
    }
    if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) return control.value;
    return undefined;
  };

  const fieldValue = (container, key) => {
    const pagePath = leafPagePath();
    const ctxValue = pagePath ? runtime?.get?.(`${pagePath}.entry.${key}`) : undefined;
    return ctxValue !== undefined ? ctxValue : domFieldValue(container, key);
  };

  const baselines = new Map();

  const captureBaselines = () => {
    baselines.clear();
    for (const container of containers) {
      if (!(container instanceof HTMLElement)) continue;
      const key = container.dataset.ctxFieldContainer;
      if (key) baselines.set(key, cloneValue(fieldValue(container, key)));
    }
  };

  const update = () => {
    for (const container of containers) {
      if (!(container instanceof HTMLElement)) continue;
      const key = container.dataset.ctxFieldContainer;
      if (!key || !baselines.has(key)) continue;
      const changed = !sameValue(baselines.get(key), fieldValue(container, key));
      container.classList.toggle('metadata-field-changed', changed);
    }
  };

  const schedule = () => queueMicrotask(update);
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  window.addEventListener('manatos:ctx-change', schedule);
  form.addEventListener('manatos:form-saved', () => {
    captureBaselines();
    update();
  });

  // Wait until create defaults and first-pass calculations have settled. They
  // are the visual baseline; only subsequent user/causal changes are marked.
  requestAnimationFrame(() => {
    captureBaselines();
    update();
  });
})();
