(() => {
  'use strict';

  const dock = document.getElementById('developerToolsDock');
  if (!dock || !window.bootstrap?.Tooltip) return;

  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  const linesFor = (tab) => {
    const propertyKey = tab.dataset.propertiesTab;
    if (propertyKey === 'main')
      return [
        'Main',
        'Summary of the selected CTX node: path, type, value and core node information.',
      ];
    if (propertyKey === 'properties')
      return ['Properties', 'The selected node’s own semantic properties and values.'];
    if (propertyKey === 'attributes')
      return [
        'Attributes',
        'CTX/runtime metadata attached to the selected node, separate from its semantic value.',
      ];
    if (propertyKey === 'subscribers')
      return [
        'Subscribers',
        'Runtime subscribers currently observing changes from the selected CTX node.',
      ];

    const toolKey = tab.dataset.developerToolTab;
    if (toolKey === 'ctx')
      return [
        'CTX Viewer',
        'Live ManatOS context tree.',
        'Inspect UI levels, semantic data, state, layout and runtime CTX relationships.',
      ];
    if (toolKey === 'apiTraffic')
      return [
        'API Traffic',
        'Captured UI → API calls for this UI process.',
        'Inspect request/response payloads and correlated API, CTX, storage and transaction diagnostics.',
      ];
    if (toolKey?.startsWith('ctxView:'))
      return [
        'CTX targeted view',
        `Dedicated live CTX subtree rooted at ${tab.dataset.debugTabHelpPath || 'the selected node'}.`,
        'Keeps that CTX root available while you inspect and navigate its descendants.',
      ];

    if (tab.id === 'apiTrafficRequestTab')
      return [
        'Request',
        'The selected UI → API request.',
        'Includes request metadata and the sanitized request payload captured by API Traffic.',
      ];
    if (tab.id === 'apiTrafficResponseTab')
      return [
        'Response',
        'The API result for the selected call.',
        'Includes status, duration, errors and the sanitized response payload.',
      ];

    const logName = tab.dataset.apiLogTab;
    if (logName === 'Transaction')
      return [
        'Transaction',
        'Complete transaction lifecycle correlated by transaction ID.',
        'Shows BEGIN, participating operations and the final COMMIT, ROLLBACK or expiry outcome.',
      ];
    if (logName === 'API CTX')
      return [
        'API CTX',
        'API-side CTX snapshot captured for this request after processing completes.',
      ];
    if (logName?.startsWith('Storage CTX'))
      return [
        logName,
        'Storage-subsystem CTX snapshot captured while this API request was processed.',
      ];
    if (logName)
      return [logName, 'Canonical server log entries correlated to this API request ID.'];
    return null;
  };

  const enhance = (tab) => {
    if (!(tab instanceof HTMLElement) || tab.dataset.debugTabTooltipReady === 'true') return;
    const lines = linesFor(tab);
    if (!lines) return;
    tab.dataset.debugTabTooltipReady = 'true';
    tab.removeAttribute('title');
    window.bootstrap.Tooltip.getOrCreateInstance(tab, {
      container: 'body',
      placement: 'bottom',
      trigger: 'hover focus',
      html: true,
      customClass: 'debug-tab-help-tooltip',
      delay: { show: 1400, hide: 100 },
      title: lines
        .map(
          (line, index) =>
            `<div${index === 0 ? ' class="debug-tab-help-title"' : ''}>${escapeHtml(line)}</div>`,
        )
        .join(''),
    });
  };

  const dispose = (tab) => {
    if (!(tab instanceof HTMLElement) || tab.dataset.debugTabTooltipReady !== 'true') return;
    window.bootstrap.Tooltip.getInstance(tab)?.dispose();
    delete tab.dataset.debugTabTooltipReady;
  };

  const disposeAll = (root = dock) => {
    if (root.matches?.('.developer-tools-tab, .ctx-debug-properties-tab, .api-traffic-details-tab'))
      dispose(root);
    root
      .querySelectorAll?.(
        '.developer-tools-tab, .ctx-debug-properties-tab, .api-traffic-details-tab',
      )
      .forEach(dispose);
  };

  const enhanceAll = (root = dock) => {
    if (root.matches?.('.developer-tools-tab, .ctx-debug-properties-tab, .api-traffic-details-tab'))
      enhance(root);
    root
      .querySelectorAll?.(
        '.developer-tools-tab, .ctx-debug-properties-tab, .api-traffic-details-tab',
      )
      .forEach(enhance);
  };

  enhanceAll();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLElement) disposeAll(node);
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhanceAll(node);
      }
    }
  });
  observer.observe(dock, { childList: true, subtree: true });

  window.addEventListener(
    'pagehide',
    () => {
      observer.disconnect();
      disposeAll();
    },
    { once: true },
  );
})();
