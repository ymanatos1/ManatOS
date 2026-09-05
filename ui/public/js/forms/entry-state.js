/* global bootstrap */

(() => {
  /* =======================================================================
   * Canonical SysBO form-state baseline + dirty navigation protection
   *
   * A single baseline is shared by Save enablement and navigation warnings.
   * It is captured in a microtask, after synchronous entity initializers (for
   * example provider callback/tenant defaults) have finished. Programmatic
   * initialization therefore never creates a false dirty state.
   * ===================================================================== */

  const form = document.querySelector('form[data-dirty-guard="true"]');

  if (form) {
    const snapshot = () => new URLSearchParams(new FormData(form)).toString();
    const state = {
      baseline: null,
      snapshot,
      isDirty: () => {
        const pendingCredentialSave = form.querySelector('[data-provider-pending-credential-save]');
        const hasPendingCredentialSave = pendingCredentialSave instanceof HTMLInputElement
          && pendingCredentialSave.value === 'true';
        return hasPendingCredentialSave
          || (state.baseline !== null && state.snapshot() !== state.baseline);
      },
      isValid: () => form.checkValidity(),
    };
    window.manatosSysBOFormState = state;

    let pending = null;
    let allowPageExit = false;

    // Dirty state is a reversible comparison with the persisted/form baseline.
    // Returning every submitted value to its original value therefore makes the
    // form clean again; calculated display-only controls do not participate.
    const dirty = () => state.isDirty();

    window.manatosRetry = () => form.requestSubmit();
    window.manatosAllowDirtyPageExit = () => { allowPageExit = true; };

    /*
     * Protect every normal same-origin navigation, not only the explicit
     * Cancel/Back link. This covers top/left navigation and entity/list links
     * while leaving tabs, dropdowns, modal triggers, downloads and new-window
     * links alone. Browser back/refresh remains covered by beforeunload below.
     */
    document.addEventListener('click', (event) => {
      if (!dirty() || allowPageExit || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.dataset.bsToggle || anchor.dataset.bsTarget) return;

      let destination;
      try {
        destination = new URL(anchor.href, location.href);
      } catch {
        return;
      }
      if (destination.origin !== location.origin) return;
      if (destination.href === location.href || (destination.pathname === location.pathname && destination.search === location.search && destination.hash)) return;

      event.preventDefault();
      pending = destination.href;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('unsavedChangesModal')).show();
    }, true);

    document.querySelectorAll('[data-unsaved-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.unsavedAction;
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsavedChangesModal'));

        if (action === 'cancel') {
          modal?.hide();
          pending = null;
        } else if (action === 'discard') {
          allowPageExit = true;
          location.href = pending || '/';
        } else if (action === 'save') {
          const save = form.querySelector('[data-form-save]');
          if (save instanceof HTMLButtonElement && save.disabled) return;
          form.requestSubmit();
        }
      });
    });

    document.querySelectorAll('form[data-allow-dirty-page-exit="true"]').forEach((actionForm) => {
      actionForm.addEventListener('submit', () => { allowPageExit = true; });
    });

    const deleteModal = document.getElementById('deleteEntryModal');
    deleteModal?.addEventListener('show.bs.modal', () => {
      const warning = deleteModal.querySelector('[data-delete-unsaved-warning]');
      warning?.classList.toggle('d-none', !dirty());
    });

    window.addEventListener('beforeunload', (event) => {
      if (dirty() && !allowPageExit) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    form.addEventListener('submit', (event) => {
      const submitter = event.submitter;
      const inPlaceSave = form.dataset.recordMode !== 'create'
        && form.dataset.ownerEditing !== 'true'
        && submitter instanceof HTMLButtonElement
        && submitter.name === '_saveMode'
        && submitter.value === 'stay';
      allowPageExit = !inPlaceSave;
      if (!inPlaceSave) window.manatosRetry = null;
    });

    form.addEventListener('manatos:form-saved', () => {
      state.baseline = state.snapshot();
      allowPageExit = false;
      window.manatosRetry = () => form.requestSubmit();
      form.dispatchEvent(new Event('change', { bubbles: true }));
    });

    queueMicrotask(() => {
      state.baseline = state.snapshot();
      form.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
})();

/* ==========================================================================
 * Generic SysBO Save-button state
 *
 * Every metadata-driven entity edit/create form uses one reversible rule:
 *
 *   Save enabled = form changed AND form currently valid AND no child editor active
 *
 * The dirty comparison is based on the values that would actually be posted,
 * not on a one-way "the user typed once" latch. Reverting an edit back to its
 * baseline therefore returns the form to clean state and disables Save again.
 * Native HTML constraints (required/email/minlength/etc.) and any custom
 * validity participate before Save becomes actionable. Inline/child editors own
 * drafts outside the parent entry until Add/Update, so parent persistence
 * is blocked while any registered child editor is active. API validation remains
 * authoritative after submission.
 * ======================================================================== */
(() => {
  document.querySelectorAll('form[data-dirty-guard="true"]').forEach((form) => {
    const saveButtons = [...form.querySelectorAll('[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]')].filter((button) => button instanceof HTMLButtonElement);
    const save = form.querySelector('[data-form-save]');

    if (!(save instanceof HTMLButtonElement) || !saveButtons.length) return;

    const snapshot = () => new URLSearchParams(new FormData(form)).toString();
    const sharedState = window.manatosSysBOFormState || {
      baseline: null,
      snapshot,
      isDirty: () => false,
      isValid: () => form.checkValidity(),
    };
    const indicator = form.querySelector('[data-form-state-indicator]');
    const indicatorIcon = indicator?.querySelector('[data-form-state-icon]');
    const indicatorText = indicator?.querySelector('[data-form-state-text]');
    const closeCancel = form.querySelector('[data-form-close-cancel]');
    const closeCancelLabel = closeCancel?.querySelector('[data-form-close-cancel-label]');
    const recordMode = form.dataset.recordMode || 'edit';
    const runtime = window.ManatOS?.ctx;
    const leafPagePath = () => {
      if (!runtime?.value?.page) return null;
      let node = runtime.value.page;
      let path = 'ctx.page';
      while (node?.page) { node = node.page; path += '.page'; }
      return path;
    };
    const sameRecord = (left, right) => {
      try { return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {}); }
      catch { return false; }
    };

    const setIndicator = ({ changed, valid, internalEditing, internalEditorCount }) => {
      if (!(indicator instanceof HTMLElement) || !(indicatorText instanceof HTMLElement)) return;

      indicator.classList.remove('text-secondary', 'text-primary', 'text-warning-emphasis');

      if (internalEditing) {
        indicator.classList.add('text-warning-emphasis');
        indicatorText.textContent = internalEditorCount > 1
          ? `Editing ${internalEditorCount} related entries`
          : 'Editing related entry';
        if (indicatorIcon instanceof HTMLElement) indicatorIcon.className = 'bi bi-pencil-square me-1';
        return;
      }

      if (!changed) {
        indicator.classList.add('text-secondary');
        indicatorText.textContent = recordMode === 'create'
          ? (valid ? 'New entry · ready' : 'New entry · incomplete')
          : 'No changes';
        if (indicatorIcon instanceof HTMLElement) indicatorIcon.className = 'bi bi-check-circle me-1';
        return;
      }

      if (!valid) {
        indicator.classList.add('text-warning-emphasis');
        indicatorText.textContent = 'Unsaved changes · incomplete';
        if (indicatorIcon instanceof HTMLElement) indicatorIcon.className = 'bi bi-exclamation-triangle me-1';
        return;
      }

      indicator.classList.add('text-primary');
      indicatorText.textContent = 'Unsaved changes';
      if (indicatorIcon instanceof HTMLElement) indicatorIcon.className = 'bi bi-pencil-square me-1';
    };

    const update = () => {
      const formDataChanged = sharedState.baseline !== null
        && snapshot() !== sharedState.baseline;
      const pagePath = leafPagePath();
      // Navigation protection and Save enablement MUST consume the same
      // canonical dirty predicate.  CTX remains useful as an observable page
      // projection, but it cannot replace form-state dirtiness: compound field
      // components (for example external-provider credentials) can own posted
      // values that are intentionally not mirrored into entry.  Using
      // ctxDirty here previously produced the contradictory state where the
      // footer said "No changes"/disabled Save while Cancel correctly detected
      // unsaved credential edits.
      const changed = typeof sharedState.isDirty === 'function'
        ? sharedState.isDirty()
        : formDataChanged;
      const valid = typeof sharedState.isValid === 'function'
        ? sharedState.isValid()
        : form.checkValidity();
      const internalEditors = [...form.querySelectorAll('[data-entry-child-editor][data-child-editor-active="true"]')];
      const internalEditorCount = internalEditors.length;
      const internalEditing = internalEditorCount > 0;

      // The parent navigation action describes its consequence rather than
      // keeping a permanently ambiguous label. A clean entry simply closes; a
      // dirty entry (or one with an active child draft) is a Cancel operation
      // and therefore participates in the unsaved-changes guard. This is shared
      // metadata-entry behavior for every entity, never an entity-specific rule.
      if (closeCancelLabel instanceof HTMLElement) {
        closeCancelLabel.textContent = changed || internalEditing ? 'Cancel' : 'Close';
      }
      if (closeCancel instanceof HTMLElement) {
        closeCancel.setAttribute('aria-label', changed || internalEditing ? 'Cancel editing' : 'Close entry');
      }

      // Page state is itself CTX. Metadata/actions can therefore make live,
      // declarative decisions from state.dirty/state.valid without inspecting DOM.
      if (pagePath && runtime?.replace) {
        if (runtime.get?.(`${pagePath}.state.dirty`) !== changed) {
          runtime.replace(`${pagePath}.state.dirty`, changed, { source: 'page-state' });
        }
        if (runtime.get?.(`${pagePath}.state.valid`) !== valid) {
          runtime.replace(`${pagePath}.state.valid`, valid, { source: 'page-state' });
        }
        if (runtime.get?.(`${pagePath}.state.internalEditing`) !== internalEditing) {
          runtime.replace(`${pagePath}.state.internalEditing`, internalEditing, { source: 'page-state' });
        }
        if (runtime.get?.(`${pagePath}.state.internalEditorCount`) !== internalEditorCount) {
          runtime.replace(`${pagePath}.state.internalEditorCount`, internalEditorCount, { source: 'page-state' });
        }
      }

      // Compound workflow intent/proof fields participate in the same FormData
      // snapshot, so Save/Cancel share one reversible dirty predicate.
      const credentialStateAllowsSave = true;

      const saveDisabled = !(changed && valid && credentialStateAllowsSave && !internalEditing);
      const saveTitle = internalEditing
        ? 'Finish or cancel the related-entry editor before saving the page.'
        : !changed
          ? 'No changes to save.'
          : !valid
            ? 'Complete or correct the required fields before saving.'
            : '';
      saveButtons.forEach((button) => {
        button.disabled = saveDisabled;
        button.title = saveTitle;
      });
      setIndicator({ changed, valid, internalEditing, internalEditorCount });
    };

    // Run after the current event turn as well, so evaluator-driven visibility
    // or editability changes have settled before validity is rechecked.
    const scheduleUpdate = () => queueMicrotask(update);
    form.addEventListener('input', scheduleUpdate);
    form.addEventListener('change', scheduleUpdate);
    form.addEventListener('manatos:child-editor-state', scheduleUpdate);
    // Programmatic/calculated mutations also flow through CTX and must update
    // dirtiness/validity even when no native DOM event initiated the change.
    window.addEventListener('manatos:ctx-change', scheduleUpdate);
    form.addEventListener('manatos:form-saved', scheduleUpdate);

    queueMicrotask(update);
  });
})();
