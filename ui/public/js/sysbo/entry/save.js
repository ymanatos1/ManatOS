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
    let node = runtime?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  const formBody = (saveMode = null) => {
    const body = new URLSearchParams();
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === 'string') body.append(name, value);
    }
    if (saveMode) body.set('_saveMode', saveMode);
    return body;
  };

  const recoveryExcludedNames = new Set(['_csrf', '_saveMode', '_entryPopupToken']);

  const fieldSaveEntries = (key) =>
    [...formBody().entries()].filter(
      ([name]) =>
        !recoveryExcludedNames.has(name) &&
        (name === key || name === `pictureChange.${key}` || name === `picturesChange.${key}`),
    );

  const recoveryChanges = () => {
    const pagePath = leafPagePath();
    const page = pagePath ? runtime?.get?.(pagePath) : null;
    if (!page?.fields) return null;

    const fields = {};
    for (const [key, field] of Object.entries(page.fields)) {
      if (!field || typeof field !== 'object' || field.dirty !== true) continue;
      const component = window.ManatOS?.fieldRecovery?.captureField?.(form, key) ?? null;
      fields[key] = {
        value: field.value,
        saveEntries: fieldSaveEntries(key),
        ...(component ? { component } : {}),
      };
    }

    return Object.keys(fields).length ? { format: 'field-delta-v1', fields } : null;
  };

  const settleRecoveryUi = async () => {
    await Promise.resolve();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  };

  const canonicalFieldControl = (key) =>
    [...form.querySelectorAll('[data-ctx-field]')].find(
      (control) => control instanceof HTMLElement && control.dataset.ctxField === key,
    ) || null;

  const setCanonicalControlValue = (control, value) => {
    if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
      control.checked = Boolean(value);
      return;
    }
    if (!(
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ))
      return;
    control.value =
      control.dataset.ctxValueType === 'json' ? JSON.stringify(value ?? null) : String(value ?? '');
  };

  const applyRecoveryChanges = async (changes) => {
    if (
      !changes ||
      changes.format !== 'field-delta-v1' ||
      !changes.fields ||
      typeof changes.fields !== 'object'
    )
      return false;

    for (const [key, change] of Object.entries(changes.fields)) {
      if (!change || typeof change !== 'object') continue;

      const componentApplied = await window.ManatOS?.fieldRecovery?.applyField?.(form, key, change);
      if (componentApplied === true) continue;

      const control = canonicalFieldControl(key);
      if (!control) return false;
      setCanonicalControlValue(control, change.value);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }

    form.dispatchEvent(new Event('manatos:form-contributor-state', { bubbles: true }));
    await settleRecoveryUi();
    return verifyRecoveryChanges(changes);
  };

  const verifyRecoveryChanges = async (changes) => {
    if (
      !changes ||
      changes.format !== 'field-delta-v1' ||
      !changes.fields ||
      typeof changes.fields !== 'object'
    )
      return false;
    await settleRecoveryUi();
    const pagePath = leafPagePath();
    for (const [key, change] of Object.entries(changes.fields)) {
      const current = pagePath ? runtime?.get?.(`${pagePath}.fields.${key}.value`) : undefined;
      if (JSON.stringify(current) !== JSON.stringify(change?.value)) return false;
      const componentVerified = await window.ManatOS?.fieldRecovery?.verifyField?.(
        form,
        key,
        change,
      );
      if (componentVerified === false) return false;
    }
    return true;
  };

  const prepareGentleClose = async () => {
    const pagePath = leafPagePath();
    const page = pagePath ? runtime?.get?.(pagePath) : null;
    if (pagePath && page?.control?.kind === 'entry') {
      for (const [key, field] of Object.entries(page.fields || {})) {
        if (
          !field ||
          typeof field !== 'object' ||
          !Object.prototype.hasOwnProperty.call(field, 'value')
        )
          continue;
        runtime?.replace?.(`${pagePath}.fields.${key}.originalValue`, field.value, {
          source: 'workspace-recovery-gentle-close',
          triggerPath: `${pagePath}.fields.${key}.originalValue`,
        });
      }
      runtime?.replace?.(`${pagePath}.control.state.dirty`, false, {
        source: 'workspace-recovery-gentle-close',
        triggerPath: `${pagePath}.control.state.dirty`,
      });
    }
    form
      .querySelectorAll('[data-picture-change-payload], [data-pictures-change-payload]')
      .forEach((control) => {
        if (control instanceof HTMLInputElement) control.value = '';
      });
    form.dispatchEvent(new Event('manatos:form-contributor-state', { bubbles: true }));
    form.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    return true;
  };

  const currentEntryHasUnsavedChanges = () => {
    const pagePath = leafPagePath();
    return pagePath ? runtime?.get?.(`${pagePath}.control.state.dirty`) === true : false;
  };

  const mergePersistedCtx = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !runtime?.replace) return;
    const pagePath = leafPagePath();
    if (!pagePath) return;

    /*
     * The server response may contain API-safe observations in addition to
     * canonical entity fields. Only values with an existing canonical field
     * node are reconciled. Field originalValue is the sole baseline authority;
     * entry.original is its read-only getter mirror.
     */
    const persistedValues = Object.fromEntries(
      Object.entries(record).filter(([key]) => runtime.get?.(`${pagePath}.fields.${key}`) != null),
    );

    for (const [key, value] of Object.entries(persistedValues)) {
      const baselinePath = `${pagePath}.fields.${key}.originalValue`;
      runtime.replace(baselinePath, value, {
        source: 'save-reconcile',
        triggerPath: baselinePath,
      });
    }

    for (const [key, value] of Object.entries(persistedValues)) {
      const fieldPath = `${pagePath}.fields.${key}.value`;
      if (runtime.get?.(fieldPath) !== undefined) {
        // ctx-runtime normalizes this public replace through the canonical field
        // mutation owner; Save does not need a second specialized write route.
        runtime.replace(fieldPath, value, {
          source: 'save-reconcile',
          triggerPath: fieldPath,
        });
      }
    }
  };

  let saving = false;
  let saveSucceeded = false;

  window.ManatOS ||= {};

  const recoveryPath = leafPagePath();
  if (recoveryPath && window.ManatOS?.uiHost?.registerRecoveryAdapter) {
    window.ManatOS.uiHost.registerRecoveryAdapter(recoveryPath, {
      getUserChanges() {
        return currentEntryHasUnsavedChanges() ? recoveryChanges() : null;
      },
      applyUserChanges: applyRecoveryChanges,
      verifyUserChanges: verifyRecoveryChanges,
      prepareGentleClose,
    });
  }
  window.ManatOS.entryRecovery = Object.freeze({
    getUserChanges() {
      return currentEntryHasUnsavedChanges() ? recoveryChanges() : null;
    },
    applyUserChanges: applyRecoveryChanges,
    verifyUserChanges: verifyRecoveryChanges,
    prepareGentleClose,
  });

  form.addEventListener('submit', async (event) => {
    const submitter = event.submitter;
    const saveMode =
      submitter instanceof HTMLButtonElement && submitter.name === '_saveMode'
        ? submitter.value
        : null;
    if (!['stay', 'close'].includes(saveMode) || form.dataset.ownerEditing === 'true' || saving)
      return;

    event.preventDefault();
    if (!form.reportValidity()) return;

    saving = true;
    saveSucceeded = false;
    const saveControls = [
      ...form.querySelectorAll(
        '[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]',
      ),
    ].filter((control) => control instanceof HTMLButtonElement);
    saveControls.forEach((control) => {
      control.disabled = true;
    });

    try {
      /*
       * Match the native form submission encoding. Express parses urlencoded
       * bodies globally, while a raw FormData body would become multipart and
       * reach the CSRF middleware without req.body populated. Keep this generic
       * for every metadata-driven entry form and preserve repeated controls.
       */
      const body = formBody(saveMode);
      const send = async () => {
        const response = await fetch(form.action, {
          method: 'POST',
          body,
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'ManatOS-InPlace-Save',
            'X-ManatOS-Application-Command': '1',
          },
        });
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json() : null;
        return { response, payload };
      };

      let { response, payload } = await send();
      if (response.status === 401 && payload?.error?.code === 'UI_API_SESSION_EXPIRED') {
        const reauthenticated = await window.ManatOS?.reauthenticate?.();
        if (!reauthenticated) {
          throw new Error(
            'Session expired; sign in again to continue saving your unsaved changes.',
          );
        }
        ({ response, payload } = await send());
      }

      if (!response.ok || !payload?.success) {
        window.ManatOS?.errors?.fromResponse?.(response, payload, {
          retry: () => form.requestSubmit(submitter),
        });
        const code = payload?.error?.code || `HTTP_${response.status}`;
        const failure = new Error(
          `${code}: ${payload?.error?.message || 'Save could not be completed in place.'}`,
        );
        failure.manatosPresented = true;
        throw failure;
      }

      saveSucceeded = true;

      // Persistence has succeeded. Retire one-shot binary mutation commands
      // immediately, before any reconciliation/subscriber event can trigger
      // another save path. The authoritative record returned by the server is
      // then used to rebuild picture/pictures presentation and baselines.
      form
        .querySelectorAll('[data-picture-change-payload], [data-pictures-change-payload]')
        .forEach((control) => {
          if (control instanceof HTMLInputElement) control.value = '';
        });
      mergePersistedCtx(payload.data?.record);
      if (document.body.classList.contains('entry-popup-host')) {
        const token = form.querySelector('input[name="_entryPopupToken"]')?.value || '';
        if (token) {
          parent.postMessage(
            {
              type: 'manatos:entry-popup-saved',
              token,
              id: payload.data?.id ?? null,
              record: payload.data?.record ?? null,
              close: payload.data?.close === true,
            },
            window.location.origin,
          );
        }
      }
      form.dispatchEvent(
        new CustomEvent('manatos:form-saved', {
          bubbles: true,
          detail: payload.data || {},
        }),
      );

      if (payload.data?.close === true) {
        if (!document.body.classList.contains('entry-popup-host')) {
          location.assign(payload.data?.listUrl || `/bo/${form.dataset.entityKey || ''}`);
        }
        return;
      }

      if (payload.data?.created === true && payload.data?.entryUrl) {
        location.replace(payload.data.entryUrl);
      }
    } catch (error) {
      /*
       * Plain Save is an in-place operation by contract. Never fall back to a
       * full form submission here: doing so fires the dirty-page guard, loses
       * the active tab/scroll position, and can repeat an already-successful
       * mutation. Keep the current document intact and let the normal form state
       * remain dirty so the user can retry safely.
       */
      console.error('[ManatOS] In-place Save failed.', error);
      if (error?.manatosPresented !== true) {
        window.ManatOS?.errors?.present?.(
          {
            code: 'IN_PLACE_SAVE_FAILED',
            message: error instanceof Error ? error.message : String(error),
            userMessage:
              error instanceof Error ? error.message : 'Save could not be completed in place.',
            retryable: true,
          },
          { retry: () => form.requestSubmit(submitter) },
        );
      }
      form.dispatchEvent(
        new CustomEvent('manatos:form-save-failed', {
          bubbles: true,
          detail: { error },
        }),
      );
    } finally {
      saving = false;
      // Only failed saves need a synthetic change to re-evaluate Save enablement.
      // On success, manatos:form-saved has already promoted the new baseline and
      // cleared the draft. Emitting another change here can recreate that draft
      // during save-and-close navigation while the old page is still dirty.
      if (!saveSucceeded) form.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
})();
