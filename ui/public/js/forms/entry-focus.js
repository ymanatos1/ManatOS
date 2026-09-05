/* global bootstrap */

/* ==========================================================================
 * Metadata-driven entry initial focus
 *
 * On opening a record, prefer the first editable field on the first tab. If
 * that tab is informational/read-only, activate the first later tab that has
 * an editable field and focus its first control. View-only forms simply keep
 * the normal document focus because no editable field exists.
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
    return [...pane.querySelectorAll(editableControlSelector)].find((control) => {
      if (!(control instanceof HTMLElement)) return false;
      const container = control.closest('[data-ctx-field-container]');
      // Inactive Bootstrap tab panes are display:none, so geometry cannot be
      // used here; we still need to discover their first editable field.
      return !container?.hidden;
    }) ?? null;
  };

  const focusInitialEditableField = () => {
    const panes = [...form.querySelectorAll('.entity-tab-content > .tab-pane')];
    if (!panes.length) return;

    const firstPane = panes[0];
    let targetPane = firstPane;
    let targetControl = editableControlIn(firstPane);

    if (!targetControl) {
      for (const pane of panes.slice(1)) {
        const candidate = editableControlIn(pane);
        if (candidate) {
          targetPane = pane;
          targetControl = candidate;
          break;
        }
      }
    }

    if (!(targetControl instanceof HTMLElement)) return;

    if (targetPane !== firstPane || !targetPane.classList.contains('active')) {
      const tabButton = document.querySelector(`[data-bs-target="#${CSS.escape(targetPane.id)}"]`);
      if (tabButton instanceof HTMLElement && globalThis.bootstrap?.Tab) {
        bootstrap.Tab.getOrCreateInstance(tabButton).show();
      }
    }

    requestAnimationFrame(() => targetControl.focus({ preventScroll: true }));
  };

  // Reactive visibility/editability initialization runs in microtasks. Wait one
  // animation frame so focus is based on the final first-paint field state.
  requestAnimationFrame(focusInitialEditableField);
})();
