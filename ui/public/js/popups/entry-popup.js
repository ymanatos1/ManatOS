/**
 * Generic hosted metadata-entry popup.
 *
 * The popup does not render fields. It hosts the ordinary metadata-driven entry
 * route in an iframe and exchanges only invocation/result envelopes with the
 * caller, so full-page and popup entries share one renderer and one save path.
 */
(() => {
  const open = ({
    url,
    token,
    title = 'Entry',
    callingParams = {},
    onSaved = null,
    onClose = null,
  } = {}) => {
    if (!url || !token) return null;
    document.querySelector('[data-entry-popup-backdrop]')?.remove();

    const runtime = window.ManatOS?.ctx;
    const selector = window.ManatOSRecordSelector;
    const pagePath = selector?.leafPagePath?.();
    const popupPath = pagePath ? `${pagePath}.popup` : null;
    if (runtime?.replace && popupPath) {
      runtime.replace(
        popupPath,
        {
          kind: 'entry-popup',
          callingParams: {
            purpose: callingParams.purpose ?? null,
            presentationMode: callingParams.presentationMode ?? 'entry',
            entityKey: callingParams.entityKey ?? null,
            selectionMode: callingParams.selectionMode ?? 'single',
            sourceEntityKey: callingParams.sourceEntityKey ?? null,
            sourceRecordId: callingParams.sourceRecordId ?? null,
            targetField: callingParams.targetField ?? null,
            targetFieldLabel: callingParams.targetFieldLabel ?? null,
            targetEntityLabel: callingParams.targetEntityLabel ?? null,
            sourceEntityLabel: callingParams.sourceEntityLabel ?? null,
            sourceRecordName: callingParams.sourceRecordName ?? null,
            queryPredicate: callingParams.queryPredicate ?? null,
            allowClear: callingParams.allowClear ?? false,
            mode: callingParams.mode ?? null,
            defaults: callingParams.defaults ?? {},
            uiOverrides: callingParams.uiOverrides ?? {},
          },
          presentation: { mode: callingParams.presentationMode ?? 'entry', title },
          state: { phase: 'open', open: true, dirty: false, valid: true },
        },
        { source: 'entry-popup', action: 'open-entry-popup', triggerPath: popupPath },
      );
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop';
    backdrop.dataset.entryPopupBackdrop = '';
    backdrop.innerHTML = `
      <div class="card shadow-lg metadata-entry-popup" role="dialog" aria-modal="true">
        <div class="card-header d-flex align-items-center justify-content-between gap-3">
          <strong data-entry-popup-title></strong>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-entry-popup-ctx aria-pressed="false"><i class="bi bi-bug me-1" aria-hidden="true"></i>CTX</button>
            <button type="button" class="btn-close" aria-label="Close" data-entry-popup-close></button>
          </div>
        </div>
        <div class="card-body p-0"><iframe title="${String(title).replaceAll('"', '&quot;')}" data-entry-popup-frame></iframe></div>
      </div>`;
    const titleNode = backdrop.querySelector('[data-entry-popup-title]');
    if (titleNode) titleNode.textContent = title;
    const frame = backdrop.querySelector('[data-entry-popup-frame]');
    if (!(frame instanceof HTMLIFrameElement)) return null;
    frame.src = url;
    const ctxButton = backdrop.querySelector('[data-entry-popup-ctx]');
    if (
      !document.getElementById('developerToolsDock') ||
      document.getElementById('developerToolsDock')?.classList.contains('d-none')
    ) {
      ctxButton?.classList.add('d-none');
    } else {
      ctxButton?.addEventListener('click', () => {
        const raised = window.ManatOSPopupRuntime?.toggleInspection?.({
          path: popupPath,
          button: ctxButton,
        });
        ctxButton?.setAttribute('aria-pressed', String(Boolean(raised)));
      });
    }

    const close = () => {
      window.removeEventListener('message', handleMessage);
      if (runtime?.replace && popupPath)
        runtime.replace(popupPath, null, {
          source: 'entry-popup',
          action: 'close-entry-popup',
          triggerPath: popupPath,
        });
      window.ManatOSPopupRuntime?.clearInspection?.(ctxButton);
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    };
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.token !== token) return;
      if (data.type === 'manatos:entry-popup-saved') {
        if (typeof onSaved === 'function') onSaved(data);
        close();
      } else if (data.type === 'manatos:entry-popup-cancel') {
        close();
      }
    };
    window.addEventListener('message', handleMessage);
    backdrop.querySelector('[data-entry-popup-close]')?.addEventListener('click', close);
    document.body.append(backdrop);
    return { close };
  };

  if (document.body.classList.contains('entry-popup-host')) {
    document.addEventListener('click', (event) => {
      const target =
        event.target instanceof Element ? event.target.closest('[data-form-close-cancel]') : null;
      if (!target) return;
      const token = document.querySelector('input[name="_entryPopupToken"]')?.value || '';
      if (!token) return;
      event.preventDefault();
      parent.postMessage({ type: 'manatos:entry-popup-cancel', token }, window.location.origin);
    });
  }

  window.ManatOSEntryPopup = Object.freeze({ open });
})();
