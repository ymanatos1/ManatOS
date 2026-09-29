(() => {
  'use strict';

  /* Canonical SysBO form-state baseline + dirty navigation protection.
   * Generic SysBO Save-button state. View-owned adapters are reinstalled on
   * every uiView materialization; canonical CTX field state survives. */

  const entryFormStates = new WeakMap();
  const baselineCapturedLevels = new WeakSet();
  let aggregatePolicyPromise = null;
  let contributorPolicyPromise = null;

  const aggregatePolicy = () =>
    (aggregatePolicyPromise ||= import('/shared-runtime/policies/entry-aggregate-policy.js'));
  const contributorPolicy = () =>
    (contributorPolicyPromise ||= import('/shared-runtime/policies/entry-aggregate-policy.js'));

  const install = (form) => {
    if (!(form instanceof HTMLFormElement)) return false;
    void installAsync(form);
    return true;
  };

  const installAsync = async (form) => {
    const [{ calculateEntryAggregatePolicy }, { calculateEntryContributorAggregate }] =
      await Promise.all([aggregatePolicy(), contributorPolicy()]);
    if (!form.isConnected) return;

    const runtime = window.ManatOS?.ctx;
    const entryPagePath =
      form.dataset.ctxScopePath || window.ManatOS?.uiHost?.surfacePath?.('entry') || null;
    const contributors = new Map();
    const resolveContributor = (value) => (typeof value === 'function' ? value() : value);
    const contributorState = () => {
      const states = [...contributors.values()]
        .map(resolveContributor)
        .filter((value) => value && typeof value === 'object');
      return calculateEntryContributorAggregate(states);
    };
    const fieldDirty = () => {
      const page = entryPagePath ? runtime?.get?.(entryPagePath) : null;
      return Object.values(page?.data?.fields || {}).some((field) => field?.dirty === true);
    };
    const fieldValid = () =>
      [...form.querySelectorAll('[data-ctx-field]')].every(
        (control) => typeof control.checkValidity !== 'function' || control.checkValidity(),
      );
    const state = {
      isFieldDirty: fieldDirty,
      isFieldValid: fieldValid,
      contributorState,
      isContributorDirty: () => contributorState().dirty,
      isDirty: () => state.isFieldDirty() || state.isContributorDirty(),
    };
    entryFormStates.set(form, state);

    form.addEventListener('manatos:form-contributor-register', (event) => {
      const detail = event instanceof CustomEvent ? event.detail || {} : {};
      const id = String(detail.id || '').trim();
      if (
        !id ||
        (typeof detail.contributor !== 'function' && typeof detail.contributor !== 'object')
      )
        return;
      contributors.set(id, detail.contributor);
      form.dispatchEvent(new Event('manatos:form-contributor-state', { bubbles: true }));
    });
    form.dispatchEvent(new Event('manatos:form-state-ready', { bubbles: true }));

    const saveButtons = [
      ...form.querySelectorAll(
        '[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]',
      ),
    ].filter((button) => button instanceof HTMLButtonElement);
    const save = form.querySelector('[data-form-save]');
    if (!(save instanceof HTMLButtonElement) || !saveButtons.length) return;

    const indicator = form.querySelector('[data-form-state-indicator]');
    const indicatorIcon = indicator?.querySelector('[data-form-state-icon]');
    const indicatorText = indicator?.querySelector('[data-form-state-text]');
    const closeCancel = form.querySelector('[data-form-close-cancel]');
    const closeCancelLabel = closeCancel?.querySelector('[data-form-close-cancel-label]');
    const recordMode = form.dataset.recordMode || 'edit';
    const abort = new AbortController();
    const signal = abort.signal;

    form.addEventListener('manatos:entry-view-disposing', () => abort.abort(), { once: true });

    const unregisterEntryDismiss =
      entryPagePath && closeCancel instanceof HTMLElement
        ? window.ManatOS?.popup?.runtime?.registerDismissHandler?.({ path: entryPagePath }, () => {
            void window.ManatOS?.surfaceClosure?.requestTrigger?.(closeCancel, entryPagePath);
            return true;
          })
        : null;
    signal.addEventListener('abort', () => unregisterEntryDismiss?.(), { once: true });

    const setIndicator = ({ changed, valid, blocked, blockingCount, initializing }) => {
      if (!(indicator instanceof HTMLElement) || !(indicatorText instanceof HTMLElement)) return;
      indicator.classList.remove('text-secondary', 'text-primary', 'text-warning-emphasis');
      if (indicator instanceof HTMLButtonElement) {
        indicator.disabled = !changed;
        indicator.title = changed
          ? 'Review the current unsaved entry changes.'
          : 'No unsaved changes to review';
        indicator.classList.toggle('text-decoration-none', !changed);
      }
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

    if (indicator instanceof HTMLButtonElement) {
      indicator.addEventListener('click', () => {
        if (indicator.disabled || !entryPagePath) return;
        const page = runtime?.get?.(entryPagePath);
        const report = window.ManatOS?.semanticChangeReport?.entry?.({
          entityKey: String(page?.control?.entityKey || form.dataset.entityKey || ''),
          caption: document.querySelector('.workspace-titlebar h1')?.textContent?.trim() || 'Entry',
          ownerPath: entryPagePath,
          identity: String(page?.control?.recordId || '') || null,
          current: page?.data?.entry?.current || {},
          original: page?.data?.entry?.original || {},
          collections: page?.data?.collections || {},
        });
        if (!report) return;
        window.ManatOS?.changeReportPopup?.show?.(report, {
          title: 'Unsaved changes',
          summary: report.summary || 'Current unsaved entry changes',
          presentationContext: window.ManatOS?.semanticReportPresentation?.live?.(entryPagePath),
        });
      });
    }

    const update = () => {
      if (!form.isConnected) return;
      const pagePath = entryPagePath;
      const fieldDirty = state.isFieldDirty();
      const aggregateContributorState = state.contributorState();
      const contributorDirty = aggregateContributorState.dirty === true;
      const contributorValid = aggregateContributorState.valid !== false;
      const fieldValid = state.isFieldValid();
      const initializing =
        window.ManatOS?.entryInitialization?.pending === true ||
        String(form.dataset.initializationOwners || '').trim().length > 0;
      const blocked = aggregateContributorState.blocked === true;
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
      const blockingCount = Number(aggregateContributorState.blockingCount || 0);

      if (closeCancelLabel instanceof HTMLElement)
        closeCancelLabel.textContent = changed || blocked ? 'Cancel' : 'Close';
      if (closeCancel instanceof HTMLElement) {
        closeCancel.setAttribute(
          'aria-label',
          changed || blocked ? 'Cancel editing' : 'Close entry',
        );
        const ready = window.ManatOS?.uiHost?.isUserInputReady?.(entryPagePath) !== false;
        if (closeCancel instanceof HTMLButtonElement) closeCancel.disabled = !ready;
      }
      if (pagePath && runtime?.replace && runtime.get?.(pagePath)) {
        for (const [key, value] of Object.entries({ dirty: changed, valid, blocked })) {
          const path = `${pagePath}.state.${key}`;
          if (runtime.get?.(path) !== value) runtime.replace(path, value, { source: 'page-state' });
        }
      }
      const saveDisabled = initializing || !aggregatePolicy.saveReady;
      const title = initializing
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
        button.title = title;
      });
      setIndicator({ changed, valid, blocked, blockingCount, initializing });
    };
    const scheduleUpdate = () => queueMicrotask(update);
    form.addEventListener('input', scheduleUpdate, { signal });
    form.addEventListener('change', scheduleUpdate, { signal });
    form.addEventListener('manatos:form-contributor-state', scheduleUpdate, { signal });
    form.addEventListener('manatos:form-initialization-changed', scheduleUpdate, { signal });
    form.addEventListener('manatos:form-baseline-captured', scheduleUpdate, { signal });
    form.addEventListener('manatos:form-saved', scheduleUpdate, { signal });
    window.addEventListener(
      'manatos:retry-request',
      (event) => {
        event.preventDefault();
        form.requestSubmit();
      },
      { signal },
    );
    window.addEventListener('manatos:ctx-change', scheduleUpdate, { signal });
    window.addEventListener(
      'manatos:user-input-readiness-changed',
      (event) => {
        if (event.detail?.path === entryPagePath) scheduleUpdate();
      },
      { signal },
    );

    const deleteModal =
      form.querySelector('#deleteEntryModal') || document.getElementById('deleteEntryModal');
    if (deleteModal instanceof HTMLElement) {
      deleteModal.addEventListener(
        'show.bs.modal',
        () => {
          const warning = deleteModal.querySelector('[data-delete-unsaved-warning]');
          if (warning instanceof HTMLElement) warning.classList.toggle('d-none', !state.isDirty());
        },
        { signal },
      );
    }

    const captureInitialBaseline = () => {
      if (!entryPagePath) return;
      const page = runtime?.get?.(entryPagePath);
      if (!page || baselineCapturedLevels.has(page)) return;
      if (page?.control?.kind !== 'entry') return;
      for (const [key, field] of Object.entries(page.data.fields || {})) {
        if (
          !field ||
          typeof field !== 'object' ||
          !Object.prototype.hasOwnProperty.call(field, 'value')
        )
          continue;
        const path = `${entryPagePath}.data.fields.${key}.originalValue`;
        if (!Object.is(runtime?.get?.(path), field.value)) {
          runtime?.replace?.(path, field.value, {
            source: 'entry-initialization-baseline',
            triggerPath: path,
          });
        }
      }
      baselineCapturedLevels.add(page);
      form.dataset.manatosBaselineCaptured = 'true';
      form.dispatchEvent(new Event('manatos:form-baseline-captured', { bubbles: true }));
    };

    let metadataInitialized = form.dataset.metadataFormInitialized === 'true';
    const captureWhenInitialized = () => {
      const pending =
        window.ManatOS?.entryInitialization?.pending === true ||
        String(form.dataset.initializationOwners || '').trim().length > 0;
      if (!metadataInitialized || pending) return;
      captureInitialBaseline();
    };
    form.addEventListener(
      'manatos:form-initialized',
      () => {
        metadataInitialized = true;
        captureWhenInitialized();
      },
      { once: true, signal },
    );
    form.addEventListener('manatos:form-initialization-settled', captureWhenInitialized, {
      signal,
    });
    queueMicrotask(() => {
      captureWhenInitialized();
      update();
    });
  };

  const surfaces = window.ManatOS?.entrySurfaces;
  if (!surfaces?.register)
    throw new Error('Entry surface runtime is unavailable for form-state registration.');
  surfaces.register('entry-form-state', install);
})();
