/* ==========================================================================
 * Metadata-driven in-place Save
 *
 * Save actions use one in-place persistence pipeline so validation, baseline
 * reconciliation and dirty-state clearing happen before any optional Close.
 * Save-and-Close is Save followed by the canonical host continuation.
 * ======================================================================== */
(() => {
  'use strict';

  const surfaceRuntime = window.ManatOS?.entrySurfaces;
  if (!surfaceRuntime?.register) return;

  const install = (form) => {
    if (!(form instanceof HTMLFormElement)) return false;
    if (!form.matches('form.metadata-driven-record-form[data-dirty-guard="true"]')) return false;

    const runtime = window.ManatOS?.ctx;

    // A document may host several Entry surfaces. Save always targets the CTX
    // owner declared by this form; it must never rediscover a global/deepest entry.
    const leafPagePath = () => form.dataset.ctxScopePath || null;

    const formBody = (saveMode = null) => {
      const body = new URLSearchParams();
      for (const [name, value] of new FormData(form).entries()) {
        if (typeof value === 'string') body.append(name, value);
      }
      if (saveMode) body.set('_saveMode', saveMode);
      return body;
    };

    const recoveryExcludedNames = new Set(['_csrf', '_saveMode', '_entryToken']);

    const fieldSaveEntries = (key) =>
      [...formBody().entries()].filter(
        ([name]) =>
          !recoveryExcludedNames.has(name) &&
          (name === key || name === `pictureChange.${key}` || name === `picturesChange.${key}`),
      );

    const recoveryChanges = () => {
      const pagePath = leafPagePath();
      const page = pagePath ? runtime?.get?.(pagePath) : null;
      if (!page?.data?.fields) return null;

      const fields = {};
      for (const [key, field] of Object.entries(page.data.fields)) {
        if (!field || typeof field !== 'object' || field.dirty !== true) continue;
        const component = window.ManatOS?.fieldRecovery?.captureField?.(form, key) ?? null;
        fields[key] = {
          originalValue: page?.data?.entry?.original?.[key],
          value: field.value,
          saveEntries: fieldSaveEntries(key),
          ...(component ? { component } : {}),
        };
      }

      return Object.keys(fields).length
        ? {
            format: 'field-delta-v1',
            fields,
            runtimeResources: window.ManatOS?.pictureRuntime?.capturePendingResources?.(form) || {},
          }
        : null;
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
        control.dataset.ctxValueType === 'json'
          ? JSON.stringify(value ?? null)
          : String(value ?? '');
    };

    const applyRecoveryChanges = async (changes) => {
      if (
        !changes ||
        changes.format !== 'field-delta-v1' ||
        !changes.fields ||
        typeof changes.fields !== 'object'
      )
        return false;

      const pagePath = leafPagePath();
      const recoveredResources =
        changes.runtimeResources &&
        typeof changes.runtimeResources === 'object' &&
        !Array.isArray(changes.runtimeResources)
          ? changes.runtimeResources
          : {};
      for (const [key, value] of Object.entries(recoveredResources)) {
        if (
          !pagePath ||
          window.ManatOS?.setUiRuntimeResourceForPath?.(pagePath, key, value) !== true
        )
          return false;
      }

      for (const [key, change] of Object.entries(changes.fields)) {
        if (!change || typeof change !== 'object') continue;

        const componentApplied = await window.ManatOS?.fieldRecovery?.applyField?.(
          form,
          key,
          change,
        );
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
        const current = pagePath
          ? runtime?.get?.(`${pagePath}.data.fields.${key}.value`)
          : undefined;
        const compare = window.ManatOS?.semanticEqual;
        if (typeof compare !== 'function') {
          throw new Error('Canonical semantic equality runtime is unavailable.');
        }
        if (!compare(current, change?.value)) return false;
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
        for (const [key, field] of Object.entries(page.data.fields || {})) {
          if (
            !field ||
            typeof field !== 'object' ||
            !Object.prototype.hasOwnProperty.call(field, 'value')
          )
            continue;
          runtime?.replace?.(`${pagePath}.data.fields.${key}.originalValue`, field.value, {
            source: 'workspace-recovery-gentle-close',
            triggerPath: `${pagePath}.data.fields.${key}.originalValue`,
          });
        }
        runtime?.replace?.(`${pagePath}.state.dirty`, false, {
          source: 'workspace-recovery-gentle-close',
          triggerPath: `${pagePath}.state.dirty`,
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
      return pagePath ? runtime?.get?.(`${pagePath}.state.dirty`) === true : false;
    };

    const canonicalCloseTrigger = () => {
      const trigger = form.querySelector('[data-form-close-cancel]');
      return trigger instanceof HTMLElement ? trigger : null;
    };

    const requestCanonicalClose = async (continuation = null) => {
      const trigger = canonicalCloseTrigger();
      const pagePath = leafPagePath();
      if (!(trigger instanceof HTMLElement) || !pagePath)
        throw new Error('Canonical Entry close trigger is unavailable.');
      const closure = window.ManatOS?.surfaceClosure;
      if (typeof continuation === 'function') {
        if (typeof closure?.requestWithContinuation !== 'function')
          throw new Error('Canonical Entry close continuation runtime is unavailable.');
        return closure.requestWithContinuation(trigger, continuation, pagePath);
      }
      if (typeof closure?.requestTrigger !== 'function')
        throw new Error('Canonical Entry close runtime is unavailable.');
      return closure.requestTrigger(trigger, pagePath);
    };

    const saveUserChanges = async () => {
      const save = form.querySelector('[data-form-save-option][value="stay"]');
      if (!(save instanceof HTMLButtonElement) || save.disabled || !form.reportValidity())
        return false;

      return new Promise((resolve) => {
        const cleanup = () => {
          form.removeEventListener('manatos:form-saved', saved);
          form.removeEventListener('manatos:form-save-failed', failed);
        };
        const saved = () => {
          cleanup();
          resolve(true);
        };
        const failed = () => {
          cleanup();
          resolve(false);
        };
        form.addEventListener('manatos:form-saved', saved, { once: true });
        form.addEventListener('manatos:form-save-failed', failed, { once: true });
        form.requestSubmit(save);
      });
    };

    const updateOwnerState = (values) => {
      if (!values || typeof values !== 'object') return;
      for (const [name, value] of Object.entries(values)) {
        const input = form.elements.namedItem(name);
        if (!(input instanceof HTMLInputElement) || value === undefined) continue;
        input.value =
          typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
      }
    };

    const returnToOwner = (returnUrl) => {
      if (!returnUrl) throw new Error('Owned Entry return URL is unavailable.');
      const continuation = document.createElement('form');
      continuation.method = 'post';
      continuation.action = returnUrl;
      continuation.hidden = true;
      // This navigation carries the already-accepted owner transaction back to its
      // owning page. The caller reaches here only after the child baseline was
      // reconciled and verified clean, so authorizing the document transition does
      // not suppress or abandon child edits.
      continuation.dataset.allowDirtyPageExit = 'true';
      const names = new Set(['_csrf', 'id']);
      for (const element of form.elements) {
        if (!(element instanceof HTMLInputElement)) continue;
        if (!names.has(element.name) && !element.name.startsWith('_owner')) continue;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = element.name;
        input.value = element.value;
        continuation.append(input);
      }
      document.body.append(continuation);
      continuation.requestSubmit();
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
        saveUserChanges,
        prepareGentleClose,
      });
    }
    const recoveryAdapter = Object.freeze({
      getUserChanges() {
        return currentEntryHasUnsavedChanges() ? recoveryChanges() : null;
      },
      applyUserChanges: applyRecoveryChanges,
      verifyUserChanges: verifyRecoveryChanges,
      saveUserChanges,
      isDirty: currentEntryHasUnsavedChanges,
      prepareGentleClose,
    });
    surfaceRuntime.registerRecoveryAdapter?.(form, recoveryAdapter);
    // Transitional single-entry compatibility. Popup/direct hosts resolve the
    // adapter from the owning form through entrySurfaces instead of this alias.
    window.ManatOS.entryRecovery = recoveryAdapter;

    form.addEventListener('submit', async (event) => {
      const submitter = event.submitter;
      const saveMode =
        submitter instanceof HTMLButtonElement && submitter.name === '_saveMode'
          ? submitter.value
          : null;
      if (!['stay', 'close'].includes(saveMode) || saving) return;

      const activePath = leafPagePath();
      const popupHost = form.querySelector('input[name="_entryHost"]')?.value === 'popup';

      event.preventDefault();
      if (!form.reportValidity()) return;

      saving = true;
      form.dataset.operationPending = 'true';
      const saveSurfacePath = window.ManatOS?.uiHost?.surfacePath?.('entry') || null;
      const releaseUserInputBlock = window.ManatOS?.uiHost?.setUserInputBlocked?.(
        saveSurfacePath,
        'entry-save',
        true,
      );
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
        if (!activePath || typeof window.ManatOS?.saveEntrySurfaceForPath !== 'function') {
          throw new Error('Canonical typed Entry Save runtime is unavailable.');
        }

        const repositorySave = async () => {
          const send = async () => {
            const body = formBody(saveMode);
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
            const reauthenticated = await window.ManatOS?.reauthenticate?.({
              reason: 'session-expired',
              operation: 'save',
            });
            if (!reauthenticated)
              throw Object.assign(new Error('Save cancelled.'), { manatosCancelled: true });
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
          return { status: 'persisted', record: payload.data?.record, data: payload };
        };

        const typedResult = await window.ManatOS.saveEntrySurfaceForPath(
          activePath,
          repositorySave,
        );
        if (typedResult?.status === 'invalid') return;

        const returnedToOwner = typedResult?.persistenceKind === 'return-to-caller';
        const ownerState = returnedToOwner
          ? (window.ManatOS?.ownerContinuationFormStateForPath?.(activePath) ?? null)
          : null;
        const ownerResult = returnedToOwner ? (typedResult?.persistence?.data ?? null) : null;
        const repositoryPayload = !returnedToOwner ? typedResult?.persistence?.data : null;
        const currentRecord = runtime?.get?.(`${activePath}.data.entry.current`) ?? null;
        const recordId =
          currentRecord && typeof currentRecord === 'object'
            ? (currentRecord.id ?? form.elements.namedItem('id')?.value ?? null)
            : (form.elements.namedItem('id')?.value ?? null);
        const localCompletion = {
          success: true,
          data: {
            id: recordId,
            record: currentRecord,
            ...(returnedToOwner ? { ownerResult, ownerState } : {}),
            ownerReturnUrl:
              returnedToOwner && !popupHost
                ? form.action.replace(/\/owned\/save(?:\?.*)?$/, '/owned/return')
                : null,
            close: saveMode === 'close',
          },
        };
        const payload =
          returnedToOwner || typedResult?.status === 'unchanged'
            ? localCompletion
            : repositoryPayload;
        if (!payload?.success)
          throw new Error('Canonical Entry Save returned no persistence result.');
        if (ownerState) updateOwnerState(ownerState);
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
        const popupToken = form.querySelector('input[name="_entryToken"]')?.value || '';
        if (popupHost && popupToken) {
          window.dispatchEvent(
            new CustomEvent('manatos:entry-popup-saved', {
              detail: {
                token: popupToken,
                id: payload.data?.id ?? null,
                record: payload.data?.record ?? null,
                close: payload.data?.close === true,
                entityKey: form.dataset.entityKey || null,
                representation: payload.data?.representation ?? null,
                // A live Owner has already accepted local owned persistence. Do not
                // expose the same semantic contribution for a second application.
                ownerResult: payload.data?.ownerResult ?? null,
                ownerAccepted: returnedToOwner,
              },
            }),
          );
        }
        form.dispatchEvent(
          new CustomEvent('manatos:form-saved', {
            bubbles: true,
            detail: payload.data || {},
          }),
        );

        if (payload.data?.close === true) {
          if (!popupHost) {
            const continuation = returnedToOwner
              ? () => returnToOwner(payload.data?.ownerReturnUrl)
              : null;
            await requestCanonicalClose(continuation);
          }
          // Popup presentation receives manatos:entry-popup-saved above and
          // requests the same canonical closure lifecycle from its own host.
          return;
        }

        if (!popupHost && payload.data?.created === true && payload.data?.entryUrl) {
          const entryUrl = payload.data.entryUrl;
          await requestCanonicalClose(() => location.replace(entryUrl));
        }
      } catch (error) {
        if (error?.manatosCancelled === true) return;
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
        delete form.dataset.operationPending;
        releaseUserInputBlock?.();
        // Only failed saves need a synthetic change to re-evaluate Save enablement.
        // On success, manatos:form-saved has already promoted the new baseline and
        // cleared the draft. Emitting another change here can recreate that draft
        // during save-and-close navigation while the old page is still dirty.
        if (!saveSucceeded) form.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    return true;
  };

  surfaceRuntime.register('entry-save', install);
})();
