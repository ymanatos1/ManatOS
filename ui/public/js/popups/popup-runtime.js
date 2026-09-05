/**
 * Shared ManatOS popup lifecycle and live CTX contract.
 *
 * Bootstrap modal families and custom popup components should expose the same
 * conceptual runtime shape:
 *
 *   ctx.<leaf-page>.popup
 *     kind
 *     callingParams   // why/how this popup was invoked
 *     presentation    // resolved visible chrome
 *     state           // popup-owned mutable lifecycle state
 *
 * This module owns Bootstrap-modal concerns only: explicit dismissal policy,
 * workspace centering, focus return, Developer-Tools CTX inspection, and the
 * generic live popup CTX projection. Domain workflows stay in their callers.
 */
(() => {
  const workspace = document.querySelector('.workspace');
  const developerToolsDock = document.getElementById('developerToolsDock');
  const returnFocus = new WeakMap();
  const invocationByModal = new WeakMap();
  let activeModal = null;

  const ctxRuntime = () => window.ManatOS?.ctx;

  const parseJsonObject = (value) => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const leafPagePath = () => {
    const runtime = ctxRuntime();
    let node = runtime?.value?.page;
    if (!node) return null;
    let path = 'ctx.page';
    while (node?.page) {
      node = node.page;
      path += '.page';
    }
    return path;
  };

  const popupPath = () => `${leafPagePath() || 'ctx.page'}.popup`;

  const replaceContext = (payload, options = {}) => {
    const runtime = ctxRuntime();
    if (!runtime?.replace) return;
    const path = popupPath();
    runtime.replace(path, payload, {
      source: options.source || 'popup-runtime',
      action: options.action || 'popup-state',
      triggerPath: path,
    });
  };

  const clearContext = (options = {}) => {
    replaceContext(null, {
      source: options.source || 'popup-runtime',
      action: options.action || 'close-popup',
    });
  };

  const centerModalInWorkspace = (modal) => {
    if (!workspace || !(modal instanceof HTMLElement)) return;
    const rect = workspace.getBoundingClientRect();
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, window.innerWidth);
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);
    const centerX = visibleRight > visibleLeft
      ? visibleLeft + (visibleRight - visibleLeft) / 2
      : window.innerWidth / 2;
    const centerY = visibleBottom > visibleTop
      ? visibleTop + (visibleBottom - visibleTop) / 2
      : window.innerHeight / 2;

    modal.classList.add('workspace-centered-modal');
    modal.style.setProperty('--workspace-modal-center-x', `${centerX}px`);
    modal.style.setProperty('--workspace-modal-center-y', `${centerY}px`);
  };

  const refreshVisibleModalCenters = () => {
    document.querySelectorAll('.modal.show').forEach((modal) => centerModalInWorkspace(modal));
  };

  const popupTitle = (modal) =>
    String(modal.querySelector('.modal-title')?.textContent || '').replace(/\s+/g, ' ').trim();

  const resolveCallingParams = (modal, event) => {
    const trigger = event?.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    return Object.freeze({
      purpose: String(
        trigger?.dataset.popupPurpose
        || modal.dataset.popupPurpose
        || modal.id
        || 'popup',
      ),
      popupId: modal.id || null,
      triggerId: trigger?.id || null,
      ...parseJsonObject(modal.dataset.popupCallingParams),
      ...parseJsonObject(trigger?.dataset.popupCallingParams),
    });
  };

  /**
   * Build the canonical live popup payload. Custom popups (for example the
   * Record Selector) use this same builder so CTX consumers never need to
   * learn a different top-level popup contract for each implementation.
   * Domain-specific state may be added without changing the common envelope.
   */
  const createPayload = ({ kind = 'popup', callingParams = {}, presentation = {}, state = {}, ...domainState } = {}) => ({
    kind: String(kind || 'popup'),
    callingParams: { ...callingParams },
    presentation: { ...presentation },
    ...domainState,
    state: { ...state },
  });

  const popupPayload = (modal, callingParams, phase) => createPayload({
    kind: String(modal.dataset.popupKind || 'modal'),
    callingParams,
    presentation: {
      mode: String(callingParams.presentationMode || modal.dataset.popupPresentation || 'standard'),
      title: String(callingParams.title || popupTitle(modal)),
    },
    state: {
      phase,
      open: phase === 'opening' || phase === 'open',
    },
  });

  const syncModalContext = (modal, phase) => {
    const callingParams = invocationByModal.get(modal)
      || resolveCallingParams(modal, null);
    replaceContext(popupPayload(modal, callingParams, phase), {
      source: 'bootstrap-popup',
      action: `popup-${phase}`,
    });
  };

  /**
   * Raise/lower Developer Tools above the popup without changing shell state.
   *
   * Popup inspection is deliberately a z-order toggle, not a Developer Tools
   * show/hide action. The dock therefore keeps its normal shell geometry and
   * the CTX button can be pressed repeatedly to alternate between:
   *
   *   popup above Developer Tools  <->  Developer Tools above popup
   *
   * When raised, the requested CTX path is selected again so returning to the
   * inspection surface always restores the popup node the action represents.
   */
  const setInspectionVisible = (visible, options = {}) => {
    if (!developerToolsDock || developerToolsDock.classList.contains('d-none')) return false;

    const path = String(options.path || popupPath());
    const button = options.button instanceof HTMLButtonElement ? options.button : null;
    const raised = Boolean(visible);

    developerToolsDock.classList.toggle('is-popup-inspection', raised);
    button?.setAttribute('aria-pressed', String(raised));
    button?.classList.toggle('active', raised);

    if (raised) {
      window.ManatOS?.shell?.setDeveloperToolTab?.('ctx', false);
      window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', {
        detail: { path, expand: true, revealExpandedRange: true },
      }));
    }

    return raised;
  };

  const toggleInspection = (options = {}) =>
    setInspectionVisible(
      !developerToolsDock?.classList.contains('is-popup-inspection'),
      options,
    );

  const clearInspection = (button = null) => {
    if (!developerToolsDock) return;
    developerToolsDock.classList.remove('is-popup-inspection');
    if (button instanceof HTMLButtonElement) {
      button.setAttribute('aria-pressed', 'false');
      button.classList.remove('active');
    }
  };

  const ensurePopupCtxButton = (modal) => {
    if (!developerToolsDock || developerToolsDock.classList.contains('d-none')) return null;
    const header = modal.querySelector('.modal-header');
    if (!(header instanceof HTMLElement)) return null;

    let button = header.querySelector('[data-popup-ctx-inspect]');
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-secondary d-none';
      button.dataset.popupCtxInspect = '';
      button.innerHTML = '<i class="bi bi-bug me-1" aria-hidden="true"></i>CTX';
      const close = header.querySelector('.btn-close');
      if (close) header.insertBefore(button, close);
      else header.append(button);
    }

    button.setAttribute('aria-pressed', 'false');
    if (button.dataset.popupCtxBound !== 'true') {
      button.dataset.popupCtxBound = 'true';
      button.addEventListener('click', () => {
        toggleInspection({
          path: popupPath(),
          button,
        });
      });
    }

    button.classList.remove('d-none');
    return button;
  };

  document.querySelectorAll('.modal').forEach((modal) => {
    if (!(modal instanceof HTMLElement)) return;

    // Universal ManatOS popup policy: dismissal is always explicit.
    modal.dataset.bsBackdrop = 'static';
    modal.dataset.bsKeyboard = 'false';

    // Developer Tools can be deliberately exposed through the CTX action.
    modal.dataset.bsFocus = 'false';

    modal.addEventListener('show.bs.modal', (event) => {
      const trigger = event.relatedTarget instanceof HTMLElement
        ? event.relatedTarget
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (trigger && !modal.contains(trigger)) returnFocus.set(modal, trigger);
      else returnFocus.delete(modal);

      invocationByModal.set(modal, resolveCallingParams(modal, event));
      activeModal = modal;
      ensurePopupCtxButton(modal);
      centerModalInWorkspace(modal);
      syncModalContext(modal, 'opening');
    });

    modal.addEventListener('shown.bs.modal', () => {
      activeModal = modal;
      centerModalInWorkspace(modal);
      syncModalContext(modal, 'open');
    });

    modal.addEventListener('hide.bs.modal', () => {
      if (activeModal === modal) syncModalContext(modal, 'closing');

      // Bootstrap deactivates its focus handling during hide(). Move focus after
      // that synchronous step but before aria-hidden is applied by the fade.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !modal.contains(active)) return;

      queueMicrotask(() => {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement) || !modal.contains(focused)) return;
        const target = returnFocus.get(modal);
        if (target instanceof HTMLElement && target.isConnected) {
          target.focus({ preventScroll: true });
        } else {
          focused.blur();
        }
      });
    });

    modal.addEventListener('hidden.bs.modal', () => {
      const ctxButton = modal.querySelector('[data-popup-ctx-inspect]');
      clearInspection(ctxButton);
      ctxButton?.classList.add('d-none');

      const target = returnFocus.get(modal);
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus({ preventScroll: true });
      }
      returnFocus.delete(modal);
      invocationByModal.delete(modal);

      // During modal-to-modal transitions, the next popup may already own the
      // canonical popup CTX node. Never let the previous popup clear it.
      if (activeModal === modal) {
        activeModal = null;
        clearContext({ source: 'bootstrap-popup', action: 'close-popup' });
      }
    });
  });

  window.addEventListener('resize', refreshVisibleModalCenters);

  window.ManatOSPopupRuntime = Object.freeze({
    leafPagePath,
    popupPath,
    replaceContext,
    clearContext,
    createPayload,
    refreshVisibleModalCenters,
    setInspectionVisible,
    toggleInspection,
    clearInspection,
  });
})();
