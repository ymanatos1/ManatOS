(() => {
  'use strict';

  /**
   * Browser-side transport watchdog.
   *
   * This is intentionally about transport availability only: an HTTP 4xx/5xx
   * proves that the ManatOS UI/API process answered and therefore must not be
   * treated as a disconnected system. Polling consumers report only rejected
   * fetches here. Three consecutive transport failures are enough to stop all
   * background probes and replace the workspace with a local error surface.
   * The page then stays quiet until the user explicitly reloads/navigates.
   */
  const FAILURE_THRESHOLD = 3;
  const UNAVAILABLE_EVENT = 'manatos:system-unavailable';
  const RETRY_EVENT = 'manatos:system-retry-requested';

  const state = {
    consecutiveFailures: 0,
    unavailable: false,
    lastFailureSource: null,
  };

  /**
   * Dismiss short-lived UI chrome before replacing the application workspace.
   * Persistent editors/popups are deliberately not part of this protocol: only
   * menus, dropdowns, tooltips and popovers that cannot remain meaningful once
   * the owning page has become unavailable are removed/hidden.
   */
  const dismissTransientUi = () => {
    window.dispatchEvent(new CustomEvent('manatos:dismiss-transient-ui'));

    const bootstrapApi = window.bootstrap;
    if (bootstrapApi?.Dropdown) {
      document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((toggle) => {
        bootstrapApi.Dropdown.getInstance(toggle)?.hide();
      });
    }
    if (bootstrapApi?.Tooltip) {
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((toggle) => {
        bootstrapApi.Tooltip.getInstance(toggle)?.hide();
      });
    }
    if (bootstrapApi?.Popover) {
      document.querySelectorAll('[data-bs-toggle="popover"]').forEach((toggle) => {
        bootstrapApi.Popover.getInstance(toggle)?.hide();
      });
    }

    // Custom components may portal transient chrome to <body>. Marking those
    // surfaces keeps connectivity cleanup generic and component-independent.
    document.querySelectorAll('[data-manatos-transient-ui]').forEach((surface) => surface.remove());
  };

  const localErrorPage = () => {
    const workspace = document.querySelector('#appShell .workspace');
    if (!(workspace instanceof HTMLElement)) return;

    document.title = 'System unavailable - ManatOS';
    workspace.innerHTML = `
      <div class="container-fluid py-4" data-system-unavailable-page role="alert" aria-live="assertive">
        <div class="card shadow-sm border-danger-subtle">
          <div class="card-body p-4 p-lg-5">
            <div class="d-flex align-items-start gap-3">
              <i class="bi bi-wifi-off fs-2 text-danger" aria-hidden="true"></i>
              <div>
                <h1 class="h4 mb-2">ManatOS system unavailable</h1>
                <p class="mb-2">The ManatOS service did not respond to three consecutive connection attempts.</p>
                <p class="text-secondary mb-0">Automatic polling has been stopped. Refresh this page or choose a navigation item to try again.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('detailsPanel')?.classList.add('d-none');
  };

  const enterUnavailable = () => {
    if (state.unavailable) return;
    state.unavailable = true;
    document.documentElement.dataset.manatosSystemUnavailable = 'true';
    dismissTransientUi();
    localErrorPage();
    window.dispatchEvent(new CustomEvent(UNAVAILABLE_EVENT, {
      detail: {
        consecutiveFailures: state.consecutiveFailures,
        source: state.lastFailureSource,
      },
    }));
  };

  const reportFailure = (source = 'unknown') => {
    if (state.unavailable) return;
    state.lastFailureSource = source;
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) enterUnavailable();
  };

  const reportSuccess = () => {
    if (state.unavailable) return;
    state.consecutiveFailures = 0;
    state.lastFailureSource = null;
  };

  const requestRetry = () => {
    if (!state.unavailable) return;
    window.dispatchEvent(new CustomEvent(RETRY_EVENT));
  };

  /*
   * Navigation is the explicit retry requested by the user. Do not prevent the
   * click: the navigation request itself is the fresh connectivity probe.
   * Pollers remain stopped while the current document unloads.
   */
  document.addEventListener('click', (event) => {
    if (!state.unavailable) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const navigation = target.closest('a[href]');
    if (!navigation) return;
    requestRetry();
  }, true);

  window.ManatOSConnectivity = Object.freeze({
    failureThreshold: FAILURE_THRESHOLD,
    get unavailable() { return state.unavailable; },
    reportFailure,
    reportSuccess,
    requestRetry,
  });
})();
