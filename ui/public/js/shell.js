(() => {
  /* =======================================================================
   * Adaptive application shell
   * ===================================================================== */

  const appShell = document.getElementById('appShell');

  // Each split client script is intentionally self-contained.
  // prefs.js has its own scoped uiUserId, so shell.js must resolve it too.

  //const uiUserId = document.body.dataset.userId || 'anonymous';

  const navigationStatePersistence = appShell?.dataset.navigationStatePersistence ?? 'none';
  const LEFT_NAVIGATION_STORAGE_KEY = 'manatos.ui.leftNavigation.visible';
  const DETAILS_STORAGE_KEY = 'manatos.ui.details.visible';

  const leftNavigation = document.getElementById('leftNavigation');

  const collapseLeftNavigationButton = document.getElementById('collapseLeftNavigation');

  const restoreLeftNavigationButton = document.getElementById('restoreLeftNavigation');

  const detailsPanel = document.getElementById('detailsPanel');

  const toggleDetailsPanelButton = document.getElementById('toggleDetailsPanel');

  const closeDetailsPanelButton = document.getElementById('closeDetailsPanel');

  /* =======================================================================
   * Workspace-centered Bootstrap modals
   * ===================================================================== */

  const workspace = document.querySelector('.workspace');

  const centerModalInWorkspace = (modal) => {
    if (!workspace || !modal) {
      return;
    }

    const rect = workspace.getBoundingClientRect();

    /*
     * Center in the visible portion of the workspace. This remains correct
     * when the left navigation or right Details panel changes width, and
     * when the document is vertically scrolled.
     */
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, window.innerWidth);
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);

    const centerX =
      visibleRight > visibleLeft
        ? visibleLeft + (visibleRight - visibleLeft) / 2
        : window.innerWidth / 2;

    const centerY =
      visibleBottom > visibleTop
        ? visibleTop + (visibleBottom - visibleTop) / 2
        : window.innerHeight / 2;

    modal.classList.add('workspace-centered-modal');
    modal.style.setProperty('--workspace-modal-center-x', `${centerX}px`);
    modal.style.setProperty('--workspace-modal-center-y', `${centerY}px`);
  };

  const refreshVisibleModalCenters = () => {
    document.querySelectorAll('.modal.show').forEach((modal) => {
      centerModalInWorkspace(modal);
    });
  };

  document.querySelectorAll('.modal').forEach((modal) => {
    /*
     * ManatOS popups are deliberate interactions: clicking the shaded page
     * behind them must not silently dismiss them.
     */
    modal.dataset.bsBackdrop = 'static';
    modal.dataset.bsKeyboard = 'false';

    modal.addEventListener('show.bs.modal', () => {
      centerModalInWorkspace(modal);
    });

    modal.addEventListener('shown.bs.modal', () => {
      centerModalInWorkspace(modal);
    });
  });

  window.addEventListener('resize', refreshVisibleModalCenters);

  /* =======================================================================
      Helpers
   * ===================================================================== */

  const persistenceEnabled = navigationStatePersistence === 'browser';

  const readBooleanPreference = (key, defaultValue) => {
    if (!persistenceEnabled) {
      return defaultValue;
    }

    const stored = localStorage.getItem(key);

    if (stored === null) {
      return defaultValue;
    }

    return stored === 'true';
  };

  const writeBooleanPreference = (key, value) => {
    if (!persistenceEnabled) {
      return;
    }

    localStorage.setItem(key, String(value));
  };

  /**
   * Centralized shell-state helper.
   *
   * Keeping layout state changes here avoids allowing individual
   * buttons to manipulate unrelated CSS classes inconsistently.
   *
   * This also gives us one place to extend behavior later with:
   *
   * - localStorage preferences;
   * - server-side profile preferences;
   * - animated panel sizes;
   * - route-specific automatic panel state;
   * - keyboard shortcuts.
   */
  const shellState = {
    /**
     * Show or hide the left navigation.
     */
    setLeftNavigationVisible(visible, persist = true) {
      if (!appShell || !leftNavigation) {
        return;
      }

      appShell.classList.toggle('has-left-nav', visible);

      leftNavigation.classList.toggle('d-none', !visible);

      restoreLeftNavigationButton?.classList.toggle('d-none', visible);

      collapseLeftNavigationButton?.setAttribute('aria-expanded', String(visible));

      restoreLeftNavigationButton?.setAttribute('aria-expanded', String(visible));

      refreshVisibleModalCenters();

      if (persist) {
        writeBooleanPreference(LEFT_NAVIGATION_STORAGE_KEY, visible);
      }
    },

    /**
     * Show or hide the right Details panel.
     */
    setDetailsVisible(visible, persist = true) {
      if (!appShell || !detailsPanel) {
        return;
      }

      appShell.classList.toggle('has-details', visible);

      detailsPanel.classList.toggle('d-none', !visible);

      detailsPanel.setAttribute('aria-hidden', String(!visible));

      toggleDetailsPanelButton?.setAttribute('aria-expanded', String(visible));

      toggleDetailsPanelButton?.classList.toggle('active', visible);

      refreshVisibleModalCenters();

      if (persist) {
        writeBooleanPreference(DETAILS_STORAGE_KEY, visible);
      }
    },

    /**
     * Toggle current Details state.
     */
    toggleDetails() {
      if (!appShell) {
        return;
      }

      this.setDetailsVisible(!appShell.classList.contains('has-details'));
    },
  };

  /* -----------------------------------------------------------------------
   * Restore persisted shell state
   * -------------------------------------------------------------------- */

  /**
   * The server always renders a safe default state first:
   *
   *   - authenticated users: left navigation visible;
   *   - Details panel: closed.
   *
   * When browser persistence is enabled, replace those defaults with the
   * user's last browser choices. The second argument (false) prevents this
   * initialization step from writing the same values back to localStorage.
   */
  if (appShell) {
    const initialLeftNavigationVisible =
      Boolean(leftNavigation) &&
      readBooleanPreference(
        LEFT_NAVIGATION_STORAGE_KEY,
        appShell.classList.contains('has-left-nav'),
      );

    const initialDetailsVisible =
      Boolean(detailsPanel) && readBooleanPreference(DETAILS_STORAGE_KEY, false);

    shellState.setLeftNavigationVisible(initialLeftNavigationVisible, false);

    shellState.setDetailsVisible(initialDetailsVisible, false);
  }

  /* -----------------------------------------------------------------------
   * Left-navigation events
   * -------------------------------------------------------------------- */

  collapseLeftNavigationButton?.addEventListener(
    'click',

    () => {
      shellState.setLeftNavigationVisible(false);
    },
  );

  restoreLeftNavigationButton?.addEventListener(
    'click',

    () => {
      shellState.setLeftNavigationVisible(true);
    },
  );

  /* -----------------------------------------------------------------------
   * Details-panel events
   * -------------------------------------------------------------------- */

  toggleDetailsPanelButton?.addEventListener(
    'click',

    () => {
      shellState.toggleDetails();
    },
  );

  closeDetailsPanelButton?.addEventListener(
    'click',

    () => {
      shellState.setDetailsVisible(false);
    },
  );
})();
