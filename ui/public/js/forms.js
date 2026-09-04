/* global bootstrap */

(() => {
  /* =======================================================================
   * Password visibility toggle
   *
   * Applied dynamically to every password input so all current and future
   * password fields get the same Show/Hide behaviour without duplicating
   * markup in individual EJS views.
   * ===================================================================== */

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const wrapper = document.createElement('div');

    wrapper.className = 'password-visibility-field';

    /*
     * Preserve Bootstrap bottom-margin utilities on the wrapper. Otherwise
     * an absolutely positioned toggle would not participate correctly in
     * the spacing of fields such as the sign-in password.
     */
    ['mb-1', 'mb-2', 'mb-3', 'mb-4', 'mb-5'].forEach((marginClass) => {
      if (input.classList.contains(marginClass)) {
        input.classList.remove(marginClass);
        wrapper.classList.add(marginClass);
      }
    });

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement('button');

    toggle.type = 'button';
    toggle.className = 'password-visibility-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.setAttribute('title', 'Show password');

    toggle.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i>';

    toggle.addEventListener('click', () => {
      const showPassword = input.type === 'password';

      input.type = showPassword ? 'text' : 'password';

      toggle.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');

      toggle.setAttribute('title', showPassword ? 'Hide password' : 'Show password');

      const icon = toggle.querySelector('i');

      if (icon) {
        icon.className = `bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`;
      }

      input.focus();
    });

    wrapper.appendChild(toggle);
  });

  /* =======================================================================
   * Optional local-password sections
   *
   * External-provider registration can create an account without local
   * credentials. The checkbox keeps that optional branch explicit and avoids
   * showing inactive password controls. Disabled inputs are also omitted from
   * form submission, so the existing server-side "no local password" path is
   * preserved without a second form or endpoint.
   * ===================================================================== */

  document.querySelectorAll('[data-optional-password-section]').forEach((section) => {
    const toggle = section.querySelector('[data-optional-password-toggle]');
    const content = section.querySelector('[data-optional-password-content]');

    if (!toggle || !content) {
      return;
    }

    const passwordFields = content.querySelectorAll('input');

    const updateOptionalPasswordSection = () => {
      const enabled = toggle.checked;

      content.hidden = !enabled;

      passwordFields.forEach((field) => {
        field.disabled = !enabled;

        // Returning to provider-only authentication must not leave a hidden
        // password value that could accidentally be submitted later.
        if (!enabled) {
          field.value = '';
          field.setCustomValidity('');
        }
      });

      // Re-run the shared password-policy state after the branch changes.
      const passwordInput = content.querySelector('.password-policy-input');
      passwordInput?.dispatchEvent(new Event('input', { bubbles: true }));
    };

    toggle.addEventListener('change', updateOptionalPasswordSection);
    updateOptionalPasswordSection();
  });

  /* =======================================================================
   * Password-policy live validation
   * ===================================================================== */

  document.querySelectorAll('.password-policy-input').forEach((input) => {
    const form = input.closest('form');
    const rules = form?.querySelector('.password-rules');
    const confirmation = form?.querySelector('[data-password-confirmation]');
    const submit = form?.querySelector('[data-password-submit]');

    if (!rules) {
      return;
    }

    const setRule = (rule, valid) => {
      const row = rules.querySelector(`[data-rule="${rule}"]`);

      if (!row) {
        return;
      }

      row.classList.toggle('rule-ok', valid);

      const icon = row.querySelector('i');

      if (icon) {
        icon.className = `bi ${valid ? 'bi-check-circle-fill' : 'bi-circle'} me-1`;
      }
    };

    const update = () => {
      const value = input.value;
      const passwordOptional = input.hasAttribute('data-password-optional');
      const confirmationValue = confirmation?.value ?? '';
      const passwordSupplied = value.length > 0 || confirmationValue.length > 0;
      const policy = {
        length: value.length >= 9,
        alpha: /[A-Za-z]/.test(value),
        number: /[0-9]/.test(value),
        symbol: /[^A-Za-z0-9]/.test(value),
      };

      Object.entries(policy).forEach(([rule, valid]) => setRule(rule, valid));

      /*
       * Some provider-based registrations allow no local password at all. In
       * that mode an entirely empty password pair is valid; as soon as either
       * field is used, the normal password policy and confirmation rules apply
       * in full. This keeps optional-password flows on the same validator rather
       * than creating a second, subtly different implementation.
       */
      const policyValid = passwordOptional && !passwordSupplied
        ? true
        : Object.values(policy).every(Boolean);
      let confirmationValid = true;

      if (confirmation) {
        confirmationValid = passwordOptional && !passwordSupplied
          ? true
          : confirmationValue.length > 0 && confirmationValue === value;
        setRule('match', passwordSupplied && confirmationValid);

        // Keep native browser validation consistent with the visible rule.
        confirmation.setCustomValidity(
          passwordSupplied && !confirmationValid
            ? 'The two password values do not match.'
            : '',
        );
      }

      if (submit) {
        // form.checkValidity() also covers required account fields and, in
        // other flows, currentPassword when an existing password is required.
        submit.disabled = !(policyValid && confirmationValid && form.checkValidity());
      }
    };

    input.addEventListener('input', update);
    confirmation?.addEventListener('input', update);

    form?.querySelectorAll('input').forEach((field) => {
      field.addEventListener('input', update);
    });

    update();
  });

  /* =======================================================================
   * Password-recovery identity validation
   *
   * The recovery field accepts either a user name or an email address. Once
   * an @ character is present, the value is treated strictly as email input;
   * otherwise it follows the existing registration user-name minimum length.
   * This validates syntax only and deliberately reveals nothing about whether
   * the supplied identity exists.
   * ===================================================================== */

  document.querySelectorAll('[data-recovery-identity]').forEach((input) => {
    const form = input.closest('form');
    const submit = form?.querySelector('[data-recovery-submit]');
    const emailProbe = document.createElement('input');

    emailProbe.type = 'email';
    emailProbe.required = true;

    const isValid = () => {
      const value = input.value.trim();

      if (value.includes('@')) {
        emailProbe.value = value;
        return emailProbe.checkValidity();
      }

      return value.length >= 2;
    };

    const update = () => {
      const valid = isValid();
      const hasValue = input.value.trim().length > 0;

      input.setCustomValidity(valid || !hasValue ? '' : 'Enter a valid email address or user name.');
      input.classList.toggle('is-invalid', hasValue && !valid);

      if (submit) {
        submit.disabled = !valid;
      }
    };

    input.addEventListener('input', update);
    update();
  });

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

