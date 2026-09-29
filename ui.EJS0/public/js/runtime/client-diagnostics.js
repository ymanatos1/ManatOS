/** Developer-only browser surface diagnostics for pages and popups. */
(() => {
  const enabled = () => window.ManatOSDeveloperDiagnostics === true;
  const startedAt = performance.now();
  const navigation = performance.getEntriesByType?.('navigation')?.[0] ?? null;
  const roundedMs = (value) => Math.max(0, Math.round(Number(value || 0) * 10) / 10);
  const csrf = () =>
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const send = (event) => {
    if (!enabled() || !event) return;
    const envelope = Object.freeze({
      at: new Date().toISOString(),
      url: `${location.pathname}${location.search}`,
      ...event,
    });
    void fetch('/bo/debug/ui-runtime/diagnostic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _csrf: csrf(), event: envelope }),
      keepalive: true,
    }).catch(() => {});
  };

  const describePopup = (element) => ({
    popupId: element?.id || null,
    popupClass: element?.className || null,
    title:
      element
        ?.querySelector?.('.modal-title, [data-entry-popup-title], .card-header strong')
        ?.textContent?.trim() || null,
  });

  // Every normal rendered page gets one readiness measurement. Navigation timing is
  // browser-owned; elapsedSinceDiagnosticsStart covers the remaining shell/runtime boot.
  window.addEventListener(
    'load',
    () =>
      requestAnimationFrame(() =>
        send({
          type: 'page-opening-measurement',
          elapsedSinceDiagnosticsStartMs: roundedMs(performance.now() - startedAt),
          navigationMs: navigation ? roundedMs(navigation.duration) : null,
          domContentLoadedMs: navigation ? roundedMs(navigation.domContentLoadedEventEnd) : null,
          resourceCount: performance.getEntriesByType?.('resource')?.length ?? null,
          entryPopupHost: document.body.classList.contains('entry-popup-host'),
        }),
      ),
    { once: true },
  );

  // Bootstrap/message/preferences/auth popups all use the modal lifecycle; one delegated
  // listener therefore covers present and future modal implementations without coupling
  // diagnostics to individual popup features.
  document.addEventListener('show.bs.modal', (event) => {
    const popup = event.target instanceof Element ? event.target : null;
    if (!popup) return;
    popup.dataset.manatosDiagnosticOpeningAt = String(performance.now());
  });
  document.addEventListener('shown.bs.modal', (event) => {
    const popup = event.target instanceof Element ? event.target : null;
    if (!popup) return;
    const openingAt = Number(popup.dataset.manatosDiagnosticOpeningAt || performance.now());
    requestAnimationFrame(() =>
      send({
        type: 'popup-opening-measurement',
        popupKind: 'bootstrap-modal',
        ...describePopup(popup),
        openToFirstVisibleContentMs: roundedMs(performance.now() - openingAt),
      }),
    );
  });

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.clientDiagnostics = Object.freeze({ send });
})();
