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
    const state = { baseline: null, snapshot };
    window.manatosSysBOFormState = state;

    let pending = null;
    let allowPageExit = false;

    const dirty = () => state.baseline !== null && state.snapshot() !== state.baseline;

    window.manatosRetry = () => form.requestSubmit();
    window.manatosAllowDirtyPageExit = () => { allowPageExit = true; };

    document.querySelectorAll('a.dirty-navigation').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        if (!dirty()) return;
        event.preventDefault();
        pending = anchor.href;
        bootstrap.Modal.getOrCreateInstance(document.getElementById('unsavedChangesModal')).show();
      });
    });

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

    window.addEventListener('beforeunload', (event) => {
      if (dirty() && !allowPageExit) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    form.addEventListener('submit', () => {
      allowPageExit = true;
      window.manatosRetry = null;
    });

    queueMicrotask(() => {
      state.baseline = state.snapshot();
      form.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
})();
/** External-auth provider editor: provider defaults, credential lifecycle and help content. */
(() => {
  const root = document.querySelector('[data-ext-auth-provider-editor]');
  if (!root) return;

  const provider = root.querySelector('#provider');
  const callback = root.querySelector('#callbackPath');
  const tenant = root.querySelector('[data-microsoft-tenant]');
  const tenantSelect = root.querySelector('#tenant');
  const tenantValue = root.querySelector('[data-microsoft-tenant-value]');
  const providerIcon = root.querySelector('[data-provider-icon] i');
  const form = root.closest('form');
  const enabled = form?.querySelector('#enabled');
  const clientId = form?.querySelector('[data-provider-client-id]');
  const clientSecret = form?.querySelector('[data-provider-client-secret]');
  const secretEditor = form?.querySelector('[data-provider-secret-editor]');
  const secretDisplay = form?.querySelector('[data-provider-secret-display]');
  const changeCredentials = form?.querySelector('[data-provider-change-credentials]');
  const testCredentials = form?.querySelector('[data-provider-test-credentials]');
  const credentialState = form?.querySelector('[data-provider-credential-test-state]');
  const pendingCredentialSave = form?.querySelector('[data-provider-pending-credential-save]');
  const verificationIndicator = form?.querySelector('[data-provider-credentials-verified-indicator]');

  if (!(provider instanceof HTMLSelectElement) || !(callback instanceof HTMLInputElement)) return;

  const defaults = Object.fromEntries([...provider.options].map((option) => [option.value, option.dataset.callbackDefault || '']).filter(([, value]) => value));
  const providerIcons = Object.fromEntries([...provider.options].map((option) => [option.value, option.dataset.providerIcon || '']).filter(([, value]) => value));
  const tenantDefaults = Object.fromEntries([...provider.options].map((option) => [option.value, option.dataset.tenantDefault || '']).filter(([, value]) => value));
  let previousProvider = provider.value;

  const notifyFormState = () => form?.dispatchEvent(new Event('change', { bubbles: true }));

  const showProviderHelp = (selector, key) => {
    document.querySelectorAll(selector).forEach((panel) => {
      if (panel instanceof HTMLElement) {
        const panelProvider = panel.dataset.providerGeneralHelp ?? panel.dataset.providerSecretsHelp;
        panel.hidden = panelProvider !== key;
      }
    });
  };

  const updateCredentialRequirements = () => {
    if (!(clientId instanceof HTMLInputElement) || !(clientSecret instanceof HTMLInputElement)) return;
    if (clientId.readOnly || clientSecret.disabled) return;
    const providerEnabled = enabled instanceof HTMLInputElement && enabled.checked;
    const anyCredentialValue = Boolean(clientId.value.trim() || clientSecret.value.trim());
    clientId.required = providerEnabled || anyCredentialValue;
    clientSecret.required = providerEnabled || anyCredentialValue;
  };

  const updateTestButton = () => {
    updateCredentialRequirements();
    if (!(testCredentials instanceof HTMLButtonElement)) return;
    if (testCredentials.dataset.providerTestStored === 'true') {
      testCredentials.disabled = false;
      return;
    }
    testCredentials.disabled = !(
      clientId instanceof HTMLInputElement &&
      clientSecret instanceof HTMLInputElement &&
      !clientId.readOnly &&
      !clientSecret.disabled &&
      clientId.value.trim() &&
      clientSecret.value.trim()
    );
  };

  const beginCredentialChange = () => {
    if (!(clientId instanceof HTMLInputElement) || !(clientSecret instanceof HTMLInputElement)) return;
    clientId.readOnly = false;
    clientId.removeAttribute('aria-readonly');
    clientId.name = 'clientId';
    clientId.required = true;
    clientSecret.disabled = false;
    clientSecret.required = true;
    clientSecret.value = '';
    if (secretEditor instanceof HTMLElement) secretEditor.hidden = false;
    if (secretDisplay instanceof HTMLElement) secretDisplay.hidden = true;
    if (changeCredentials instanceof HTMLElement) changeCredentials.hidden = true;
    if (testCredentials instanceof HTMLButtonElement) {
      testCredentials.hidden = false;
      testCredentials.dataset.providerTestStored = 'false';
    }
    if (credentialState instanceof HTMLInputElement) credentialState.value = 'required';
    if (pendingCredentialSave instanceof HTMLInputElement) pendingCredentialSave.value = 'false';
    if (verificationIndicator instanceof HTMLElement) {
      const badge = verificationIndicator.querySelector('.badge');
      if (badge instanceof HTMLElement) {
        badge.classList.remove('text-bg-success');
        badge.classList.add('text-bg-secondary');
        badge.innerHTML = '<i class="bi bi-x-circle me-1"></i>No';
      }
    }
    updateTestButton();
    notifyFormState();
    clientId.focus();
  };

  changeCredentials?.addEventListener('click', beginCredentialChange);
  clientId?.addEventListener('input', updateTestButton);
  clientSecret?.addEventListener('input', updateTestButton);

  /*
   * Provider credential testing uses a dedicated OAuth popup for the provider
   * UI, while the ManatOS editor remains locked in the original window. The
   * authoritative completion signal is server-side polling; postMessage is
   * retained only as an optional fast-path because browser opener isolation
   * can sever window.opener during cross-origin OAuth navigation.
   */
  testCredentials?.addEventListener('click', async () => {
    if (
      !(testCredentials instanceof HTMLButtonElement) ||
      !(clientId instanceof HTMLInputElement) ||
      !(clientSecret instanceof HTMLInputElement) ||
      !(form instanceof HTMLFormElement)
    ) return;

    const feedback = form.querySelector('[data-provider-credential-test-feedback]');
    const testStoredCredentials = testCredentials.dataset.providerTestStored === 'true';
    const providerLabel = () => provider.options[provider.selectedIndex]?.text || provider.value || 'Provider';
    const noReturnMessage = () => {
      if (provider.value === 'facebook') {
        return 'Facebook did not return a credential-test result to ManatOS. Check the Facebook window for the provider error. If it shows “App not active”, activate the Meta app or use an account that has an app role (Administrator, Developer or Tester), then retry. Your values were not changed.';
      }
      return providerLabel() + ' did not return a credential-test result to ManatOS. Check the provider window for an error, confirm the provider application is active and available to this account, then retry. Your values were not changed.';
    };
    const showFeedback = (message, success = false) => {
      if (!(feedback instanceof HTMLElement)) return;
      feedback.classList.remove('alert-danger', 'alert-success');
      feedback.classList.add(success ? 'alert-success' : 'alert-danger');
      feedback.textContent = message;
      feedback.hidden = false;
    };

    if (!testStoredCredentials && (!clientId.value.trim() || !clientSecret.value.trim())) {
      showFeedback('Enter both Client ID and Client secret before testing.');
      return;
    }

    if (feedback instanceof HTMLElement) {
      feedback.hidden = true;
      feedback.textContent = '';
    }
    testCredentials.disabled = true;

    const popupWidth = 720;
    const popupHeight = 760;
    const popupLeft = Math.max(0, Math.round(window.screenX + (window.outerWidth - popupWidth) / 2));
    const popupTop = Math.max(0, Math.round(window.screenY + (window.outerHeight - popupHeight) / 2));
    const testWindow = window.open('', 'manatos-provider-credential-test', 'popup,width=' + popupWidth + ',height=' + popupHeight + ',left=' + popupLeft + ',top=' + popupTop + ',resizable=yes,scrollbars=yes');
    if (!testWindow) {
      showFeedback('Allow popups for ManatOS to test provider credentials without leaving this form.');
      updateTestButton();
      return;
    }
    testWindow.document.title = 'Testing provider credentials';
    testWindow.document.body.innerHTML = '<p style="font-family:sans-serif;padding:1.5rem">Preparing secure provider credential test…</p>';

    const body = new URLSearchParams(new FormData(form));
    if (!testStoredCredentials) {
      body.set('clientId', clientId.value.trim());
      body.set('clientSecret', clientSecret.value);
    } else {
      body.delete('clientId');
      body.delete('clientSecret');
    }
    body.set('provider', provider.value);
    if (enabled instanceof HTMLInputElement) body.set('enabled', enabled.checked ? 'true' : 'false');

    let pollTimer = null;
    let completed = false;
    const finishWaiting = () => {
      completed = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      window.manatosBusy?.hide();
    };

    const closeTestWindow = () => {
      try {
        if (!testWindow.closed) testWindow.close();
        return true;
      } catch (error) {
        console.warn('Unable to close the provider credential-test window.', error);
        return false;
      }
    };

    try {
      const response = await fetch(
        testCredentials.dataset.providerTestUrl || '/bo/sys-ext-auth-providers/test-credentials',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            Accept: 'application/json',
          },
          body: body.toString(),
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success || !payload.redirectUrl || !payload.testId || !payload.statusUrl) {
        closeTestWindow();
        showFeedback(payload?.errorMessage || 'ManatOS could not start the provider credential test. Your unsaved provider values have been kept on this page.');
        updateTestButton();
        return;
      }

      window.manatosBusy?.show({
        title: 'Testing ' + providerLabel() + ' credentials…',
        message: 'Complete authentication in the provider window. We will continue automatically when verification finishes.',
        icon: providerIcons[provider.value] || 'bi-shield-check',
        actionLabel: 'Cancel test',
        onAction: async () => {
          let cancellationConfirmed = true;

          try {
            const cancelBody = new URLSearchParams();
            cancelBody.set('_csrf', body.get('_csrf') || '');
            cancelBody.set('testId', payload.testId);
            const cancelResponse = await fetch(payload.cancelUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: 'application/json',
              },
              body: cancelBody.toString(),
            });

            cancellationConfirmed = cancelResponse.ok;
          } catch (error) {
            cancellationConfirmed = false;
            console.warn('Could not confirm provider credential-test cancellation with ManatOS.', error);
          }

          finishWaiting();
          closeTestWindow();
          showFeedback(
            cancellationConfirmed
              ? 'Credential test cancelled. Your values were not changed.'
              : 'Credential testing was stopped locally, but ManatOS could not confirm server-side cancellation. The pending test will expire automatically; your values were not changed.',
          );
          updateTestButton();
        },
      });

      testWindow.location.replace(payload.redirectUrl);

      const pollStatus = async () => {
        if (completed) return;
        try {
          const statusResponse = await fetch(payload.statusUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
          const statusPayload = await statusResponse.json().catch(() => null);

          if (statusResponse.ok && statusPayload?.success && statusPayload.testId === payload.testId) {
            if (statusPayload.status === 'verified' || statusPayload.status === 'failed') {
              finishWaiting();
              closeTestWindow();
              const verified = statusPayload.status === 'verified';
              showFeedback(statusPayload.message, verified);

              if (verified) {
                // Verified credentials live only in the server-side pending
                // test state, so refresh the editor to render them locked and
                // ready to save. Failed credentials stay on the current page
                // so the Admin can correct the still-local input values.
                window.manatosAllowDirtyPageExit?.();
                const url = new URL(window.location.href);
                url.searchParams.set('credentialsTest', 'verified');
                url.searchParams.set('tab', 'secrets');
                window.setTimeout(() => window.location.replace(url.toString()), 180);
              } else {
                updateTestButton();
              }
              return;
            }
          }
        } catch {
          // Transient polling failures do not destroy the provider flow.
        }

        if (testWindow.closed) {
          // One final server check has just completed. If still pending, the Admin closed the provider window.
          finishWaiting();
          showFeedback(noReturnMessage());
          updateTestButton();
          return;
        }
        pollTimer = window.setTimeout(pollStatus, 750);
      };

      pollTimer = window.setTimeout(pollStatus, 400);
      window.setTimeout(() => {
        if (completed) return;
        finishWaiting();
        showFeedback(noReturnMessage());
        updateTestButton();
      }, 2 * 60 * 1000);
    } catch (error) {
      console.warn('Provider credential testing failed before completion.', error);
      finishWaiting();
      closeTestWindow();
      showFeedback('The credential test could not reach ManatOS. Your unsaved provider values have been kept on this page.');
      updateTestButton();
    }
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const result = event.data;
    if (!result || result.type !== 'manatos:provider-credential-test-result') return;
    // Fast-path only. Polling remains authoritative.
  });
  const apply = () => {
    const key = provider.value;
    callback.value = defaults[key] || callback.value;
    const isMicrosoft = key === 'microsoft';

    if (providerIcon instanceof HTMLElement) providerIcon.className = `bi ${providerIcons[key] || 'bi-globe2'}`;
    if (tenant instanceof HTMLElement) tenant.hidden = !isMicrosoft;
    if (tenantSelect instanceof HTMLSelectElement) {
      tenantSelect.disabled = true;
      if (isMicrosoft) tenantSelect.value = tenantDefaults[key] || tenantSelect.value;
    }
    if (tenantValue instanceof HTMLInputElement) {
      tenantValue.disabled = !isMicrosoft;
      if (isMicrosoft) tenantValue.value = tenantDefaults[key] || tenantValue.value;
    }

    showProviderHelp('[data-provider-general-help]', key);
    showProviderHelp('[data-provider-secrets-help]', key);

    // On a new record, switching provider invalidates any untested credential
    // values because Client ID and Client secret are provider-specific.
    if (previousProvider !== key && clientId instanceof HTMLInputElement && !clientId.readOnly) {
      clientId.value = '';
      if (clientSecret instanceof HTMLInputElement) clientSecret.value = '';
      if (credentialState instanceof HTMLInputElement) credentialState.value = 'required';
    }

    previousProvider = key;
    updateTestButton();
    notifyFormState();
  };

  const currentUrl = new URL(window.location.href);
  const requestedTab = currentUrl.searchParams.get('tab');
  if (requestedTab === 'secrets') {
    const secretsTab = document.getElementById('bo-secrets-tab');
    if (secretsTab) bootstrap.Tab.getOrCreateInstance(secretsTab).show();
  }
  // Credential-result query parameters are one-shot presentation state. The
  // server has already rendered the standard ManatOS message popup, so remove
  // the result marker without another navigation to avoid repeating it on F5.
  if (currentUrl.searchParams.has('credentialsTest')) {
    currentUrl.searchParams.delete('credentialsTest');
    window.history.replaceState({}, '', currentUrl.toString());
  }

  provider.addEventListener('change', apply);
  enabled?.addEventListener('change', () => { updateCredentialRequirements(); updateTestButton(); notifyFormState(); });
  apply();
})();

