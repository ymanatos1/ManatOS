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
   * Before teardown, persistent per-user recovery captures the normal UI-open
   * descriptors and recoverable user changes. Retry first terminates any surviving\n   * server session, then reloads the normal Sign-in flow; recovery is offered only\n   * after the newly authenticated user identity is known.
   */
  const FAILURE_THRESHOLD = 3;
  const UNAVAILABLE_EVENT = 'manatos:system-unavailable';
  const RETRY_EVENT = 'manatos:system-retry-requested';

  const state = {
    consecutiveFailures: 0,
    unavailable: false,
    lastFailureSource: null,
    failureBusyVisible: false,
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

  const localErrorPage = (recoveryCaptured) => {
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
                <p class="text-secondary mb-3">${
                  recoveryCaptured
                    ? 'Your recoverable workspace state was saved for your account and automatic polling has been stopped.'
                    : 'No unsaved user-input state required recovery; automatic polling has been stopped.'
                }</p>
                <div class="d-flex align-items-center gap-3">
                  <button type="button" class="btn btn-primary" data-system-retry>Retry</button>
                  <span class="small text-secondary" data-system-retry-status></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('detailsPanel')?.classList.add('d-none');
  };

  const enterUnavailable = async () => {
    if (state.unavailable) return;
    state.unavailable = true;
    if (state.failureBusyVisible) {
      window.ManatOS?.busy?.hide?.();
      state.failureBusyVisible = false;
    }
    document.documentElement.dataset.manatosSystemUnavailable = 'true';
    const recoverySnapshot = await window.ManatOS?.workspaceRecovery?.markUnavailableAndDispose?.();
    dismissTransientUi();
    localErrorPage(Boolean(recoverySnapshot));
    window.dispatchEvent(
      new CustomEvent(UNAVAILABLE_EVENT, {
        detail: {
          consecutiveFailures: state.consecutiveFailures,
          source: state.lastFailureSource,
        },
      }),
    );
  };

  const reportFailure = (source = 'unknown') => {
    if (state.unavailable) return;
    state.lastFailureSource = source;
    state.consecutiveFailures += 1;
    if (!state.failureBusyVisible) {
      window.ManatOS?.busy?.show?.({
        title: 'Reconnecting…',
        message: 'ManatOS is checking the connection before declaring the system unavailable.',
        icon: 'bi-arrow-repeat',
      });
      state.failureBusyVisible = true;
    }
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) void enterUnavailable();
  };

  const reportSuccess = () => {
    if (state.unavailable) return;
    state.consecutiveFailures = 0;
    state.lastFailureSource = null;
    if (state.failureBusyVisible) {
      window.ManatOS?.busy?.hide?.();
      state.failureBusyVisible = false;
    }
  };

  const requestRetry = async () => {
    if (!state.unavailable) return false;
    window.dispatchEvent(new CustomEvent(RETRY_EVENT));
    const button = document.querySelector('[data-system-retry]');
    const status = document.querySelector('[data-system-retry-status]');
    if (button instanceof HTMLButtonElement) button.disabled = true;
    if (status) status.textContent = 'Checking connectivity…';
    try {
      const response = await fetch('/runtime/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`Health returned ${response.status}`);
      if (status) status.textContent = 'Connected. Opening Sign in…';

      // The outage already invalidated browser-side identity. The old Express/API
      // session may nevertheless have survived on the restarted service, so end it
      // now that transport is available. Recovery must always cross a fresh normal
      // authentication boundary rather than reuse ambiguous pre-outage identity.
      try {
        await fetch('/auth/logout', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
      } catch {
        // Health succeeded but logout transport raced another outage. Stay on the
        // unavailable page instead of entering Sign in with an ambiguous session.
        if (status) status.textContent = 'ManatOS became unavailable again.';
        return false;
      }
      location.assign('/?auth=signin');
      return true;
    } catch {
      if (status) status.textContent = 'ManatOS is still unavailable.';
      return false;
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const retry = target?.closest('[data-system-retry]');
    if (!(retry instanceof HTMLButtonElement)) return;
    void requestRetry();
  });

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.connectivity = Object.freeze({
    failureThreshold: FAILURE_THRESHOLD,
    get unavailable() {
      return state.unavailable;
    },
    reportFailure,
    reportSuccess,
    requestRetry,
  });
})();
