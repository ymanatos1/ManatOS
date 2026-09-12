(() => {
  /* =======================================================================
   * Global busy/remote-operation overlay
   *
   * Any link can opt in with data-busy. Any form can opt in with
   * data-busy-submit. The same API is intentionally reusable by future
   * fetch/API operations: window.ManatOS.busy.show({...}) / hide().
   * ===================================================================== */

  const busyOverlay = document.getElementById('manatosBusyOverlay');
  const busyBackground = document.querySelector('.site-frame');
  const busyTitle = document.getElementById('manatosBusyTitle');
  const busyMessage = document.getElementById('manatosBusyMessage');
  const busyIcon = document.getElementById('manatosBusyIcon');
  const busyActionWrap = document.getElementById('manatosBusyActionWrap');
  const busyAction = document.getElementById('manatosBusyAction');
  const nativeFetch = window.fetch.bind(window);
  const activityCounts = new Map();
  const REQUEST_SHOW_DELAY_MS = 180;
  const REQUEST_TIMEOUT_MS = 45_000;
  let requestShowTimer = null;
  let actionHandler = null;
  let manualBusyDepth = 0;

  const renderBusy = ({
    title = 'Please wait…',
    message = 'ManatOS is completing the requested operation.',
    icon = 'bi-arrow-repeat',
    actionLabel,
    onAction,
  } = {}) => {
    if (!busyOverlay) return;

    if (busyTitle) busyTitle.textContent = title;
    if (busyMessage) busyMessage.textContent = message;
    if (busyIcon) busyIcon.className = `bi ${icon}`;

    actionHandler = typeof onAction === 'function' ? onAction : null;
    if (busyActionWrap) busyActionWrap.hidden = !actionHandler;
    if (busyAction) busyAction.textContent = actionLabel || 'Cancel';

    busyOverlay.classList.add('is-visible');
    busyOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('manatos-busy');
    busyBackground?.setAttribute('inert', '');
  };

  const clearBusyPresentation = () => {
    busyOverlay?.classList.remove('is-visible');
    busyOverlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('manatos-busy');
    busyBackground?.removeAttribute('inert');
    actionHandler = null;
    if (busyActionWrap) busyActionWrap.hidden = true;
  };

  const requestActive = () => (activityCounts.get('request') || 0) > 0 || manualBusyDepth > 0;
  const synchronizeRequestPresentation = () => {
    if (requestActive()) return;
    if (requestShowTimer !== null) window.clearTimeout(requestShowTimer);
    requestShowTimer = null;
    clearBusyPresentation();
  };

  const beginActivity = (channel = 'request', options = {}) => {
    const normalizedChannel = String(channel || 'request');
    activityCounts.set(normalizedChannel, (activityCounts.get(normalizedChannel) || 0) + 1);

    if (
      normalizedChannel === 'request' &&
      requestShowTimer === null &&
      !busyOverlay?.classList.contains('is-visible')
    ) {
      requestShowTimer = window.setTimeout(() => {
        requestShowTimer = null;
        if (requestActive()) renderBusy(options);
      }, REQUEST_SHOW_DELAY_MS);
    }

    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      activityCounts.set(
        normalizedChannel,
        Math.max(0, (activityCounts.get(normalizedChannel) || 0) - 1),
      );
      if (normalizedChannel === 'request') synchronizeRequestPresentation();
    };
  };

  const showBusy = (options = {}) => {
    manualBusyDepth += 1;
    renderBusy(options);
  };

  const hideBusy = () => {
    manualBusyDepth = Math.max(0, manualBusyDepth - 1);
    synchronizeRequestPresentation();
  };

  const requestFetch = async (input, init = {}) => {
    const { manatosBusy = true, manatosTimeoutMs = REQUEST_TIMEOUT_MS, ...fetchInit } = init || {};
    if (manatosBusy === false) return nativeFetch(input, fetchInit);

    const endActivity = beginActivity('request');
    const timeoutMs = Number(manatosTimeoutMs);
    const timeoutController =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? new AbortController() : null;
    let timeoutId = null;

    if (timeoutController) {
      timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
      if (fetchInit.signal) {
        if (typeof AbortSignal.any === 'function') {
          fetchInit.signal = AbortSignal.any([fetchInit.signal, timeoutController.signal]);
        } else {
          fetchInit.signal.addEventListener('abort', () => timeoutController.abort(), {
            once: true,
          });
          fetchInit.signal = timeoutController.signal;
        }
      } else {
        fetchInit.signal = timeoutController.signal;
      }
    }

    try {
      return await nativeFetch(input, fetchInit);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      endActivity();
    }
  };

  busyAction?.addEventListener('click', () => actionHandler?.());

  window.fetch = requestFetch;
  window.ManatOS = window.ManatOS || {};
  window.ManatOS.activity = Object.freeze({
    begin: beginActivity,
    count: (channel = 'request') => activityCounts.get(String(channel)) || 0,
  });
  window.ManatOS.busy = Object.freeze({ show: showBusy, hide: hideBusy });

  // Delegate link handling so provider buttons and other remote-operation
  // links inserted after page load receive the same busy-state behavior.
  document.addEventListener('click', (event) => {
    const target = event.target;
    const link = target instanceof Element ? target.closest('a[data-busy]') : null;

    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      link.getAttribute('aria-disabled') === 'true'
    ) {
      return;
    }

    const href = link.href;

    if (!href) {
      return;
    }

    event.preventDefault();

    showBusy({
      title: link.dataset.busyTitle,
      message: link.dataset.busyMessage,
      icon: link.dataset.busyIcon,
    });

    // Give the browser one paint opportunity so the user sees the locked
    // transition state before navigation leaves ManatOS for the provider.
    window.setTimeout(() => {
      location.assign(href);
    }, 90);
  });

  document.querySelectorAll('form[data-busy-submit]').forEach((busyForm) => {
    busyForm.addEventListener('submit', (event) => {
      if (event.defaultPrevented || !busyForm.checkValidity()) {
        return;
      }

      showBusy({
        title: busyForm.dataset.busyTitle,
        message: busyForm.dataset.busyMessage,
        icon: busyForm.dataset.busyIcon,
      });
    });
  });

  /* =======================================================================
   * Bootstrap modal initialization
   * ===================================================================== */

  document.querySelectorAll('.modal[data-auto-show="true"]').forEach((element) => {
    bootstrap.Modal.getOrCreateInstance(element).show();
  });
})();
