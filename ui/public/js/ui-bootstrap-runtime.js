(() => {
  'use strict';

  const CHANGE_EVENT = 'manatos:ctx-change';
  const BOOTSTRAP_EVENT = 'manatos:ui-bootstrap-loaded';
  const donateButton = document.getElementById('headerDonateButton');
  const SUCCESS_REFRESH_MS = 30_000;
  const INITIAL_RETRY_MS = 2_000;
  const MAX_RETRY_MS = 60_000;
  const MAX_FAILURE_TIME_MS = 60_000;

  let lastSerialized = null;
  let timer = null;
  let retryDelay = INITIAL_RETRY_MS;
  let stopped = false;
  let failureStartedAt = null;
  let suspendedAfterFailure = false;
  let wakeAttemptInFlight = false;

  const emitCtxChange = (oldValue, newValue) => {
    const runtime = window.ManatOS?.ctx;

    // When the generic CTX runtime is available, use its mutation API so all
    // subscribers receive one standard causal event envelope.
    if (runtime?.value?.system?.client && typeof runtime.set === 'function') {
      const hasBootstrap = Object.prototype.hasOwnProperty.call(runtime.value.system.client, 'uiBootstrap');
      runtime[hasBootstrap ? 'replace' : 'set'](
        'ctx.system.client.uiBootstrap',
        newValue,
        { source: 'ui-bootstrap' },
      );
      return;
    }

    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
      detail: {
        operation: oldValue === undefined ? 'set' : 'replace',
        path: 'ctx.system.client.uiBootstrap',
        oldValue,
        newValue,
        cause: { source: 'ui-bootstrap', triggerPath: 'ctx.system.client.uiBootstrap' },
      },
    }));
  };

  const applyBootstrap = (bootstrap) => {
    const serialized = JSON.stringify(bootstrap);
    if (serialized === lastSerialized) return;

    const oldValue = lastSerialized === null ? undefined : JSON.parse(lastSerialized);
    lastSerialized = serialized;
    emitCtxChange(oldValue, bootstrap);
    window.dispatchEvent(new CustomEvent(BOOTSTRAP_EVENT, { detail: bootstrap }));
  };

  // Donate is deliberately an event consumer, not a bootstrap fetch consumer.
  window.addEventListener(CHANGE_EVENT, (event) => {
    if (event.detail?.path !== 'ctx.system.client.uiBootstrap') return;
    const show = event.detail?.newValue?.ui?.donationsShow === true;
    donateButton?.classList.toggle('d-none', !show);
  });

  const schedule = (delay) => {
    if (stopped) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void refresh(false);
    }, delay);
  };

  const refresh = async (wakeOnly = false) => {
    if (stopped || (wakeOnly && wakeAttemptInFlight)) return;
    if (wakeOnly) wakeAttemptInFlight = true;

    // Do not create a stream of failed network requests while the page is
    // backgrounded/offline. Visibility/online listeners below resume promptly.
    if (document.hidden || navigator.onLine === false) {
      schedule(Math.min(MAX_RETRY_MS, Math.max(retryDelay, 10_000)));
      return;
    }

    try {
      let response;
      try {
        response = await fetch('/runtime/ui-bootstrap', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
        });
      } catch (error) {
        window.ManatOSConnectivity?.reportFailure?.('ui-bootstrap');
        throw error;
      }

      // Any HTTP response proves transport availability. Status-specific errors
      // remain this runtime's concern and do not trip the system outage guard.
      window.ManatOSConnectivity?.reportSuccess?.('ui-bootstrap');
      if (!response.ok) throw new Error(`UI bootstrap returned ${response.status}`);

      applyBootstrap(await response.json());
      retryDelay = INITIAL_RETRY_MS;
      failureStartedAt = null;
      suspendedAfterFailure = false;
      schedule(SUCCESS_REFRESH_MS);
    } catch {
      /*
       * A wake-up after the original 60-second failure episode is a single
       * probe, not a new minute-long retry storm. If that probe still cannot
       * reach the UI server, remain suspended until later user/environment
       * activity. Chrome may still show the one failed network request in
       * DevTools because it is a real transport failure; application code does
       * not add any console logging for it.
       */
      if (wakeOnly) {
        window.clearTimeout(timer);
        timer = null;
        failureStartedAt = null;
        retryDelay = INITIAL_RETRY_MS;
        suspendedAfterFailure = true;
        return;
      }

      // Retry only during the original bounded failure episode.
      const now = Date.now();
      failureStartedAt ??= now;
      if (now - failureStartedAt >= MAX_FAILURE_TIME_MS) {
        window.clearTimeout(timer);
        timer = null;
        suspendedAfterFailure = true;
        return;
      }

      const remaining = MAX_FAILURE_TIME_MS - (now - failureStartedAt);
      schedule(Math.min(retryDelay, remaining));
      retryDelay = Math.min(MAX_RETRY_MS, retryDelay * 2);
    } finally {
      if (wakeOnly) wakeAttemptInFlight = false;
    }
  };

  const resumeForEnvironment = () => {
    if (stopped || document.hidden || navigator.onLine === false) return;

    if (suspendedAfterFailure) {
      void refresh(true);
      return;
    }

    // Do not reset the current 60-second failure budget merely because the
    // tab became visible or the browser reported an online transition.
    schedule(100);
  };

  const wakeFromUserActivity = () => {
    if (stopped || document.hidden || navigator.onLine === false || !suspendedAfterFailure) return;
    void refresh(true);
  };

  // Visibility/online transitions may recover transport availability. Ordinary
  // user activity wakes polling only after the 60-second failure budget has
  // actually been exhausted; typing while retries are already in progress does
  // not keep extending that budget.
  document.addEventListener('visibilitychange', resumeForEnvironment);
  window.addEventListener('online', resumeForEnvironment);
  ['pointerdown', 'keydown', 'touchstart', 'focus'].forEach((eventName) => {
    window.addEventListener(eventName, wakeFromUserActivity, { passive: true });
  });
  window.addEventListener('manatos:system-unavailable', () => {
    stopped = true;
    window.clearTimeout(timer);
    timer = null;
  });

  window.addEventListener('pagehide', () => {
    stopped = true;
    window.clearTimeout(timer);
  }, { once: true });

  void refresh(false);
})();
