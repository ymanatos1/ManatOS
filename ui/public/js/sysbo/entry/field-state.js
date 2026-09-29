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
  'use strict';

  const surfaceRuntime = window.ManatOS?.entrySurfaces;
  const runtime = window.ManatOS?.ctx;
  if (!surfaceRuntime?.register || !runtime) return;

  const instances = new WeakMap();

  const install = (form) => {
    if (!(form instanceof HTMLFormElement) || instances.has(form)) return true;

    const pagePath = form.dataset.ctxScopePath || null;
    const surface = pagePath ? runtime.get?.(pagePath) : null;
    if (!pagePath || surface?.control?.kind !== 'entry') return false;

    const containers = [...form.querySelectorAll('[data-ctx-field-container]')];
    const instance = { pagePath, disposed: false };
    instances.set(form, instance);

    const fieldDirty = (key) => runtime?.get?.(`${pagePath}.fields.${key}.dirty`) === true;

    const update = () => {
      if (instance.disposed || runtime.get?.(pagePath) == null) return;
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
    form.addEventListener('manatos:form-saved', schedule);
    form.addEventListener('manatos:form-baseline-captured', schedule);
    const untrack = runtime.trackSubscriber?.(`${pagePath}.fields`, {
      kind: 'form',
      label: 'Field changed-state',
    });
    const onCtxChange = (event) => {
      const changedPath = String(event?.detail?.path || '');
      const relatedPaths = Array.isArray(event?.detail?.relatedPaths)
        ? event.detail.relatedPaths.map(String)
        : [];
      const prefix = `${pagePath}.fields`;
      if (
        changedPath === prefix ||
        changedPath.startsWith(`${prefix}.`) ||
        relatedPaths.some((path) => path === prefix || path.startsWith(`${prefix}.`))
      )
        schedule();
    };
    window.addEventListener('manatos:ctx-change', onCtxChange);

    const dispose = (event) => {
      if (String(event?.detail?.path || '') !== pagePath) return;
      instance.disposed = true;
      window.removeEventListener('manatos:ctx-change', onCtxChange);
      window.removeEventListener('manatos:ui-level-disposing', dispose);
      if (typeof untrack === 'function') untrack();
    };
    window.addEventListener('manatos:ui-level-disposing', dispose);

    requestAnimationFrame(update);
    return true;
  };

  surfaceRuntime.register('entry-field-state', install);
})();