/* ==========================================================================
 * Generic SysBO Save-button state
 *
 * Every metadata-driven entity edit/create form uses the same rule:
 *
 *   Save enabled = form changed AND form currently valid
 *
 * Native HTML constraints (required/email/minlength/etc.) and entity-specific
 * custom constraints therefore participate without duplicating button logic in
 * each SysBO screen. Server/API validation remains authoritative.
 * ======================================================================== */
(() => {
  document.querySelectorAll('form[data-dirty-guard="true"]').forEach((form) => {
    const save = form.querySelector('[data-form-save]');

    if (!(save instanceof HTMLButtonElement)) {
      return;
    }

    const snapshot = () => new URLSearchParams(new FormData(form)).toString();
    const sharedState = window.manatosSysBOFormState || { baseline: snapshot(), snapshot };

    const update = () => {
      const pendingCredentialSave = form.querySelector('[data-provider-pending-credential-save]');
      const hasPendingCredentialSave = pendingCredentialSave instanceof HTMLInputElement && pendingCredentialSave.value === 'true';

      // Credential verification is deliberately not a prerequisite for
      // persistence. A complete pair may be stored encrypted with verification
      // state = No, while only verified pairs are exposed to sign-in/runtime.
      const credentialStateAllowsSave = true;

      const changed = hasPendingCredentialSave || (sharedState.baseline !== null && snapshot() !== sharedState.baseline);
      save.disabled = !(changed && form.checkValidity() && credentialStateAllowsSave);
    };

    form.addEventListener('input', update);
    form.addEventListener('change', update);

    // Keep state correct when another generic form helper changes values or
    // validity programmatically during initialisation.
    queueMicrotask(update);
  });
})();
