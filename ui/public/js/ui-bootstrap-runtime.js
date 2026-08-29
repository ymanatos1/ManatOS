(() => {
  'use strict';

  const CHANGE_EVENT = 'manatos:ctx-change';
  const BOOTSTRAP_EVENT = 'manatos:ui-bootstrap-loaded';
  const donateButton = document.getElementById('headerDonateButton');
  let lastSerialized = null;

  const emitCtxChange = (oldValue, newValue) => {
    const runtime = window.ManatOS?.ctx;

    // When the generic CTX runtime is available (development debugger today,
    // generic runtime extraction later), use its mutation API so all consumers
    // receive the standard causal event envelope.
    if (runtime?.value?.client && typeof runtime.set === 'function') {
      const hasBootstrap = Object.prototype.hasOwnProperty.call(runtime.value.client, 'uiBootstrap');
      runtime[hasBootstrap ? 'replace' : 'set'](
        'ctx.client.uiBootstrap',
        newValue,
        { source: 'ui-bootstrap' },
      );
      return;
    }

    // Production/non-debug pages must still participate in the same event
    // contract even before the CTX runtime is moved out of debugger code.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
      detail: {
        operation: oldValue === undefined ? 'set' : 'replace',
        path: 'ctx.client.uiBootstrap',
        oldValue,
        newValue,
        cause: { source: 'ui-bootstrap', triggerPath: 'ctx.client.uiBootstrap' },
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
  // This proves the CTX event path that future reactive controls can reuse.
  window.addEventListener(CHANGE_EVENT, (event) => {
    if (event.detail?.path !== 'ctx.client.uiBootstrap') return;
    const show = event.detail?.newValue?.ui?.donationsShow === true;
    donateButton?.classList.toggle('d-none', !show);
  });

  const refresh = async () => {
    try {
      const response = await fetch('/runtime/ui-bootstrap', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      applyBootstrap(await response.json());
    } catch {
      // The server bootstrap loop retries independently. A transient failure
      // here must not interfere with normal page operation.
    }
  };

  void refresh();
  const timer = window.setInterval(refresh, 2_000);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
})();
