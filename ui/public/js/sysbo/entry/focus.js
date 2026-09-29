/* ==========================================================================
 * Metadata-driven entry initial focus
 *
 * On opening a record, focus the first editable control in the tab that is
 * already active. This helper never changes tabs: navigation belongs to the UI,
 * and CTX state.navigation only observes the resulting selected tab.
 * ======================================================================== */
(() => {
  'use strict';

  const surfaceRuntime = window.ManatOS?.entrySurfaces;
  if (!surfaceRuntime?.register) return;

  const instances = new WeakMap();

  const editableControlSelector = [
    'input:not([type="hidden"]):not([disabled]):not([readonly]):not([aria-hidden="true"])',
    'select:not([disabled]):not(.visually-hidden):not([aria-hidden="true"])',
    'textarea:not([disabled]):not([readonly]):not([aria-hidden="true"])',
    '[data-metadata-enum-toggle]:not([disabled])',
  ].join(',');

  const editableControlIn = (pane) => {
    if (!(pane instanceof HTMLElement) || pane.hidden) return null;
    return (
      [...pane.querySelectorAll(editableControlSelector)].find((control) => {
        if (!(control instanceof HTMLElement)) return false;
        const container = control.closest('[data-ctx-field-container]');
        return !container?.hidden;
      }) ?? null
    );
  };

  const install = (form) => {
    if (!(form instanceof HTMLFormElement) || instances.has(form)) return true;
    const pagePath = form.dataset.ctxScopePath || null;
    if (!pagePath) return false;

    const instance = { pagePath, initialFocusApplied: false, disposed: false };
    instances.set(form, instance);

    const focusInitialEditableField = () => {
      if (instance.initialFocusApplied || instance.disposed || !form.isConnected) return;
      const activePane = form.querySelector('.entity-tab-content > .tab-pane.active');
      const targetControl = editableControlIn(activePane);
      if (!(targetControl instanceof HTMLElement)) return;
      requestAnimationFrame(() => {
        if (instance.disposed || !targetControl.isConnected || targetControl.closest('[hidden]'))
          return;
        targetControl.focus({ preventScroll: true });
        instance.initialFocusApplied = document.activeElement === targetControl;
      });
    };

    form.addEventListener('manatos:form-initialized', focusInitialEditableField);
    form.addEventListener('manatos:form-state-ready', focusInitialEditableField);
    form.addEventListener('manatos:form-initialization-settled', focusInitialEditableField);

    const dispose = (event) => {
      if (String(event?.detail?.path || '') !== pagePath) return;
      instance.disposed = true;
      window.removeEventListener('manatos:ui-level-disposing', dispose);
    };
    window.addEventListener('manatos:ui-level-disposing', dispose);

    requestAnimationFrame(focusInitialEditableField);
    return true;
  };

  surfaceRuntime.register('entry-focus', install);
})();
