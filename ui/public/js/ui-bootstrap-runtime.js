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
  let lastRevision = null;
  let timer = null;
  let retryDelay = INITIAL_RETRY_MS;
  let stopped = false;
  let failureStartedAt = null;
  let suspendedAfterFailure = false;
  let wakeAttemptInFlight = false;

  const emitCtxChange = (oldValue, newValue) => {
    const runtime = window.ManatOS?.ctx;

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

  const applyAlive = (alive) => {
    if (lastSerialized === null) return;
    const current = JSON.parse(lastSerialized);
    if (current?.server?.alive === alive) return;
    applyBootstrap({ ...current, server: { ...current.server, alive } });
  };

  window.addEventListener(CHANGE_EVENT, (event) => {
    if (event.detail?.path !== 'ctx.system.client.uiBootstrap') return;
    const show = event.detail?.newValue?.ui?.donationsShow === true;
    donateButton?.classList.toggle('d-none', !show);
  });

  const schedule = (delay) => {
    if (stopped) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void refresh(false, false);
    }, delay);
  };

  const fetchBootstrap = async () => {
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

    window.ManatOSConnectivity?.reportSuccess?.('ui-bootstrap');
    if (!response.ok) throw new Error(`UI bootstrap returned ${response.status}`);

    const revision = Number(response.headers.get('X-ManatOS-Bootstrap-Revision'));
    if (Number.isFinite(revision)) lastRevision = revision;
    applyBootstrap(await response.json());
  };

  const fetchHealth = async () => {
    let response;
    try {
      response = await fetch('/runtime/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
    } catch (error) {
      window.ManatOSConnectivity?.reportFailure?.('ui-health');
      throw error;
    }

    // Any HTTP response proves the same-origin UI process is reachable.
    window.ManatOSConnectivity?.reportSuccess?.('ui-health');
    if (!response.ok) throw new Error(`UI health returned ${response.status}`);

    const health = await response.json();
    applyAlive(health?.alive === true);

    const revision = Number(health?.bootstrapRevision);
    if (Number.isFinite(revision) && revision !== lastRevision) {
      await fetchBootstrap();
    }
  };

  const refresh = async (wakeOnly = false, fullBootstrap = false) => {
    if (stopped || (wakeOnly && wakeAttemptInFlight)) return;
    if (wakeOnly) wakeAttemptInFlight = true;

    if (document.hidden || navigator.onLine === false) {
      schedule(Math.min(MAX_RETRY_MS, Math.max(retryDelay, 10_000)));
      if (wakeOnly) wakeAttemptInFlight = false;
      return;
    }

    try {
      if (fullBootstrap || lastSerialized === null) await fetchBootstrap();
      else await fetchHealth();

      retryDelay = INITIAL_RETRY_MS;
      failureStartedAt = null;
      suspendedAfterFailure = false;
      schedule(SUCCESS_REFRESH_MS);
    } catch {
      if (wakeOnly) {
        window.clearTimeout(timer);
        timer = null;
        failureStartedAt = null;
        retryDelay = INITIAL_RETRY_MS;
        suspendedAfterFailure = true;
        return;
      }

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
      void refresh(true, false);
      return;
    }
    schedule(100);
  };

  const wakeFromUserActivity = () => {
    if (stopped || document.hidden || navigator.onLine === false || !suspendedAfterFailure) return;
    void refresh(true, false);
  };

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

  // One full bootstrap per loaded page. Routine browser probes are lightweight
  // same-origin health checks; the UI process independently monitors API /health.
  void refresh(false, true);
})();
