/* ==========================================================================
 * Metadata-driven entry initial focus
 *
 * On opening a record, focus the first editable control in the tab that is
 * already active. This helper never changes tabs: navigation belongs to the UI,
 * and CTX state.navigation only observes the resulting selected tab.
 * ======================================================================== */
(() => {
  const form = document.querySelector('form.metadata-driven-record-form');
  if (!(form instanceof HTMLFormElement)) return;

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
        // Inactive Bootstrap tab panes are display:none, so geometry cannot be
        // used here; we still need to discover their first editable field.
        return !container?.hidden;
      }) ?? null
    );
  };

  const focusInitialEditableField = () => {
    /*
     * Navigation ownership rule:
     * this helper never changes tabs. The active tab is established by normal
     * user/programmatic navigation (including post-engine restoration), and the
     * navigation tracker records the resulting state in CTX. Initial focus only
     * selects a suitable control inside the tab that is actually active.
     */
    const activePane = form.querySelector('.entity-tab-content > .tab-pane.active');
    const targetControl = editableControlIn(activePane);
    if (!(targetControl instanceof HTMLElement)) return;
    requestAnimationFrame(() => targetControl.focus({ preventScroll: true }));
  };

  // Reactive visibility/editability initialization runs in microtasks. Wait one
  // animation frame so focus is based on the final first-paint field state.
  requestAnimationFrame(focusInitialEditableField);
})();
