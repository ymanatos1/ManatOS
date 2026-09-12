const entryFormStates = new WeakMap();

(async () => {
  /* =======================================================================
   * Canonical SysBO form-state baseline + dirty navigation protection
   *
   * Canonical fields keep their baselines in CTX; private workflow contributors
   * keep their own reversible state with the component that owns it. Save and navigation
   * consume the same aggregate state after initialization has settled.
   * ===================================================================== */

  const form = document.querySelector('form[data-dirty-guard="true"]');
  const { calculateEntryContributorAggregate } =
    await import('/shared-runtime/policies/entry-aggregate-policy.js');

  if (form) {
    const runtime = window.ManatOS?.ctx;
    const owningEntryPagePath = (() => {
      let node = runtime?.value?.ui?.level;
      if (!node) return null;
      let path = 'ctx.ui.level';
      while (node?.level) {
        node = node.level;
        path += '.level';
      }
      return node?.control?.kind === 'entry' ? path : null;
    })();

    const fieldDirty = () => {
      const page = owningEntryPagePath ? runtime?.get?.(owningEntryPagePath) : null;
      return Object.values(page?.fields || {}).some((field) => field?.dirty === true);
    };

    // Browser-private aggregate contributors mirror the host-neutral V2 contract:
    // contributors expose only aggregate facts. Their underlying values/drafts stay
    // with the component that owns them and are never materialized into semantic CTX.
    const contributors = new Map();
    const resolveContributor = (contributor) =>
      typeof contributor === 'function' ? contributor() : contributor;
    const contributorState = () => {
      const states = [...contributors.values()]
        .map(resolveContributor)
        .filter((value) => value && typeof value === 'object');
      return calculateEntryContributorAggregate(states);
    };
    const fieldValid = () =>
      [...form.querySelectorAll('[data-ctx-field]')].every(
        (control) => typeof control.checkValidity !== 'function' || control.checkValidity(),
      );
    const notifyContributorState = () =>
      form.dispatchEvent(new Event('manatos:form-contributor-state', { bubbles: true }));
    const setContributor = (id, contributor) => {
      if (!id || (typeof contributor !== 'function' && typeof contributor !== 'object')) return;
      contributors.set(id, contributor);
      notifyContributorState();
    };
    const state = {
      isFieldDirty: fieldDirty,
      isFieldValid: fieldValid,
      contributorState,
      isContributorDirty: () => contributorState().dirty,
      isDirty: () => state.isFieldDirty() || state.isContributorDirty(),
    };
    form.addEventListener('manatos:form-contributor-register', (event) => {
      const detail = event instanceof CustomEvent ? event.detail || {} : {};
      setContributor(String(detail.id || '').trim(), detail.contributor);
    });
    entryFormStates.set(form, state);
    form.dispatchEvent(new Event('manatos:form-state-ready', { bubbles: true }));

    let pending = null;
    let allowPageExit = false;

    // Dirty remains a reversible persisted-state comparison. Navigation also
    // protects an active child draft, which blocks persistence without falsely
    // turning that draft into parent-entry dirtiness.
    const hasPendingWork = () =>
      document.documentElement.dataset.manatosSystemUnavailable !== 'true' &&
      (state.isDirty() || state.contributorState().blocked);

    window.addEventListener('manatos:retry-request', (event) => {
      event.preventDefault();
      form.requestSubmit();
    });

    /*
     * Protect every normal same-origin navigation, not only the explicit
     * Cancel/Back link. This covers top/left navigation and entity/list links
     * while leaving tabs, dropdowns, modal triggers, downloads and new-window
     * links alone. Browser back/refresh remains covered by beforeunload below.
     */
    document.addEventListener(
      'click',
      (event) => {
        if (!hasPendingWork() || allowPageExit || event.defaultPrevented || event.button !== 0)
          return;
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
        if (
          destination.href === location.href ||
          (destination.pathname === location.pathname &&
            destination.search === location.search &&
            destination.hash)
        )
          return;

        event.preventDefault();
        pending = destination.href;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('unsavedChangesModal')).show();
      },
      true,
    );

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
          if (!(save instanceof HTMLButtonElement) || save.disabled) return;

          // A Save chosen from the unsaved-navigation prompt is one atomic
          // transaction: persist once, then continue to the originally requested
          // destination. Clear the pending guard before submitting so neither the
          // synthetic reconciliation events nor the final navigation can reopen
          // this same confirmation and accidentally repeat collection mutations.
          const destination = pending;
          pending = null;
          allowPageExit = true;
          form.dataset.saveContinuation = destination || '';
          if (button instanceof HTMLButtonElement) button.disabled = true;
          modal?.hide();
          form.requestSubmit(save);
        }
      });
    });

    document.querySelectorAll('form[data-allow-dirty-page-exit="true"]').forEach((actionForm) => {
      actionForm.addEventListener('submit', () => {
        allowPageExit = true;
      });
    });

    const deleteModal = document.getElementById('deleteEntryModal');
    deleteModal?.addEventListener('show.bs.modal', () => {
      const warning = deleteModal.querySelector('[data-delete-unsaved-warning]');
      warning?.classList.toggle('d-none', !hasPendingWork());
    });

    window.addEventListener('beforeunload', (event) => {
      if (hasPendingWork() && !allowPageExit) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    form.addEventListener('submit', (event) => {
      const submitter = event.submitter;
      const inPlaceSave =
        form.dataset.recordMode !== 'create' &&
        form.dataset.ownerEditing !== 'true' &&
        submitter instanceof HTMLButtonElement &&
        submitter.name === '_saveMode' &&
        submitter.value === 'stay';
      allowPageExit = !inPlaceSave;
    });

    form.addEventListener('manatos:form-saved', () => {
      const destination = form.dataset.saveContinuation;
      delete form.dataset.saveContinuation;

      if (destination) {
        // Keep the dirty-page guard bypassed through the actual document exit.
        // replace() is intentional: Cancel -> Save should continue the user's
        // navigation, not add the just-saved entry back into browser history.
        allowPageExit = true;
        queueMicrotask(() => location.replace(destination));
        return;
      }
      allowPageExit = false;
    });

    form.addEventListener('manatos:form-save-failed', () => {
      if (!Object.prototype.hasOwnProperty.call(form.dataset, 'saveContinuation')) return;
      const destination = form.dataset.saveContinuation || null;
      delete form.dataset.saveContinuation;
      pending = destination;
      allowPageExit = false;
      const modalElement = document.getElementById('unsavedChangesModal');
      modalElement?.querySelectorAll('[data-unsaved-action]').forEach((actionButton) => {
        if (actionButton instanceof HTMLButtonElement) actionButton.disabled = false;
      });
      bootstrap.Modal.getOrCreateInstance(modalElement).show();
    });

    /*
     * Baselines belong to the fully initialized transaction, not merely to DOM
     * state at the end of this script. Canonical field baselines are promoted in
     * CTX and the narrow private-contributor baseline is captured only after all
     * parser-loaded component initialization has settled.
     */
    const captureInitialBaseline = () => {
      // Initialized canonical values become the clean CTX field baselines. This
      // resets per-field dirty projections without inventing another authority
      // and applies identically to page and popup entry hosts.
      const pagePath = owningEntryPagePath;
      const page = pagePath ? runtime?.get?.(pagePath) : null;
      if (pagePath && page?.control?.kind === 'entry') {
        for (const [key, field] of Object.entries(page.fields || {})) {
          if (
            !field ||
            typeof field !== 'object' ||
            !Object.prototype.hasOwnProperty.call(field, 'value')
          )
            continue;
          const baselinePath = `${pagePath}.fields.${key}.originalValue`;
          if (!Object.is(runtime?.get?.(baselinePath), field.value)) {
            runtime?.replace?.(baselinePath, field.value, {
              source: 'entry-initialization-baseline',
              triggerPath: baselinePath,
            });
          }
        }
      }

      form.dataset.manatosBaselineCaptured = 'true';
      form.dispatchEvent(new Event('manatos:form-baseline-captured', { bubbles: true }));
      form.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /*
     * The initial baseline is valid only after BOTH initialization owners have
     * finished: the async metadata-expression runtime and the ordinary page /
     * component scripts that run later in the shell (for example SysUser and
     * external-provider helpers). Neither completion point alone is sufficient.
     *
     * The flags only join the two existing initialization lifecycles before
     * canonical and private-contributor baselines are committed together.
     */
    let metadataInitialized = form.dataset.metadataFormInitialized === 'true';
    let pageScriptsInitialized = document.readyState === 'complete';
    let initialBaselineCaptured = false;
    const captureWhenInitialized = () => {
      const initializationPending =
        window.ManatOS?.entryInitialization?.pending === true ||
        String(form.dataset.initializationOwners || '').trim().length > 0;
      if (
        initialBaselineCaptured ||
        !metadataInitialized ||
        !pageScriptsInitialized ||
        initializationPending
      )
        return;
      initialBaselineCaptured = true;
      captureInitialBaseline();
    };

    form.addEventListener(
      'manatos:form-initialized',
      () => {
        metadataInitialized = true;
        captureWhenInitialized();
      },
      { once: true },
    );

    form.addEventListener('manatos:form-initialization-settled', captureWhenInitialized);

    if (pageScriptsInitialized) {
      captureWhenInitialized();
    } else {
      window.addEventListener(
        'load',
        () => {
          pageScriptsInitialized = true;
          captureWhenInitialized();
        },
        { once: true },
      );
    }
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
/* Reflect the observable initialization lifecycle immediately, before the
 * aggregate-policy module is loaded. The surface lock is owned by initialization;
 * server-backed work uses the global busy overlay, so the footer stays quiet. */
document.querySelectorAll('form[data-dirty-guard="true"]').forEach((form) => {
  if (!(form instanceof HTMLFormElement)) return;
  const initializing =
    window.ManatOS?.entryInitialization?.pending === true ||
    String(form.dataset.initializationOwners || '').trim().length > 0;
  if (!initializing) return;
  const indicator = form.querySelector('[data-form-state-indicator]');
  // Initialization already owns the surface interaction state. Remote work also
  // owns the global busy overlay, so the compact footer state stays hidden until
  // initialization settles instead of duplicating the same status twice.
  if (indicator instanceof HTMLElement) indicator.hidden = true;
});

(async () => {
  const { calculateEntryAggregatePolicy } =
    await import('/shared-runtime/policies/entry-aggregate-policy.js');

  document.querySelectorAll('form[data-dirty-guard="true"]').forEach((form) => {
    const saveButtons = [
      ...form.querySelectorAll(
        '[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]',
      ),
    ].filter((button) => button instanceof HTMLButtonElement);
    const save = form.querySelector('[data-form-save]');

    if (!(save instanceof HTMLButtonElement) || !saveButtons.length) return;

    const fallbackState = {
      isFieldDirty: () => false,
      isContributorDirty: () => false,
      isDirty: () => false,
      isFieldValid: () => form.checkValidity(),
      contributorState: () => ({ dirty: false, valid: true, blocked: false, blockingCount: 0 }),
    };
    const currentSharedState = () => entryFormStates.get(form) || fallbackState;
    const indicator = form.querySelector('[data-form-state-indicator]');
    const indicatorIcon = indicator?.querySelector('[data-form-state-icon]');
    const indicatorText = indicator?.querySelector('[data-form-state-text]');
    const closeCancel = form.querySelector('[data-form-close-cancel]');
    const closeCancelLabel = closeCancel?.querySelector('[data-form-close-cancel-label]');
    const recordMode = form.dataset.recordMode || 'edit';
    const runtime = window.ManatOS?.ctx;
    // Bind this form to the entry surface that owns it when the runtime boots.
    // A selector/popup may later become the deepest UI level, but child surfaces
    // must never receive the parent entry transaction's dirty/valid/blocked state.
    const entryPagePath = (() => {
      let node = runtime?.value?.ui?.level;
      if (!node) return null;
      let path = 'ctx.ui.level';
      while (node?.level) {
        node = node.level;
        path += '.level';
      }
      return node?.control?.kind === 'entry' ? path : null;
    })();

    const setIndicator = ({ changed, valid, blocked, blockingCount, initializing }) => {
      if (!(indicator instanceof HTMLElement) || !(indicatorText instanceof HTMLElement)) return;

      indicator.classList.remove('text-secondary', 'text-primary', 'text-warning-emphasis');

      if (initializing) {
        indicator.hidden = true;
        return;
      }
      indicator.hidden = false;

      if (blocked) {
        indicator.classList.add('text-warning-emphasis');
        indicatorText.textContent =
          blockingCount > 1 ? `Editing ${blockingCount} related entries` : 'Editing related entry';
        if (indicatorIcon instanceof HTMLElement)
          indicatorIcon.className = 'bi bi-pencil-square me-1';
        return;
      }

      if (!changed) {
        indicator.classList.add('text-secondary');
        indicatorText.textContent =
          recordMode === 'create'
            ? valid
              ? 'New entry · ready'
              : 'New entry · incomplete'
            : 'No changes';
        if (indicatorIcon instanceof HTMLElement)
          indicatorIcon.className = 'bi bi-check-circle me-1';
        return;
      }

      indicator.removeAttribute('title');

      if (!valid) {
        indicator.classList.add('text-warning-emphasis');
        indicatorText.textContent = 'Unsaved changes · incomplete';
        if (indicatorIcon instanceof HTMLElement)
          indicatorIcon.className = 'bi bi-exclamation-triangle me-1';
        return;
      }

      indicator.classList.add('text-primary');
      indicatorText.textContent = 'Unsaved changes';
      if (indicatorIcon instanceof HTMLElement)
        indicatorIcon.className = 'bi bi-pencil-square me-1';
    };

    const update = () => {
      const pagePath = entryPagePath;
      // Canonical entity fields and private workflow contributors have separate
      // dirty inputs but one aggregate decision. Navigation protection consumes
      // sharedState.isDirty(), which combines these same two inputs.
      const sharedState = currentSharedState();
      const fieldDirty =
        typeof sharedState.isFieldDirty === 'function' ? sharedState.isFieldDirty() : false;
      const aggregateContributorState =
        typeof sharedState.contributorState === 'function'
          ? sharedState.contributorState()
          : { dirty: false, valid: true, blocked: false, blockingCount: 0 };
      const contributorDirty = aggregateContributorState.dirty === true;
      const contributorValid = aggregateContributorState.valid !== false;
      const fieldValid =
        typeof sharedState.isFieldValid === 'function'
          ? sharedState.isFieldValid()
          : form.checkValidity();
      const initializing =
        window.ManatOS?.entryInitialization?.pending === true ||
        String(form.dataset.initializationOwners || '').trim().length > 0;
      const blocked = aggregateContributorState.blocked === true;
      const blockingCount = Number(aggregateContributorState.blockingCount || 0);

      // Only explicitly registered non-CTX workflow state participates as an
      // aggregate contributor. Ordinary entity fields contribute through
      // fields[*].dirty; components never need to publish their private values.
      const aggregatePolicy = calculateEntryAggregatePolicy({
        mode: recordMode,
        fieldDirty,
        fieldValid,
        contributorDirty,
        contributorValid,
        blocked,
      });
      const changed = aggregatePolicy.dirty;
      const valid = aggregatePolicy.valid;

      // The parent navigation action describes its consequence rather than
      // keeping a permanently ambiguous label. A clean entry simply closes; a
      // dirty entry (or one with an active child draft) is a Cancel operation
      // and therefore participates in the unsaved-changes guard. This is shared
      // metadata-entry behavior for every entity, never an entity-specific rule.
      if (closeCancelLabel instanceof HTMLElement) {
        closeCancelLabel.textContent = changed || blocked ? 'Cancel' : 'Close';
      }
      if (closeCancel instanceof HTMLElement) {
        closeCancel.setAttribute(
          'aria-label',
          changed || blocked ? 'Cancel editing' : 'Close entry',
        );
      }

      // Page state is itself CTX. Metadata/actions can therefore make live,
      // declarative decisions from state.dirty/state.valid without inspecting DOM.
      if (pagePath && runtime?.replace && runtime.get?.(pagePath)) {
        if (runtime.get?.(`${pagePath}.control.state.dirty`) !== changed) {
          runtime.replace(`${pagePath}.control.state.dirty`, changed, { source: 'page-state' });
        }
        if (runtime.get?.(`${pagePath}.control.state.valid`) !== valid) {
          runtime.replace(`${pagePath}.control.state.valid`, valid, { source: 'page-state' });
        }
        // The entry surface exposes only the aggregate semantic fact. Contributor
        // identities/counts remain private runtime bookkeeping.
        if (runtime.get?.(`${pagePath}.control.state.blocked`) !== blocked) {
          runtime.replace(`${pagePath}.control.state.blocked`, blocked, { source: 'page-state' });
        }
      }

      const saveDisabled = initializing || !aggregatePolicy.saveReady;
      const saveTitle = initializing
        ? 'Entry initialization is still completing.'
        : blocked
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
      setIndicator({
        changed,
        valid,
        blocked,
        blockingCount,
        initializing,
      });
    };

    // Run after the current event turn as well, so evaluator-driven visibility
    // or editability changes have settled before validity is rechecked.
    const scheduleUpdate = () => queueMicrotask(update);
    form.addEventListener('input', scheduleUpdate);
    form.addEventListener('change', scheduleUpdate);
    form.addEventListener('manatos:form-contributor-state', scheduleUpdate);
    form.addEventListener('manatos:form-initialization-changed', scheduleUpdate);
    form.addEventListener('manatos:form-baseline-captured', scheduleUpdate);
    // Programmatic/calculated mutations also flow through CTX and must update
    // dirtiness/validity even when no native DOM event initiated the change.
    window.ManatOS?.ctx?.trackSubscriber?.('*', { kind: 'form', label: 'Entry state' });
    window.addEventListener('manatos:ctx-change', scheduleUpdate);
    form.addEventListener('manatos:form-saved', scheduleUpdate);

    queueMicrotask(update);
  });
})();
