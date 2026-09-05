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
  const debugBootId =
    document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const DEBUG_STORAGE_KEY = 'manatos.debug.panel.visible.v1';
  const DEVELOPER_TOOL_TAB_STORAGE_KEY = 'manatos.debug.activeTab.v1';
  const DEBUG_DIAGNOSTICS_STORAGE_KEY = `manatos.debug.diagnostics.visible.${debugBootId}`;
  // Debugger open/closed preference deliberately survives UI-server restarts;
  // deeper debugger navigation/width state remains boot-scoped in ctx-debug.js.

  const leftNavigation = document.getElementById('leftNavigation');

  const collapseLeftNavigationButton = document.getElementById('collapseLeftNavigation');

  const restoreLeftNavigationButton = document.getElementById('restoreLeftNavigation');

  const detailsPanel = document.getElementById('detailsPanel');

  const toggleDetailsPanelButton = document.getElementById('toggleDetailsPanel');

  const closeDetailsPanelButton = document.getElementById('closeDetailsPanel');

  const debugPanel = document.getElementById('debugPanel');
  const toggleDebugPanelButton = document.getElementById('toggleDebugPanel');
  const toggleDebugDiagnosticsButton = document.getElementById('toggleDebugDiagnostics');
  const developerToolsDock = document.getElementById('developerToolsDock');
  const closeDeveloperToolsDockButton = document.getElementById('closeDeveloperToolsDock');
  const developerToolsCtxTabButton = document.getElementById('developerToolsCtxTab');
  const developerToolsApiTrafficTabButton = document.getElementById('developerToolsApiTrafficTab');
  const developerToolsResize = document.getElementById('ctxDebugPanelResize');
  const apiTrafficPanel = document.getElementById('apiTrafficPanel');
  let developerToolsReturnFocus = null;

  /**
   * The developer dock is one shell panel. CTX Viewer and API Traffic are
   * content tabs inside it, so changing tools cannot affect shell geometry.
   */
  const normalizeDeveloperToolTab = (value) => (value === 'apiTraffic' ? 'apiTraffic' : 'ctx');

  // Popup runtime is loaded independently from the shell. Keep shell geometry
  // changes safe during boot and delegate modal recentering once that runtime
  // is available. This avoids a hard global-symbol dependency from shell.js.
  const refreshVisibleModalCenters = () => {
    window.ManatOSPopupRuntime?.refreshVisibleModalCenters?.();
  };

  const DEVELOPER_DOCK_WIDTH_KEY = `manatos.debug.developerDock.width.${debugBootId}`;
  const DEFAULT_DEVELOPER_DOCK_WIDTH = 430;

  const applyDeveloperDockWidth = (requested) => {
    if (!appShell) return;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const minWidth = 320;
    const maxWidth = Math.max(
      minWidth,
      Math.min(Math.floor(viewportWidth * 0.66), viewportWidth - 420),
    );
    const width = Math.max(
      minWidth,
      Math.min(Number(requested) || DEFAULT_DEVELOPER_DOCK_WIDTH, maxWidth),
    );
    appShell.style.setProperty('--manatos-debug-width', `${Math.round(width)}px`);
    document.documentElement.style.setProperty('--manatos-debug-width', `${Math.round(width)}px`);
    return width;
  };

  const storedDeveloperDockWidth = Number(sessionStorage.getItem(DEVELOPER_DOCK_WIDTH_KEY));
  if (Number.isFinite(storedDeveloperDockWidth)) applyDeveloperDockWidth(storedDeveloperDockWidth);

  if (developerToolsResize && developerToolsDock) {
    let startX = 0;
    let startWidth = 0;
    let currentWidth = Number.isFinite(storedDeveloperDockWidth)
      ? storedDeveloperDockWidth
      : DEFAULT_DEVELOPER_DOCK_WIDTH;
    let dragging = false;

    const onDeveloperDockResizeMove = (event) => {
      if (!dragging) return;
      currentWidth = applyDeveloperDockWidth(startWidth + (startX - event.clientX)) ?? currentWidth;
      event.preventDefault();
    };
    const onDeveloperDockResizeEnd = () => {
      if (!dragging) return;
      dragging = false;
      developerToolsResize.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-developer-dock');
      document.removeEventListener('pointermove', onDeveloperDockResizeMove);
      document.removeEventListener('pointerup', onDeveloperDockResizeEnd);
      document.removeEventListener('pointercancel', onDeveloperDockResizeEnd);
      try {
        sessionStorage.setItem(DEVELOPER_DOCK_WIDTH_KEY, String(Math.round(currentWidth)));
      } catch {
        /* debugger only */
      }
    };

    developerToolsResize.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      startX = event.clientX;
      startWidth = developerToolsDock.getBoundingClientRect().width || currentWidth;
      dragging = true;
      developerToolsResize.classList.add('is-dragging');
      document.body.classList.add('is-resizing-developer-dock');
      document.addEventListener('pointermove', onDeveloperDockResizeMove, { passive: false });
      document.addEventListener('pointerup', onDeveloperDockResizeEnd, { once: true });
      document.addEventListener('pointercancel', onDeveloperDockResizeEnd, { once: true });
      event.preventDefault();
    });
    developerToolsResize.addEventListener('dblclick', () => {
      currentWidth =
        applyDeveloperDockWidth(DEFAULT_DEVELOPER_DOCK_WIDTH) ?? DEFAULT_DEVELOPER_DOCK_WIDTH;
      try {
        sessionStorage.removeItem(DEVELOPER_DOCK_WIDTH_KEY);
      } catch {
        /* debugger only */
      }
    });
  }

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

  const setCheckedMenuItem = (button, checked) => {
    if (!button) return;
    button.setAttribute('aria-checked', String(checked));
    const check = button.querySelector('.debug-menu-check');
    if (check) {
      check.classList.toggle('bi-check-square', checked);
      check.classList.toggle('bi-square', !checked);
    }
  };

  let debugDiagnosticsVisible = sessionStorage.getItem(DEBUG_DIAGNOSTICS_STORAGE_KEY) !== 'false';
  const setDebugDiagnosticsVisible = (visible, persist = true) => {
    debugDiagnosticsVisible = visible;
    setCheckedMenuItem(toggleDebugDiagnosticsButton, visible);
    if (!visible) {
      document.getElementById('debugDiagnosticPanel')?.remove();
      diagnosticEntries.clear();
    }
    if (persist) sessionStorage.setItem(DEBUG_DIAGNOSTICS_STORAGE_KEY, String(visible));
  };

  /*
   * Keep CTX diagnostics in one window-like panel rather than spawning a stack
   * of overlapping toasts. Repeated instances of the same diagnostic are
   * deduplicated and receive a count, while different diagnostics remain
   * individually expandable inside the same panel.
   */
  const diagnosticEntries = new Map();

  const diagnosticKey = (diagnostic) =>
    JSON.stringify([
      diagnostic?.phase ?? '',
      diagnostic?.message ?? '',
      diagnostic?.expression ?? '',
      diagnostic?.variablePath ?? '',
      diagnostic?.caller?.sourcePath ?? '',
      diagnostic?.targetPath ?? '',
    ]);

  const ensureDebugDiagnosticPanel = () => {
    let panel = document.getElementById('debugDiagnosticPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'debugDiagnosticPanel';
    panel.className = 'ctx-diagnostic-panel shadow';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'CTX diagnostics');
    panel.innerHTML = `
      <div class="ctx-diagnostic-panel-header">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
          <strong>CTX diagnostics</strong>
          <span class="badge text-bg-secondary" data-ctx-diagnostic-total>0</span>
        </div>
        <button type="button" class="btn-close" data-ctx-diagnostics-close aria-label="Close diagnostics"></button>
      </div>
      <div class="ctx-diagnostic-panel-body" data-ctx-diagnostic-list></div>`;

    panel.querySelector('[data-ctx-diagnostics-close]')?.addEventListener('click', () => {
      panel.remove();
      diagnosticEntries.clear();
    });
    document.body.appendChild(panel);
    return panel;
  };

  const refreshDiagnosticTotal = (panel) => {
    const total = [...diagnosticEntries.values()].reduce((sum, entry) => sum + entry.count, 0);
    const badge = panel.querySelector('[data-ctx-diagnostic-total]');
    if (badge) badge.textContent = String(total);
  };

  const showDebugDiagnostic = (diagnostic) => {
    if (!debugDiagnosticsVisible || !diagnostic) return;

    const panel = ensureDebugDiagnosticPanel();
    const key = diagnosticKey(diagnostic);
    const existing = diagnosticEntries.get(key);
    if (existing) {
      existing.count += 1;
      existing.countNode.textContent = `×${existing.count}`;
      existing.countNode.hidden = false;
      refreshDiagnosticTotal(panel);
      return;
    }

    const list = panel.querySelector('[data-ctx-diagnostic-list]');
    if (!list) return;

    const item = document.createElement('article');
    item.className = 'ctx-diagnostic-item';
    const title =
      diagnostic.phase === 'parse' ? 'CTX expression parse error' : 'CTX evaluation warning';
    const details = JSON.stringify(diagnostic, null, 2);
    item.innerHTML = `
      <div class="ctx-diagnostic-item-title">
        <strong data-ctx-diagnostic-title></strong>
        <span class="badge text-bg-secondary" data-ctx-diagnostic-count hidden></span>
      </div>
      <div class="ctx-diagnostic-message"></div>
      <details class="mt-2">
        <summary>Details</summary>
        <pre class="small mt-2 mb-0 text-wrap"></pre>
      </details>`;
    item.querySelector('[data-ctx-diagnostic-title]').textContent = title;
    item.querySelector('.ctx-diagnostic-message').textContent = String(
      diagnostic.message || 'CTX diagnostic',
    );
    item.querySelector('pre').textContent = details;
    list.appendChild(item);

    diagnosticEntries.set(key, {
      count: 1,
      countNode: item.querySelector('[data-ctx-diagnostic-count]'),
    });
    refreshDiagnosticTotal(panel);
  };

  window.addEventListener('manatos:ctx-diagnostic', (event) => {
    showDebugDiagnostic(event.detail);
  });

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

    /** Select one tool without changing the dock's outer geometry. */
    setDeveloperToolTab(tab, persist = true) {
      if (!debugPanel || !apiTrafficPanel) return;
      const activeTab = normalizeDeveloperToolTab(tab);
      const ctxActive = activeTab === 'ctx';

      debugPanel.classList.toggle('d-none', !ctxActive);
      debugPanel.setAttribute('aria-hidden', String(!ctxActive));
      debugPanel.inert = !ctxActive;
      if (ctxActive) debugPanel.removeAttribute('inert');
      else debugPanel.setAttribute('inert', '');

      apiTrafficPanel.classList.toggle('d-none', ctxActive);
      apiTrafficPanel.setAttribute('aria-hidden', String(ctxActive));
      apiTrafficPanel.inert = ctxActive;
      if (!ctxActive) apiTrafficPanel.removeAttribute('inert');
      else apiTrafficPanel.setAttribute('inert', '');

      developerToolsCtxTabButton?.classList.toggle('is-active', ctxActive);
      developerToolsCtxTabButton?.setAttribute('aria-selected', String(ctxActive));
      developerToolsApiTrafficTabButton?.classList.toggle('is-active', !ctxActive);
      developerToolsApiTrafficTabButton?.setAttribute('aria-selected', String(!ctxActive));
      document.documentElement.dataset.manatosDebugTab = activeTab;

      window.dispatchEvent(
        new CustomEvent('manatos:api-traffic-visible', {
          detail: { visible: !ctxActive && appShell?.classList.contains('has-debug') },
        }),
      );
      if (persist) localStorage.setItem(DEVELOPER_TOOL_TAB_STORAGE_KEY, activeTab);
    },

    /** Show/hide the one docked Developer Tools panel. */
    setDeveloperToolsVisible(visible, tab = null, persist = true) {
      if (!appShell || !developerToolsDock) return;

      if (visible) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && !developerToolsDock.contains(active)) {
          developerToolsReturnFocus = active;
        }
        developerToolsDock.inert = false;
        developerToolsDock.removeAttribute('inert');
        developerToolsDock.classList.remove('d-none');
        developerToolsDock.setAttribute('aria-hidden', 'false');
        appShell.classList.add('has-debug');
        setCheckedMenuItem(toggleDebugPanelButton, true);
        const selectedTab = tab ?? localStorage.getItem(DEVELOPER_TOOL_TAB_STORAGE_KEY);
        this.setDeveloperToolTab(selectedTab, persist);
      } else {
        const active = document.activeElement;
        if (active instanceof HTMLElement && developerToolsDock.contains(active)) {
          const fallback =
            developerToolsReturnFocus instanceof HTMLElement &&
            developerToolsReturnFocus.isConnected
              ? developerToolsReturnFocus
              : toggleDebugPanelButton instanceof HTMLElement
                ? toggleDebugPanelButton
                : null;
          // Remove focus from the subtree synchronously before aria-hidden/inert.
          // Some menu triggers are themselves transient, so blur first and then
          // restore focus only when the target remains connected and visible.
          active.blur();
          if (fallback && fallback.getClientRects().length) fallback.focus({ preventScroll: true });
        }
        developerToolsDock.classList.remove('is-popup-inspection');
        developerToolsDock.inert = true;
        developerToolsDock.setAttribute('inert', '');
        developerToolsDock.setAttribute('aria-hidden', 'true');
        developerToolsDock.classList.add('d-none');
        appShell.classList.remove('has-debug');
        setCheckedMenuItem(toggleDebugPanelButton, false);
        window.dispatchEvent(
          new CustomEvent('manatos:api-traffic-visible', { detail: { visible: false } }),
        );
      }

      refreshVisibleModalCenters();
      if (persist) localStorage.setItem(DEBUG_STORAGE_KEY, String(visible));
    },

    /** Compatibility entry point used by existing CTX inspector actions. */
    setDebugVisible(visible, persist = true) {
      if (visible) this.setDeveloperToolsVisible(true, 'ctx', persist);
      else if (document.documentElement.dataset.manatosDebugTab === 'ctx')
        this.setDeveloperToolsVisible(false, null, persist);
    },

    /** Toggle the unified dock without changing whichever tool tab is active. */
    toggleDeveloperTools() {
      const dockOpen = appShell?.classList.contains('has-debug') === true;
      this.setDeveloperToolsVisible(!dockOpen);
    },

    /** Compatibility entry point for code that explicitly opens API Traffic. */
    setApiTrafficVisible(visible, persist = true) {
      if (visible) this.setDeveloperToolsVisible(true, 'apiTraffic', persist);
      else if (document.documentElement.dataset.manatosDebugTab === 'apiTraffic')
        this.setDeveloperToolsVisible(false, null, persist);
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
      Boolean(developerToolsDock) && localStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
    const initialDeveloperToolTab = normalizeDeveloperToolTab(
      localStorage.getItem(DEVELOPER_TOOL_TAB_STORAGE_KEY),
    );
    shellState.setDeveloperToolsVisible(initialDebugVisible, initialDeveloperToolTab, false);
    setDebugDiagnosticsVisible(debugDiagnosticsVisible, false);
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
      const matches =
        targetPath === '/'
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
    shellState.toggleDeveloperTools();
  });

  // Generic developer navigation hook used by field/component inspectors.
  // The requester does not need to know how the shell renders the CTX Viewer.
  window.addEventListener('manatos:ctx-viewer-show', () => {
    shellState.setDebugVisible(true);
  });

  toggleDebugDiagnosticsButton?.addEventListener('click', () => {
    setDebugDiagnosticsVisible(!debugDiagnosticsVisible);
  });

  developerToolsCtxTabButton?.addEventListener('click', () =>
    shellState.setDeveloperToolTab('ctx'),
  );
  developerToolsApiTrafficTabButton?.addEventListener('click', () =>
    shellState.setDeveloperToolTab('apiTraffic'),
  );
  closeDeveloperToolsDockButton?.addEventListener('click', () =>
    shellState.setDeveloperToolsVisible(false),
  );
})();
