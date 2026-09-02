/**
 * External-auth provider compound UI component.
 *
 * This file owns provider-specific credential workflow behaviour while the
 * generic metadata renderer only resolves the component key. Provider-specific
 * behavior remains encapsulated here while page structure stays declarative.
 */
/** External-auth provider editor: provider defaults, credential lifecycle and help content. */
(() => {
  const form = document.querySelector('form[data-entity-key="sys-ext-auth-providers"]');
  if (!(form instanceof HTMLFormElement)) return;

  const provider = form.querySelector('#metadata-field-provider');
  const callback = form.querySelector('#metadata-field-callbackPath');
  const tenant = form.querySelector('[data-ctx-field-container="tenant"]');
  const tenantSelect = form.querySelector('#metadata-field-tenant');
  const providerIcon = form.querySelector('[data-provider-icon] i, [data-metadata-enum-toggle] [data-enum-selected-icon]');
  const enabled = form.querySelector('#metadata-field-enabled');
  const clientId = form?.querySelector('[data-provider-client-id]');
  const clientSecret = form?.querySelector('[data-provider-client-secret]');
  const secretEditor = form?.querySelector('[data-provider-secret-editor]');
  const secretDisplay = form?.querySelector('[data-provider-secret-display]');
  const changeCredentials = form?.querySelector('[data-provider-change-credentials]');
  const testCredentials = form?.querySelector('[data-provider-test-credentials]');
  const credentialState = form?.querySelector('[data-provider-credential-test-state]');
  const verificationIndicator = form?.querySelector('[data-provider-credentials-verified-indicator]');
  const credentialAction = form?.querySelector('[data-provider-credential-action]');
  const verificationProof = form?.querySelector('[data-provider-verification-proof]');
  const removeCredentials = form?.querySelector('[data-provider-remove-credentials]');

  if (!(provider instanceof HTMLSelectElement) || !(callback instanceof HTMLInputElement)) return;

  const definitionSource = form.querySelector('[data-external-provider-definitions]');
  let metadataDefinitions = [];
  try { metadataDefinitions = JSON.parse(definitionSource?.getAttribute('data-external-provider-definitions') || '[]'); } catch { metadataDefinitions = []; }

  const optionMetadata = (option) => {
    try {
      const parsed = JSON.parse(option.dataset.enumItem || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  const defaults = Object.fromEntries([
    ...[...provider.options].map((option) => [option.value, optionMetadata(option).callbackPath || option.dataset.callbackDefault || '']),
    ...metadataDefinitions.map((definition) => [definition.provider, definition.callbackPath || '']),
  ].filter(([, value]) => value));
  const providerIcons = Object.fromEntries([
    ...[...provider.options].map((option) => [option.value, optionMetadata(option).icon || option.dataset.providerIcon || '']),
    ...metadataDefinitions.map((definition) => [definition.provider, definition.icon || '']),
  ].filter(([, value]) => value));
  const tenantDefaults = Object.fromEntries([
    ...[...provider.options].map((option) => [option.value, optionMetadata(option).tenant || option.dataset.tenantDefault || '']),
    ...metadataDefinitions.map((definition) => [definition.provider, definition.tenant || '']),
  ].filter(([, value]) => value));
  const allowedProviders = new Set(metadataDefinitions.map((definition) => String(definition.provider || '')));
  const createMode = form.dataset.recordMode === 'create';
  const CREDENTIAL_TEST_POLL_MS = 750;
  const CREDENTIAL_TEST_SETTLE_POLL_MS = 250;
  const POPUP_CLOSE_SETTLEMENT_MS = 5000;

  // The API already filters provider definitions for a create page to the
  // providers that do not yet have a configuration record. Mirror that source
  // into the generic enum presentation instead of duplicating uniqueness rules
  // in the metadata renderer.
  if (createMode && allowedProviders.size) {
    [...provider.options].forEach((option) => {
      if (!option.value) return;
      option.disabled = !allowedProviders.has(option.value);
    });
    form.querySelectorAll('[data-enum-choice]').forEach((choice) => {
      if (!(choice instanceof HTMLElement)) return;
      const value = choice.dataset.enumChoice || '';
      if (!value) return;
      const allowed = allowedProviders.has(value);
      choice.hidden = !allowed;
      if (choice instanceof HTMLButtonElement) choice.disabled = !allowed;
    });
  }

  let previousProvider = provider.value;

  const notifyFormState = () => form?.dispatchEvent(new Event('change', { bubbles: true }));

  /** Toggle any keyed contextual panel without coupling this helper to its content type. */
  const showKeyedPanels = (selector, datasetKey, key) => {
    form.querySelectorAll(selector).forEach((panel) => {
      if (panel instanceof HTMLElement) panel.hidden = panel.dataset[datasetKey] !== key;
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

  const setVerificationIndicator = (verified) => {
    if (!(verificationIndicator instanceof HTMLElement)) return;
    const badge = verificationIndicator.querySelector('.badge');
    if (!(badge instanceof HTMLElement)) return;
    badge.classList.toggle('text-bg-success', verified);
    badge.classList.toggle('text-bg-secondary', !verified);
    badge.innerHTML = verified
      ? '<i class="bi bi-check-circle-fill me-1"></i>Yes'
      : '<i class="bi bi-x-circle me-1"></i>No';
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
    if (credentialAction instanceof HTMLInputElement) credentialAction.value = 'replace';
    if (verificationProof instanceof HTMLInputElement) verificationProof.value = '';
    setVerificationIndicator(false);
    updateTestButton();
    notifyFormState();
    clientId.focus();
  };

  changeCredentials?.addEventListener('click', beginCredentialChange);
  const invalidateProof = () => {
    if (credentialAction instanceof HTMLInputElement) credentialAction.value = 'replace';
    if (verificationProof instanceof HTMLInputElement) verificationProof.value = '';
    if (credentialState instanceof HTMLInputElement) credentialState.value = 'required';
    setVerificationIndicator(false);
    updateTestButton();
    notifyFormState();
  };
  clientId?.addEventListener('input', invalidateProof);
  clientSecret?.addEventListener('input', invalidateProof);

  removeCredentials?.addEventListener('click', () => {
    if (!(credentialAction instanceof HTMLInputElement)) return;
    credentialAction.value = 'remove';
    if (verificationProof instanceof HTMLInputElement) verificationProof.value = '';
    if (clientId instanceof HTMLInputElement) { clientId.value = ''; clientId.readOnly = false; clientId.required = false; }
    if (clientSecret instanceof HTMLInputElement) { clientSecret.value = ''; clientSecret.disabled = false; clientSecret.required = false; }
    if (enabled instanceof HTMLInputElement) { enabled.checked = false; enabled.dispatchEvent(new Event('change', { bubbles: true })); }
    if (secretEditor instanceof HTMLElement) secretEditor.hidden = false;
    if (secretDisplay instanceof HTMLElement) secretDisplay.hidden = true;
    if (changeCredentials instanceof HTMLElement) changeCredentials.hidden = true;
    if (testCredentials instanceof HTMLButtonElement) { testCredentials.hidden = false; testCredentials.disabled = true; }
    if (credentialState instanceof HTMLInputElement) credentialState.value = 'required';
    setVerificationIndicator(false);
    notifyFormState();
  });

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
    const providerLabel = () => provider.options[provider.selectedIndex]?.text || provider.value || 'Provider';
    const noReturnMessage = () => providerLabel() + ' did not return a credential-test result to ManatOS. Check the provider window for an error, confirm the provider application is active and available to this account, then retry. Your values were not changed.';
    const showFeedback = (message, success = false) => {
      if (!(feedback instanceof HTMLElement)) return;
      feedback.classList.remove('alert-danger', 'alert-success');
      feedback.classList.add(success ? 'alert-success' : 'alert-danger');
      feedback.textContent = message;
      feedback.hidden = false;
    };

    const testStoredPair = testCredentials.dataset.providerTestStored === 'true';
    if (!testStoredPair && (!clientId.value.trim() || !clientSecret.value.trim())) {
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
    body.set('provider', provider.value);
    if (testStoredPair) {
      body.set('useStoredCredentials', 'true');
    } else {
      body.set('clientId', clientId.value.trim());
      body.set('clientSecret', clientSecret.value);
    }
    if (enabled instanceof HTMLInputElement) body.set('enabled', enabled.checked ? 'true' : 'false');

    let pollTimer = null;
    let completed = false;
    let popupClosedAt = null;
    let providerReturnObserved = false;
    let providerReturnHandler = null;

    const finishWaiting = () => {
      completed = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      if (providerReturnHandler) window.removeEventListener('message', providerReturnHandler);
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
                setVerificationIndicator(true);
                if (credentialState instanceof HTMLInputElement) credentialState.value = 'verified';

                // The successful test is a non-persistent screen fact. The opaque
                // proof is submitted by the ordinary Save transaction; no page
                // reload and no datastore mutation occurs here.
                if (verificationProof instanceof HTMLInputElement) verificationProof.value = statusPayload.verificationProofId || payload.testId;
                if (credentialAction instanceof HTMLInputElement) credentialAction.value = 'replace';
                notifyFormState();
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
          // Popup lifetime is not the verification result. Some providers close
          // their OAuth window immediately before the callback/session result is
          // observable by this polling request. Keep polling for a short generic
          // settlement window before declaring that the provider returned no result.
          popupClosedAt ??= Date.now();
          const settlementElapsed = Date.now() - popupClosedAt;
          if (settlementElapsed >= POPUP_CLOSE_SETTLEMENT_MS) {
            finishWaiting();
            showFeedback(providerReturnObserved
              ? providerLabel() + ' returned from its authentication window, but ManatOS did not receive the final credential-test state in time. Retry the test; your values were not changed.'
              : noReturnMessage());
            updateTestButton();
            return;
          }

          pollTimer = window.setTimeout(pollStatus, CREDENTIAL_TEST_SETTLE_POLL_MS);
          return;
        }

        popupClosedAt = null;
        pollTimer = window.setTimeout(pollStatus, CREDENTIAL_TEST_POLL_MS);
      };

      // postMessage is only a wake-up hint. The same-session status endpoint
      // remains authoritative, but a provider callback can ask us to poll again
      // immediately instead of waiting for the next normal polling interval.
      providerReturnHandler = (event) => {
        if (event.origin !== window.location.origin) return;
        const result = event.data;
        if (!result || result.type !== 'manatos:provider-credential-test-result') return;
        providerReturnObserved = true;
        if (completed) return;
        if (pollTimer) window.clearTimeout(pollTimer);
        pollTimer = window.setTimeout(pollStatus, 0);
      };
      window.addEventListener('message', providerReturnHandler);

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

  const apply = () => {
    const key = provider.value;
    const nextCallback = defaults[key] || callback.value;
    if (callback.value !== nextCallback) {
      callback.value = nextCallback;
      callback.dispatchEvent(new Event('input', { bubbles: true }));
      callback.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const selectedDefinition = metadataDefinitions.find((definition) => definition.provider === key);
    const selectedOption = provider.options[provider.selectedIndex];
    const selectedMetadata = selectedOption ? optionMetadata(selectedOption) : {};
    const tenantDefault = selectedDefinition?.tenant ?? selectedMetadata.tenant ?? null;
    const hasTenant = tenantDefault !== null && tenantDefault !== undefined && tenantDefault !== '';

    if (providerIcon instanceof HTMLElement) providerIcon.className = `bi ${providerIcons[key] || 'bi-globe2'}`;
    if (tenant instanceof HTMLElement) tenant.hidden = !hasTenant;
    if (tenantSelect instanceof HTMLSelectElement || tenantSelect instanceof HTMLInputElement) {
      if (tenantSelect instanceof HTMLSelectElement) tenantSelect.disabled = true;
      if (hasTenant) {
        const nextTenant = String(tenantDefault || tenantDefaults[key] || tenantSelect.value);
        if (tenantSelect.value !== nextTenant) {
          tenantSelect.value = nextTenant;
          tenantSelect.dispatchEvent(new Event('input', { bubbles: true }));
          tenantSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    showKeyedPanels('[data-contextual-help-key]', 'contextualHelpKey', key);

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
    const secretsTab = document.getElementById('bo-secrets-tab') || document.getElementById('metadata-secrets-tab');
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

  if (createMode && !provider.value) {
    const firstAvailable = metadataDefinitions[0]?.provider
      || [...provider.options].find((option) => option.value && !option.disabled)?.value
      || '';
    if (firstAvailable) {
      provider.value = String(firstAvailable);
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      apply();
    }
  } else {
    apply();
  }
})();

