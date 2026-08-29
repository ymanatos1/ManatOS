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
  const debugBootId = document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const DEBUG_STORAGE_KEY = `manatos.debug.panel.visible.${debugBootId}`;

  const leftNavigation = document.getElementById('leftNavigation');

  const collapseLeftNavigationButton = document.getElementById('collapseLeftNavigation');

  const restoreLeftNavigationButton = document.getElementById('restoreLeftNavigation');

  const detailsPanel = document.getElementById('detailsPanel');

  const toggleDetailsPanelButton = document.getElementById('toggleDetailsPanel');

  const closeDetailsPanelButton = document.getElementById('closeDetailsPanel');

  const debugPanel = document.getElementById('debugPanel');
  const toggleDebugPanelButton = document.getElementById('toggleDebugPanel');
  const closeDebugPanelButton = document.getElementById('closeDebugPanel');

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

    /** Show/hide the development debugger as the shell's rightmost column. */
    setDebugVisible(visible, persist = true) {
      if (!appShell || !debugPanel) {
        return;
      }

      appShell.classList.toggle('has-debug', visible);
      debugPanel.classList.toggle('d-none', !visible);
      debugPanel.setAttribute('aria-hidden', String(!visible));
      toggleDebugPanelButton?.setAttribute('aria-expanded', String(visible));
      toggleDebugPanelButton?.classList.toggle('active', visible);

      refreshVisibleModalCenters();

      if (persist) {
        sessionStorage.setItem(DEBUG_STORAGE_KEY, String(visible));
      }
    },

    toggleDebug() {
      if (!appShell) return;
      this.setDebugVisible(!appShell.classList.contains('has-debug'));
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

    const initialDebugVisible =
      Boolean(debugPanel) && sessionStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
    shellState.setDebugVisible(initialDebugVisible, false);
  }

  /* -----------------------------------------------------------------------
   * Active left-navigation entry
   * -------------------------------------------------------------------- */

  /**
   * Highlight the navigation entry that owns the currently opened page.
   *
   * Nested pages (for example /bo/sys-users/<id>/edit) belong to their first
   * navigation page (/bo/sys-users), so prefix matching deliberately keeps
   * Users selected while deeper pages are open. When multiple links match,
   * the longest route wins. Root ('/') only matches the actual home page.
   */
  const markActiveVerticalNavigation = () => {
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const links = [...document.querySelectorAll('.vertical-menu a[href]')];
    let best = null;
    let bestLength = -1;

    for (const link of links) {
      let targetPath;
      try {
        targetPath = new URL(link.getAttribute('href') || '', window.location.origin).pathname;
      } catch {
        continue;
      }

      targetPath = targetPath.replace(/\/+$/, '') || '/';
      const matches = targetPath === '/'
        ? currentPath === '/'
        : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);

      if (matches && targetPath.length > bestLength) {
        best = link;
        bestLength = targetPath.length;
      }
    }

    for (const link of links) {
      const active = link === best;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };

  markActiveVerticalNavigation();

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


  /* -----------------------------------------------------------------------
   * Development debugger events
   * -------------------------------------------------------------------- */
  toggleDebugPanelButton?.addEventListener('click', () => {
    shellState.toggleDebug();
  });

  closeDebugPanelButton?.addEventListener('click', () => {
    shellState.setDebugVisible(false);
  });

})();
