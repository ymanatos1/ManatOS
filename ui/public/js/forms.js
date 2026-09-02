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
 * drafts outside the parent dataCurrent until Add/Update, so parent persistence
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
      // values that are intentionally not mirrored into dataCurrent.  Using
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
 * Metadata-driven reactive CTX fields
 *
 * Server-side expressions are parsed once and their AST is embedded beside
 * calculated controls. While the user edits ordinary form fields, this small
 * browser evaluator reuses that AST to refresh calculated values immediately.
 * Every source-field mutation also emits the normal manatos:ctx-change event;
 * when the development CTX runtime is present the actual browser CTX node is
 * updated first so DEBUG observes the same value transition.
 *
 * The reactive plan is compiled once from those ASTs. Calculated values and
 * evaluator-driven UI properties share one dependency registry, so a source
 * change evaluates only the entries that depend on that field and propagates
 * through calculated-field dependencies without reparsing expressions.
 * ======================================================================== */
(() => {
  const form = document.querySelector('form.metadata-driven-record-form');
  if (!(form instanceof HTMLFormElement)) return;

  const CHANGE_EVENT = 'manatos:ctx-change';
  const runtime = window.ManatOS?.ctx;

  const leafPagePath = () => {
    if (!runtime?.value?.page) return null;
    let node = runtime.value.page;
    let path = 'ctx.page';
    while (node?.page) {
      node = node.page;
      path += '.page';
    }
    return path;
  };

  const leafPageFieldsPath = () => {
    const pagePath = leafPagePath();
    return pagePath ? `${pagePath}.fields` : null;
  };

  const leafPageDataCurrentPath = () => {
    const pagePath = leafPagePath();
    return pagePath ? `${pagePath}.dataCurrent` : null;
  };

  /** Update the working record through CTX; dependents react to the CTX event. */
  const syncCurrentValue = (key, value, source, triggerPath) => {
    const currentPath = leafPageDataCurrentPath();
    if (!key || !currentPath || !runtime?.replace) return;
    const path = `${currentPath}.${key}`;
    if (runtime.get?.(path) !== value) {
      runtime.replace(path, value, { source, triggerPath: triggerPath ?? path });
    }
  };

  const controlValue = (control) => {
    if (control instanceof HTMLSelectElement && control.value === '') return null;
    if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked;
    if (control instanceof HTMLInputElement && control.type === 'number') {
      return control.value === '' ? null : Number(control.value);
    }
    if (control instanceof HTMLInputElement && control.dataset.ctxValueType === 'duration') {
      if (!control.value) return null;
      try {
        const parsed = JSON.parse(control.value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return control?.value ?? null;
  };

  const enumItems = (control) => {
    if (!(control instanceof HTMLSelectElement) || !control.dataset.enumItems) return [];
    try {
      const parsed = JSON.parse(control.dataset.enumItems);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const selectedEnumItem = (control) => {
    if (!(control instanceof HTMLSelectElement)) return null;

    // HTML select values are always strings. Canonical enum metadata normally
    // uses strings too, but normalize both sides so generic enum traits remain
    // reliable if a future enum uses numeric/boolean wire values.
    const selectedValue = String(control.value ?? '');
    const fromFieldMetadata = enumItems(control).find(
      (item) => item && String(item.value ?? '') === selectedValue,
    );
    if (fromFieldMetadata) return fromFieldMetadata;

    // Keep the selected option self-describing as a defensive fallback. This
    // also means reactive metadata rules do not depend on developer CTX runtime
    // availability or on a second lookup table after the server rendered them.
    const raw = control.selectedOptions?.[0]?.dataset?.enumItem;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const enumToneClasses = (item) => {
    const tone = item?.tone;
    if (!tone) return [];
    if (tone === 'danger' && item?.toneStrength === 'soft') return ['text-danger', 'opacity-75'];
    if (tone === 'danger' && item?.toneStrength === 'strong') return ['text-danger-emphasis'];
    if (tone === 'warning') return ['text-warning-emphasis'];
    return [`text-${tone}`];
  };

  const updateEnumIcon = (control) => {
    if (!(control instanceof HTMLSelectElement)) return;
    const root = control.closest('[data-metadata-enum-select], [data-enum-icon-control]');
    const icon = root?.querySelector('[data-enum-selected-icon]');
    const label = root?.querySelector('[data-enum-selected-label]');
    const toggle = root?.querySelector('[data-metadata-enum-toggle]');
    const item = selectedEnumItem(control);
    if (icon instanceof HTMLElement) {
      icon.className = `bi bi-${item?.icon || 'list'}`;
      enumToneClasses(item).forEach((className) => icon.classList.add(className));
    }
    if (label instanceof HTMLElement) label.textContent = item?.label || item?.value || 'Choose...';
    if (toggle instanceof HTMLButtonElement) toggle.disabled = control.disabled;
  };

  const formFieldValue = (name) => {
    const escaped = globalThis.CSS?.escape ? CSS.escape(name) : name.replace(/"/g, '\\"');
    const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
    if (control) return controlValue(control);
    const calculated = form.querySelector(`[data-ctx-calculated-field="${escaped}"]`);
    if (calculated instanceof HTMLInputElement) return calculated.value;
    return undefined;
  };

  /**
   * Resolve a live form field as an evaluator value. Bare field references use
   * the control's scalar value, while member access keeps a tiny field wrapper
   * so declarative enum-item metadata (for example
   * `principalType.option.canHaveParent`) remains available even when the CTX
   * debugger/runtime is disabled. This keeps reactive UI decisions independent
   * from developer tooling and mirrors the server evaluator's field semantics.
   */
  let normalizationValueActive = false;
  let normalizationValue;
  const resolveLocalFieldVariable = (members) => {
    if (!Array.isArray(members) || !members.length || typeof members[0] !== 'string') return undefined;
    const key = members[0];
    if (normalizationValueActive && key === 'value' && members.length === 1) return normalizationValue;
    const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
    const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
    const calculated = form.querySelector(`[data-ctx-calculated-field="${escaped}"]`);

    let fieldValue;
    let option;
    if (control) {
      fieldValue = controlValue(control);
      if (control instanceof HTMLSelectElement && control.dataset.enumItems) {
        option = selectedEnumItem(control);
      }
    } else if (calculated instanceof HTMLInputElement) {
      fieldValue = calculated.value;
    } else {
      return undefined;
    }

    if (members.length === 1) return fieldValue;

    let value = { value: fieldValue, option };
    for (const member of members.slice(1)) {
      if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
      value = value[member];
    }
    return value;
  };

  let explicitEvaluationScopePath = null;

  const resolveVariable = (node) => {
    if (!node || !Array.isArray(node.members) || !node.members.length) return undefined;

    // Non-absolute expressions resolve local form fields first. This includes
    // rich enum option traits and therefore works in production even when the
    // development CTX runtime is not loaded.
    if (!node.absolute && !explicitEvaluationScopePath) {
      const local = resolveLocalFieldVariable(node.members);
      if (local !== undefined) return local;
    }

    // Root/page/user/system paths continue through the generic CTX resolver.
    if (runtime?.resolve) {
      const scopePath = explicitEvaluationScopePath ?? leafPageFieldsPath()?.replace(/\.fields$/, '') ?? undefined;
      const resolved = runtime.resolve(node.path, scopePath);
      if (resolved !== undefined) return resolved;
    }
    throw new Error(`Reactive expression variable not available in this browser scope: ${node.path}`);
  };

  const scalar = (value) => value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value) || value instanceof Date;
  const num = (value, op) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${op} requires numbers`);
    return value;
  };
  const truthy = (value) => {
    if (!scalar(value)) throw new Error('Structured values are not supported by reactive scalar expressions yet.');
    return Boolean(value);
  };
  const plus = (left, right) => {
    if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
    return num(left, '+') + num(right, '+');
  };

  const parseCalendarDate = (raw) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw || ''));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatCalendarDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const pad2 = (value) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  };
  const normalizedCalendarDuration = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const part = (key) => {
      const numeric = Number(value[key] || 0);
      return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
    };
    return { years: part('years'), months: part('months'), days: part('days') };
  };
  const daysInCalendarMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const withClampedCalendarYearMonth = (date, year, monthIndex) => new Date(Date.UTC(
    year,
    monthIndex,
    Math.min(date.getUTCDate(), daysInCalendarMonth(year, monthIndex)),
  ));
  const addCalendarDuration = (start, duration) => {
    let cursor = withClampedCalendarYearMonth(start, start.getUTCFullYear() + duration.years, start.getUTCMonth());
    const monthTotal = cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() + duration.months;
    cursor = withClampedCalendarYearMonth(cursor, Math.floor(monthTotal / 12), monthTotal % 12);
    return new Date(cursor.getTime() + duration.days * 24 * 60 * 60 * 1000);
  };
  const calendarDurationBetween = (start, end) => {
    if (end.getTime() < start.getTime()) return null;
    let years = Math.max(0, end.getUTCFullYear() - start.getUTCFullYear());
    while (years > 0 && addCalendarDuration(start, { years, months: 0, days: 0 }).getTime() > end.getTime()) years -= 1;
    let cursor = addCalendarDuration(start, { years, months: 0, days: 0 });
    let months = Math.max(0, (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + (end.getUTCMonth() - cursor.getUTCMonth()));
    while (months > 0 && addCalendarDuration(cursor, { years: 0, months, days: 0 }).getTime() > end.getTime()) months -= 1;
    cursor = addCalendarDuration(cursor, { years: 0, months, days: 0 });
    const days = Math.max(0, Math.round((end.getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000)));
    return { years, months, days };
  };

  const evaluate = (node) => {
    if (!node) return undefined;
    switch (node.kind) {
      case 'literal': return node.value;
      case 'variable': return resolveVariable(node);
      case 'group': return evaluate(node.expression);
      case 'unary': {
        const value = evaluate(node.operand);
        if (node.operator === '!') return !truthy(value);
        if (node.operator === '~') return ~num(value, '~');
        if (node.operator === '+') return num(value, '+');
        if (node.operator === '-') return -num(value, '-');
        return undefined;
      }
      case 'binary': {
        const left = evaluate(node.left);
        if (node.operator === '??') return left == null ? evaluate(node.right) : left;
        if (node.operator === '&&') return truthy(left) ? evaluate(node.right) : left;
        if (node.operator === '||') return truthy(left) ? left : evaluate(node.right);
        const right = evaluate(node.right);
        switch (node.operator) {
          case '+': return plus(left, right);
          case '-': return num(left, '-') - num(right, '-');
          case '*': return num(left, '*') * num(right, '*');
          case '/': return num(left, '/') / num(right, '/');
          case '%': return num(left, '%') % num(right, '%');
          case '**': return num(left, '**') ** num(right, '**');
          // Intentional JS/TS-style scalar equality split, matching the server evaluator.
          case '==': return left == right; // eslint-disable-line eqeqeq
          case '!=': return left != right; // eslint-disable-line eqeqeq
          case '===': return left === right;
          case '!==': return left !== right;
          case '<': return left < right;
          case '<=': return left <= right;
          case '>': return left > right;
          case '>=': return left >= right;
          case '<<': return num(left, '<<') << (num(right, '<<') & 31);
          case '>>': return num(left, '>>') >> (num(right, '>>') & 31);
          case '>>>': return (num(left, '>>>') >>> (num(right, '>>>') & 31)) >>> 0;
          case '&': return num(left, '&') & num(right, '&');
          case '^': return num(left, '^') ^ num(right, '^');
          case '|': return num(left, '|') | num(right, '|');
          default: return undefined;
        }
      }
      case 'conditional': return truthy(evaluate(node.condition)) ? evaluate(node.whenTrue) : evaluate(node.whenFalse);
      case 'function': {
        const args = (node.arguments || []).map(evaluate);
        if (node.functionName === 'CurrentDay') {
          const now = new Date();
          const pad = (v) => String(v).padStart(2, '0');
          return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;
        }
        if (node.functionName === 'EmailAddress') {
          const normalized = String(args[0] ?? '').trim().toLocaleLowerCase();
          if (!normalized) return null;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('EmailAddress requires a valid email address.');
          return normalized;
        }
        if (node.functionName === 'TelephoneNbr') {
          const clean = (value) => String(value ?? '').trim();
          if (args.length === 1) {
            const raw = clean(args[0]);
            if (!raw) return null;
            const digits = raw.replace(/\D/g, '');
            if (!raw.startsWith('+') || digits.length < 4 || digits.length > 15) throw new Error('TelephoneNbr requires an international number beginning with + and containing 4-15 digits.');
            return `+${digits}`;
          }
          const country = clean(args[0]);
          const countryDigits = country.replace(/\D/g, '');
          const numberDigits = clean(args[1]).replace(/\D/g, '');
          if (!country.startsWith('+') || !countryDigits || numberDigits.length < 3 || `${countryDigits}${numberDigits}`.length > 15) throw new Error('TelephoneNbr requires a valid country code and national number.');
          return `+${countryDigits}${numberDigits}`;
        }
        if (node.functionName === 'SqRoot') return Math.sqrt(Number(args[0]));
        if (node.functionName === 'TraverseCtx') {
          const [startId, collection, parentField, resultField] = args;
          if (startId == null || startId === '' || !collection || typeof collection !== 'object') return null;
          const keyed = (container, key) => {
            if (Array.isArray(container)) {
              return container.find((item) => item && typeof item === 'object' && (item.id === key || item.key === key));
            }
            return container?.[key];
          };
          const seen = new Set();
          let id = startId;
          for (let depth = 0; depth < 256; depth += 1) {
            const key = String(id);
            if (seen.has(key)) throw new Error(`TraverseCtx detected a parent cycle at ${key}.`);
            seen.add(key);
            const row = keyed(collection, key);
            if (!row || typeof row !== 'object') return null;
            const parent = row[parentField];
            if (parent == null || parent === '') return resultField ? (row[resultField] ?? null) : row;
            id = parent;
          }
          throw new Error('TraverseCtx exceeded the maximum traversal depth of 256.');
        }
        if (node.functionName === 'CalendarAddDuration') {
          const start = parseCalendarDate(args[0]);
          const duration = normalizedCalendarDuration(args[1]);
          return start && duration ? formatCalendarDate(addCalendarDuration(start, duration)) : null;
        }
        if (node.functionName === 'CalendarDurationBetween') {
          const start = parseCalendarDate(args[0]);
          const end = parseCalendarDate(args[1]);
          return start && end ? calendarDurationBetween(start, end) : null;
        }
        if (node.functionName === 'GetTime') return Date.now();
        if (node.functionName === 'StrFormat') {
          return String(args[0] ?? '').replace(/\{(\d+)\}/g, (match, raw) => Number(raw) + 1 < args.length ? String(args[Number(raw) + 1] ?? '') : match);
        }
        return undefined;
      }
      default: return undefined;
    }
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.expression = Object.freeze({
    evaluateAst: (ast) => evaluate(ast),
    evaluateAstAt: (ast, scopePath) => {
      const previousScope = explicitEvaluationScopePath;
      explicitEvaluationScopePath = scopePath || null;
      try { return evaluate(ast); } finally { explicitEvaluationScopePath = previousScope; }
    },
    currentCtxPath: () => leafPagePath(),
    currentCtxNode: () => {
      const path = leafPagePath();
      return path && runtime?.get ? runtime.get(path) : null;
    },
  });

  // Normalization is a canonical field-metadata concern. Components merely
  // edit values; this generic pipeline evaluates the field's precompiled
  // normalize AST on blur and publishes the normalized value through CTX.
  form.addEventListener('focusout', (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    const container = control.closest('[data-ctx-field-container]');
    if (!container?.dataset.fieldNormalizeAst) return;
    try {
      const ast = JSON.parse(container.dataset.fieldNormalizeAst || 'null');
      if (!ast) return;
      const previous = control.value;
      normalizationValueActive = true;
      normalizationValue = previous;
      let normalized;
      try { normalized = evaluate(ast); }
      finally { normalizationValueActive = false; normalizationValue = undefined; }
      if (normalized == null && previous === '') return;
      const next = normalized == null ? '' : String(normalized);
      if (next !== previous) {
        control.value = next;
        syncSourceField(control, { source: 'field-normalization', triggerField: control.dataset.ctxField });
      }
    } catch (error) {
      control.setCustomValidity(error instanceof Error ? error.message : 'Invalid value.');
      control.reportValidity();
    }
  });
  form.addEventListener('input', (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.setCustomValidity('');
  });

  /*
   * Compile the browser-side reactive plan once from the ASTs embedded by the
   * server. The browser never reparses expression strings. Calculated values
   * and evaluator-driven UI properties share this same dependency registry.
   */
  const astCache = new WeakMap();
  const parseAst = (element, attribute) => {
    let byAttribute = astCache.get(element);
    if (!byAttribute) {
      byAttribute = new Map();
      astCache.set(element, byAttribute);
    }
    if (byAttribute.has(attribute)) return byAttribute.get(attribute);
    try {
      const raw = element.getAttribute(attribute);
      const ast = raw ? JSON.parse(raw) : null;
      byAttribute.set(attribute, ast);
      return ast;
    } catch {
      byAttribute.set(attribute, null);
      return null;
    }
  };

  const expressionDependencyPaths = (ast) => {
    const dependencies = new Set();
    const scopePath = leafPagePath() ?? undefined;

    const visit = (node) => {
      if (!node || typeof node !== 'object') return;

      if (node.kind === 'variable' && typeof node.path === 'string') {
        const resolvedPath = runtime?.resolvePath?.(node.path, scopePath);
        if (typeof resolvedPath === 'string' && resolvedPath) {
          dependencies.add(resolvedPath);
        }
      }

      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      });
    };

    visit(ast);
    return dependencies;
  };

  const pathsOverlap = (left, right) => {
    if (left === right) return true;
    const childOf = (candidate, parent) =>
      candidate.startsWith(`${parent}.`) || candidate.startsWith(`${parent}[`);
    return childOf(left, right) || childOf(right, left);
  };

  const reactiveEntries = [];
  const registerEntry = (entry) => {
    reactiveEntries.push(entry);
  };

  const calculatedRawValue = (element) => {
    try { return JSON.parse(element.dataset.calculatedValue || 'null'); }
    catch { return null; }
  };

  const setCalculatedDisplay = (element, value) => {
    if (element.dataset.calculatedFieldType === 'reference') {
      let values = [];
      try {
        const parsed = JSON.parse(element.dataset.referenceValues || '[]');
        if (Array.isArray(parsed)) values = parsed;
      } catch { /* keep empty */ }
      const match = values.find((candidate) => candidate?.id === value);
      element.value = value == null || value === '' ? '' : String(match?.name ?? value);
      return;
    }
    element.value = value == null ? '' : String(value);
  };

  form.querySelectorAll('[data-ctx-calculated-field]').forEach((element) => {
    if (!(element instanceof HTMLInputElement)) return;
    const ast = parseAst(element, 'data-calculated-ast');
    if (!ast) return;
    const key = element.dataset.ctxCalculatedField;
    const persisted = element.dataset.calculatedPersisted === 'true';

    registerEntry({
      kind: 'calculated',
      key,
      dependencyPaths: expressionDependencyPaths(ast),
      run: () => {
        try {
          const next = evaluate(ast);
          const current = calculatedRawValue(element);
          const changed = !Object.is(current, next);

          if (changed) {
            element.dataset.calculatedValue = JSON.stringify(next ?? null);
            setCalculatedDisplay(element, next);
          }

          const pagePath = leafPagePath();
          const fieldsPath = leafPageFieldsPath();
          if (key && pagePath && fieldsPath && runtime) {
            const valuePath = `${fieldsPath}.${key}.value`;
            if (runtime.get?.(valuePath) !== next) {
              if (persisted && runtime.updateField) {
                runtime.updateField(pagePath, key, next, undefined, {
                  source: 'calculated-field',
                  triggerPath: valuePath,
                });
              } else if (runtime.replace) {
                runtime.replace(valuePath, next, {
                  source: 'calculated-field',
                  triggerPath: valuePath,
                });
              }
            }
          }

          return changed;
        } catch {
          return false;
        }
      },
    });
  });

  const sameReactiveValue = (left, right) => {
    if (Object.is(left, right)) return true;
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
    }
    return false;
  };

  const writeCalculatedControlValue = (control, value) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    if (control instanceof HTMLInputElement && control.dataset.ctxValueType === 'duration') {
      const durationRoot = control.closest('[data-duration-field]');
      if (durationRoot) window.ManatOSFieldComponents?.setDurationValue?.(durationRoot, value, { emit: false });
      return;
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = value == null ? '' : String(value);
    updateEnumIcon(control);
  };

  /*
   * Canonical normal-field calculations use the same precompiled AST/evaluator
   * plan as derived fields. The UI component arranging a field never participates
   * in the calculation. `triggeredBy` is matched against CTX causal provenance,
   * preserving the original user-authoritative field through dependent writes.
   */
  form.querySelectorAll('[data-field-calculation-ast]').forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    const ast = parseAst(container, 'data-field-calculation-ast');
    if (!ast) return;
    const key = container.dataset.ctxFieldContainer;
    if (!key) return;
    let triggeredBy = [];
    try {
      const parsed = JSON.parse(container.dataset.fieldCalculationTriggeredBy || '[]');
      if (Array.isArray(parsed)) triggeredBy = parsed.filter((value) => typeof value === 'string' && value);
    } catch { /* invalid metadata is already visible through server-side diagnostics */ }
    const scopePath = leafPagePath() ?? undefined;
    const triggerPaths = new Set(triggeredBy.map((fieldKey) => runtime?.resolvePath?.(fieldKey, scopePath)).filter(Boolean));

    registerEntry({
      kind: 'field-calculation',
      key,
      dependencyPaths: expressionDependencyPaths(ast),
      run: (change) => {
        if (!change) return false;
        const authoritativePath = change.cause?.triggerPath || change.changedPath;
        if (![...triggerPaths].some((triggerPath) => pathsOverlap(triggerPath, authoritativePath))) return false;
        try {
          const next = evaluate(ast);
          const pagePath = leafPagePath();
          const fieldsPath = leafPageFieldsPath();
          if (!pagePath || !fieldsPath || !runtime?.updateField) return false;
          const valuePath = `${fieldsPath}.${key}.value`;
          const current = runtime.get?.(valuePath);
          if (sameReactiveValue(current, next)) return false;

          const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
          const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
          writeCalculatedControlValue(control, next);
          const option = control instanceof HTMLSelectElement && control.dataset.enumItems
            ? selectedEnumItem(control)
            : undefined;
          runtime.updateField(pagePath, key, next, option, {
            source: 'calculated-field',
            triggerPath: authoritativePath,
            ...(change.cause?.rootEventId ? { rootEventId: change.cause.rootEventId } : {}),
          });
          return true;
        } catch {
          return false;
        }
      },
    });
  });

  const debugValueText = (value) => {
    if (value === undefined || value === null || value === '') return '—';
    if (Array.isArray(value)) return value.length ? `[ ${value.map(debugValueText).join(', ')} ]` : '[]';
    if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  };

  /*
   * Development-only Debugging-tab cells subscribe to the same resolved CTX
   * dependency paths as visible calculated values. Their AST is still the
   * server-compiled AST; the browser never reparses formula text.
   */
  form.querySelectorAll('[data-debug-calculation-value]').forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    const ast = parseAst(cell, 'data-debug-calculation-ast');
    if (!ast) return;
    registerEntry({
      kind: 'debug-value',
      dependencyPaths: expressionDependencyPaths(ast),
      run: () => {
        try {
          const next = debugValueText(evaluate(ast));
          const changed = cell.textContent !== next;
          if (changed) cell.textContent = next;
          return changed;
        } catch {
          return false;
        }
      },
    });
  });

  /*
   * Layout spans use the same precompiled-AST reactive pipeline as field
   * visibility/editability. Metadata may therefore reflow a grid when a CTX
   * dependency changes without any entity/component-specific JavaScript.
   */
  form.querySelectorAll('[data-ui-grid-span-ast]').forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    const spanAst = parseAst(container, 'data-ui-grid-span-ast');
    if (!spanAst) return;
    const fallback = Math.max(1, Math.min(12, Number(container.dataset.uiGridSpanFallback || 12) || 12));

    registerEntry({
      kind: 'grid-span',
      dependencyPaths: expressionDependencyPaths(spanAst),
      run: () => {
        try {
          const evaluated = Number(evaluate(spanAst));
          const nextSpan = Number.isFinite(evaluated)
            ? Math.max(1, Math.min(12, Math.trunc(evaluated)))
            : fallback;
          const currentClass = [...container.classList].find((name) => /^col-md-\d+$/.test(name));
          const nextClass = `col-md-${nextSpan}`;
          if (currentClass === nextClass) return false;
          if (currentClass) container.classList.remove(currentClass);
          container.classList.add(nextClass);
          return true;
        } catch {
          return false;
        }
      },
    });
  });

  form.querySelectorAll('[data-ctx-field-container]').forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    const visibleAst = parseAst(container, 'data-ui-visible-ast');
    const editableAst = parseAst(container, 'data-ui-editable-ast');

    if (visibleAst) {
      registerEntry({
        kind: 'visible',
        dependencyPaths: expressionDependencyPaths(visibleAst),
        run: () => {
          try {
            const nextHidden = evaluate(visibleAst) === false;
            const changed = container.hidden !== nextHidden;
            container.hidden = nextHidden;
            return changed;
          } catch {
            return false;
          }
        },
      });
    }

    if (editableAst) {
      registerEntry({
        kind: 'editable',
        dependencyPaths: expressionDependencyPaths(editableAst),
        run: () => {
          try {
            const editable = evaluate(editableAst) !== false;
            const controls = [...container.querySelectorAll('[data-ctx-field]')];
            const readonlySubmit = container.querySelector('[data-readonly-submit]');
            const hasReadOnlyValue = container.dataset.uiHasReadonlyValue === 'true';
            let readOnlyValue;
            if (hasReadOnlyValue) {
              try { readOnlyValue = JSON.parse(container.dataset.uiReadonlyValue || 'null'); }
              catch { readOnlyValue = null; }
            }

            let changed = false;
            controls.forEach((control) => {
              const wasEditable = control instanceof HTMLInputElement && control.type !== 'checkbox'
                ? !control.readOnly
                : !control.disabled;

              if (!editable && hasReadOnlyValue) {
                const current = controlValue(control);
                if (!Object.is(current, readOnlyValue)) {
                  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
                    control.checked = Boolean(readOnlyValue);
                  } else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
                    control.value = readOnlyValue == null ? '' : String(readOnlyValue);
                  }
                  updateEnumIcon(control);

                  const key = control.dataset.ctxField;
                  const pagePath = leafPagePath();
                  const fieldsPath = leafPageFieldsPath();
                  if (key && pagePath && fieldsPath && runtime?.updateField) {
                    const valuePath = `${fieldsPath}.${key}.value`;
                    runtime.updateField(pagePath, key, readOnlyValue, undefined, {
                      source: 'field-editability',
                      triggerPath: valuePath,
                    });
                  } else if (key && fieldsPath && runtime?.replace) {
                    const valuePath = `${fieldsPath}.${key}.value`;
                    runtime.replace(valuePath, readOnlyValue, {
                      source: 'field-editability',
                      triggerPath: valuePath,
                    });
                    syncCurrentValue(key, readOnlyValue, 'field-editability', valuePath);
                  }
                  changed = true;
                }
              }

              if (control instanceof HTMLInputElement && control.type !== 'checkbox') control.readOnly = !editable;
              else control.disabled = !editable;
              updateEnumIcon(control);
              if (wasEditable !== editable) changed = true;
            });

            if (readonlySubmit instanceof HTMLInputElement) {
              readonlySubmit.disabled = editable;
              readonlySubmit.value = readOnlyValue == null ? '' : String(readOnlyValue);
            }

            return changed;
          } catch {
            return false;
          }
        },
      });
    }
  });

  /*
   * CTX-event scheduler.
   *
   * Every formula subscribes to the exact CTX paths resolved from its AST when
   * the page starts. User edits and calculated/programmatic changes all travel
   * through the same CTX setter/event path. If a calculation changes another
   * CTX value, that event is queued and wakes its own dependents. Processing
   * continues until the queue is empty, with a hard cycle/runaway guard.
   */
  const pendingChanges = [];
  const pendingChangeKeys = new Set();
  let processingChanges = false;

  const enqueueChange = (change) => {
    const paths = [change?.path, ...(Array.isArray(change?.relatedPaths) ? change.relatedPaths : [])]
      .filter((path) => typeof path === 'string' && path);
    if (!paths.length) return;
    const cause = change?.cause || {};
    for (const changedPath of paths) {
      const key = `${cause.rootEventId || cause.eventId || 'event'}|${changedPath}`;
      if (pendingChangeKeys.has(key)) continue;
      pendingChangeKeys.add(key);
      pendingChanges.push({ changedPath, cause, queueKey: key });
    }

    if (processingChanges) return;

    processingChanges = true;
    let executions = 0;
    try {
      while (pendingChanges.length) {
        const currentChange = pendingChanges.shift();
        pendingChangeKeys.delete(currentChange.queueKey);

        for (const entry of reactiveEntries) {
          if (![...entry.dependencyPaths].some((dependencyPath) => pathsOverlap(dependencyPath, currentChange.changedPath))) {
            continue;
          }

          entry.run(currentChange);
          executions += 1;
          if (executions > 512) {
            console.error('[ManatOS CTX] Reactive calculation queue exceeded 512 executions; possible dependency cycle.', {
              changedPath: currentChange.changedPath,
              triggerPath: currentChange.cause?.triggerPath,
              rootEventId: currentChange.cause?.rootEventId,
            });
            pendingChanges.length = 0;
            pendingChangeKeys.clear();
            return;
          }
        }
      }
    } finally {
      processingChanges = false;
    }
  };

  const runAllReactiveEntries = () => {
    reactiveEntries.forEach((entry) => entry.run());
  };

  const syncSourceField = (control, eventCause = {}) => {
    const key = control?.dataset?.ctxField;
    if (!key) return;
    const value = controlValue(control);
    const fieldsPath = leafPageFieldsPath();
    const path = fieldsPath ? `${fieldsPath}.${key}.value` : `fields.${key}.value`;

    updateEnumIcon(control);

    const source = typeof eventCause.source === 'string' && eventCause.source
      ? eventCause.source
      : 'form-field';
    const triggerPath = eventCause.triggerField && fieldsPath
      ? `${fieldsPath}.${eventCause.triggerField}.value`
      : (eventCause.triggerPath || path);
    const cause = { source, triggerPath, ...(eventCause.rootEventId ? { rootEventId: eventCause.rootEventId } : {}) };

    if (fieldsPath && runtime?.updateField) {
      const pagePath = leafPagePath();
      const option = control instanceof HTMLSelectElement && control.dataset.enumItems
        ? selectedEnumItem(control)
        : undefined;
      runtime.updateField(pagePath, key, value, option, cause);
    } else if (fieldsPath && runtime?.replace) {
      runtime.replace(path, value, cause);
      syncCurrentValue(key, value, source, triggerPath);
    } else {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
        detail: {
          operation: 'replace', path, relatedPaths: [], newValue: value,
          cause,
        },
      }));
    }
  };

  const react = (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (control) syncSourceField(control, event.manatosCause || {});
  };

  // DOM controls only adapt user input into CTX. Formula-to-form reactivity is
  // entirely driven by CTX value paths discovered from AST dependencies.
  window.addEventListener(CHANGE_EVENT, (event) => {
    enqueueChange(event?.detail || {});
  });

  form.addEventListener('click', (event) => {
    const action = event.target instanceof Element ? event.target.closest('[data-debug-inspect-ctx]') : null;
    if (!(action instanceof HTMLButtonElement)) return;
    const path = action.dataset.debugInspectPath;
    if (!path) return;
    window.dispatchEvent(new Event('manatos:ctx-viewer-show'));
    window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', { detail: { path, expand: true } }));
  });

  form.addEventListener('input', react);
  form.addEventListener('change', react);
  queueMicrotask(() => {
    form.querySelectorAll('select[data-enum-items]').forEach(updateEnumIcon);
    runAllReactiveEntries();
    form.dispatchEvent(new Event('change', { bubbles: true }));
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
    const ctxValue = pagePath ? runtime?.get?.(`${pagePath}.dataCurrent.${key}`) : undefined;
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

    const current = runtime.get?.(`${pagePath}.dataCurrent`);
    const original = runtime.get?.(`${pagePath}.dataOriginal`);
    const mergedCurrent = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...current, ...record }
      : { ...record };
    const mergedOriginal = original && typeof original === 'object' && !Array.isArray(original)
      ? { ...original, ...record }
      : { ...mergedCurrent };

    runtime.replace(`${pagePath}.dataCurrent`, mergedCurrent, { source: 'save-reconcile' });
    runtime.replace(`${pagePath}.dataOriginal`, mergedOriginal, { source: 'save-reconcile' });

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
    if (!isStay || form.dataset.recordMode === 'create' || saving) return;

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
    const select = root.querySelector('select[data-ctx-field]');
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
