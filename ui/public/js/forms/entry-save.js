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
    while (node?.page) {
      node = node.page;
      path += '.page';
    }
    return path;
  };

  const mergePersistedCtx = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !runtime?.replace) return;
    const pagePath = leafPagePath();
    if (!pagePath) return;

    const current = runtime.get?.(`${pagePath}.entry`);
    const original = runtime.get?.(`${pagePath}.entryOriginal`);
    const mergedCurrent =
      current && typeof current === 'object' && !Array.isArray(current)
        ? { ...current, ...record }
        : { ...record };
    const mergedOriginal =
      original && typeof original === 'object' && !Array.isArray(original)
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
    const isStay =
      submitter instanceof HTMLButtonElement &&
      submitter.name === '_saveMode' &&
      submitter.value === 'stay';
    if (
      !isStay ||
      form.dataset.recordMode === 'create' ||
      form.dataset.ownerEditing === 'true' ||
      saving
    )
      return;

    event.preventDefault();
    if (!form.reportValidity()) return;

    saving = true;
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
      if (!response.ok || !payload?.success)
        throw new Error('Save could not be completed in place.');

      mergePersistedCtx(payload.data?.record);
      form.dispatchEvent(
        new CustomEvent('manatos:form-saved', {
          bubbles: true,
          detail: payload.data || {},
        }),
      );
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