/* ==========================================================================
 * Metadata-driven in-place Save
 *
 * Existing records use fetch for the primary Save action so the page/tab,
 * scroll position, debugger state and shell-level CLI survive persistence.
 * Save-and-Close and first Save of a new record keep normal navigation.
 * ======================================================================== */
(() => {
  const form = document.querySelector('form.metadata-driven-record-form[data-dirty-guard="true"]');
  if (!(form instanceof HTMLFormElement)) return;

  const runtime = window.ManatOS?.ctx;
  const leafPagePath = () => {
    if (!runtime?.value?.page) return null;
    let node = runtime.value.page;
    let path = 'ctx.page';
    while (node?.page) { node = node.page; path += '.page'; }
    return path;
  };

  const mergePersistedCtx = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !runtime?.replace) return;
    const pagePath = leafPagePath();
    if (!pagePath) return;

    const current = runtime.get?.(`${pagePath}.entry`);
    const original = runtime.get?.(`${pagePath}.entryOriginal`);
    const mergedCurrent = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...current, ...record }
      : { ...record };
    const mergedOriginal = original && typeof original === 'object' && !Array.isArray(original)
      ? { ...original, ...record }
      : { ...mergedCurrent };

    runtime.replace(`${pagePath}.entry`, mergedCurrent, { source: 'save-reconcile' });
    runtime.replace(`${pagePath}.entryOriginal`, mergedOriginal, { source: 'save-reconcile' });

    for (const [key, value] of Object.entries(record)) {
      const fieldPath = `${pagePath}.fields.${key}.value`;
      if (runtime.get?.(fieldPath) !== undefined && runtime.get(fieldPath) !== value) {
        runtime.replace(fieldPath, value, { source: 'save-reconcile', triggerPath: fieldPath });
      }
    }
  };

  let saving = false;
  form.addEventListener('submit', async (event) => {
    const submitter = event.submitter;
    const isStay = submitter instanceof HTMLButtonElement
      && submitter.name === '_saveMode'
      && submitter.value === 'stay';
    if (!isStay || form.dataset.recordMode === 'create' || form.dataset.ownerEditing === 'true' || saving) return;

    event.preventDefault();
    if (!form.reportValidity()) return;

    saving = true;
    const saveControls = [...form.querySelectorAll('[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]')]
      .filter((control) => control instanceof HTMLButtonElement);
    saveControls.forEach((control) => { control.disabled = true; });

    try {
      /*
       * Match the native form submission encoding. Express parses urlencoded
       * bodies globally, while a raw FormData body would become multipart and
       * reach the CSRF middleware without req.body populated. Keep this generic
       * for every metadata-driven entry form and preserve repeated controls.
       */
      const body = new URLSearchParams();
      for (const [name, value] of new FormData(form).entries()) {
        if (typeof value === 'string') body.append(name, value);
      }
      body.set('_saveMode', 'stay');
      const response = await fetch(form.action, {
        method: 'POST',
        body,
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'ManatOS-InPlace-Save',
        },
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok || !payload?.success) throw new Error('Save could not be completed in place.');

      mergePersistedCtx(payload.data?.record);
      form.dispatchEvent(new CustomEvent('manatos:form-saved', {
        bubbles: true,
        detail: payload.data || {},
      }));
    } catch (error) {
      /*
       * Plain Save is an in-place operation by contract. Never fall back to a
       * full form submission here: doing so fires the dirty-page guard, loses
       * the active tab/scroll position, and can repeat an already-successful
       * mutation. Keep the current document intact and let the normal form state
       * remain dirty so the user can retry safely.
       */
      console.error('[ManatOS] In-place Save failed.', error);
    } finally {
      saving = false;
      // Re-evaluate Save enablement after a failed request; on success the
      // manatos:form-saved event has already promoted the new baseline.
      form.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
})();

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

/* ==========================================================================\n * SysConfiguration in-place Apply
 *
 * Configuration is an administrative settings surface with many independent
 * values. Applying one value should not rebuild the page or move the operator
 * back to the top. The normal server redirect remains as a non-JavaScript
 * fallback; this progressive enhancement requests JSON and keeps scroll/focus.
 * ======================================================================== */
(() => {
  document.querySelectorAll('form[data-config-setting]').forEach((form) => {
    const submit = form.querySelector('button[type="submit"]');
    const result = form.querySelector('[data-config-apply-result]');

    if (!(form instanceof HTMLFormElement) || !(submit instanceof HTMLButtonElement)) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const originalHtml = submit.innerHTML;
      const data = new URLSearchParams(new FormData(form));

      submit.disabled = true;
      submit.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Applying';

      if (result instanceof HTMLElement) {
        result.textContent = '';
        result.classList.remove('text-success', 'text-danger');
      }

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: data,
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Configuration update failed with HTTP ${response.status}.`);
        }

        if (result instanceof HTMLElement) {
          result.textContent = 'Applied.';
          result.classList.add('text-success');
        }
      } catch (error) {
        console.warn('Configuration value could not be applied in place.', error);

        if (result instanceof HTMLElement) {
          result.textContent = 'Apply failed. The value was not confirmed as saved.';
          result.classList.add('text-danger');
        }
      } finally {
        submit.disabled = false;
        submit.innerHTML = originalHtml;
      }
    });
  });
})();

/* ========================================================================== 
 * Metadata-driven rich enum component
 *
 * Presentation delegates all value semantics to the hidden native select.
 * Choosing a rich option updates that select and emits its normal change event;
 * the CTX adapter above is therefore the single state mutation path.
 * ======================================================================== */
(() => {
  document.querySelectorAll('[data-metadata-enum-select]').forEach((root) => {
    // The same rich enum component is used by owner-managed recordQuick panels.
    // Those controls intentionally have no data-ctx-field binding, so discover the
    // canonical hidden select by its enum metadata rather than by CTX ownership.
    const select = root.querySelector('select[data-enum-items]');
    const toggle = root.querySelector('[data-metadata-enum-toggle]');
    if (!(select instanceof HTMLSelectElement) || !(toggle instanceof HTMLButtonElement)) return;

    const items = () => {
      try { return JSON.parse(select.dataset.enumItems || '[]'); } catch { return []; }
    };
    const refresh = () => {
      const item = items().find((candidate) => String(candidate?.value ?? '') === String(select.value ?? ''));
      const label = toggle.querySelector('[data-enum-selected-label]');
      const icon = toggle.querySelector('[data-enum-selected-icon]');
      if (label) label.textContent = item?.label || item?.value || 'Choose...';
      if (icon instanceof HTMLElement) icon.className = `bi bi-${item?.icon || 'list'}`;
      root.querySelectorAll('[data-enum-choice]').forEach((choice) => {
        const selected = choice.getAttribute('data-enum-choice') === select.value;
        choice.classList.toggle('active', selected);
        choice.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      toggle.disabled = select.disabled;
    };

    root.addEventListener('click', (event) => {
      const choice = event.target instanceof Element ? event.target.closest('[data-enum-choice]') : null;
      if (!(choice instanceof HTMLButtonElement) || select.disabled) return;
      select.value = choice.dataset.enumChoice || '';
      refresh();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    select.addEventListener('change', refresh);
    refresh();
  });
})();

/* ========================================================================== 
 * Modal focus lifecycle
 *
 * Bootstrap applies aria-hidden while closing a modal. Move focus out of the
 * modal before that transition so assistive-technology users never retain
 * focus inside an aria-hidden subtree. This applies to every ManatOS modal.
 * ======================================================================== */
(() => {
  const returnFocus = new WeakMap();

  document.addEventListener('show.bs.modal', (event) => {
    const modal = event.target;
    if (!(modal instanceof HTMLElement)) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !modal.contains(active)) returnFocus.set(modal, active);
  });

  document.addEventListener('hide.bs.modal', (event) => {
    const modal = event.target;
    if (!(modal instanceof HTMLElement)) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && modal.contains(active)) {
      const target = returnFocus.get(modal);
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
      else active.blur();
    }
  });

  document.addEventListener('hidden.bs.modal', (event) => {
    const modal = event.target;
    if (modal instanceof HTMLElement) returnFocus.delete(modal);
  });
})();
