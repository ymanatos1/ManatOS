(() => {
  /* =======================================================================
   * Adaptive application shell
   * ===================================================================== */

  const appShell = document.getElementById('appShell');

  // Each split client script is intentionally self-contained.
  // shell/preferences.js has its own scoped uiUserId, so shell.js must resolve it too.

  //const uiUserId = document.body.dataset.userId || 'anonymous';

  const navigationStatePersistence = appShell?.dataset.navigationStatePersistence ?? 'none';
  const LEFT_NAVIGATION_STORAGE_KEY = 'manatos.ui.leftNavigation.visible';
  const DETAILS_STORAGE_KEY = 'manatos.ui.details.visible';
  const debugBootId =
    document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const DEBUG_STORAGE_KEY = 'manatos.debug.panel.visible.v1';
  const DEVELOPER_TOOL_TAB_STORAGE_KEY = 'manatos.debug.activeTab.v1';
  const DEBUG_DIAGNOSTICS_STORAGE_KEY = `manatos.debug.diagnostics.visible.${debugBootId}`;
  // Developer-workspace presentation preferences deliberately survive UI-server
  // restarts. Runtime CTX/API values remain boot-owned and are never persisted here.

  const leftNavigation = document.getElementById('leftNavigation');

  const collapseLeftNavigationButton = document.getElementById('collapseLeftNavigation');

  const restoreLeftNavigationButton = document.getElementById('restoreLeftNavigation');

  const detailsPanel = document.getElementById('detailsPanel');

  const toggleDetailsPanelButton = document.getElementById('toggleDetailsPanel');

  const closeDetailsPanelButton = document.getElementById('closeDetailsPanel');

  const documentationButton = document.getElementById('headerDocumentationButton');
  const toggleDebugPanelButton = document.getElementById('toggleDebugPanel');
  const toggleDebugDiagnosticsButton = document.getElementById('toggleDebugDiagnostics');
  const developerToolsDock = document.getElementById('developerToolsDock');
  const closeDeveloperToolsDockButton = document.getElementById('closeDeveloperToolsDock');
  const developerToolsCtxTabButton = document.getElementById('developerToolsCtxTab');
  const developerToolsApiTrafficTabButton = document.getElementById('developerToolsApiTrafficTab');
  const developerToolsResize = document.getElementById('ctxDebugPanelResize');

  documentationButton?.addEventListener('click', () => {
    const width = Math.max(900, Math.min(1500, Math.round(window.screen.availWidth * 0.88)));
    const height = Math.max(650, Math.min(1100, Math.round(window.screen.availHeight * 0.88)));
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
    const documentationWindow = window.open(
      '/documentation',
      'manatosDocumentation',
      `popup=yes,resizable=yes,scrollbars=yes,width=${width},height=${height},left=${left},top=${top}`,
    );
    documentationWindow?.focus();
  });
  let developerToolsReturnFocus = null;

  /**
   * The developer dock is one shell panel. CTX Viewer and API Traffic are
   * content tabs inside it, so changing tools cannot affect shell geometry.
   */
  const normalizeDeveloperToolTab = (value) =>
    typeof value === 'string' &&
    (value === 'ctx' || value === 'apiTraffic' || value.startsWith('ctxView:'))
      ? value
      : 'ctx';

  // Popup runtime is loaded independently from the shell. Keep shell geometry
  // changes safe during boot and delegate modal recentering once that runtime
  // is available. This avoids a hard global-symbol dependency from shell.js.
  const refreshVisibleModalCenters = () => {
    window.ManatOS?.popup?.runtime?.refreshVisibleModalCenters?.();
  };

  const DEVELOPER_DOCK_WIDTH_KEY = 'manatos.debug.developerDock.width.v2';
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

  const storedDeveloperDockWidth = Number(localStorage.getItem(DEVELOPER_DOCK_WIDTH_KEY));
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
        localStorage.setItem(DEVELOPER_DOCK_WIDTH_KEY, String(Math.round(currentWidth)));
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
        localStorage.removeItem(DEVELOPER_DOCK_WIDTH_KEY);
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

  // Keep expression diagnostics independently from the floating diagnostics
  // panel so every metadata Debugging tab can aggregate the same session errors.
  const expressionDiagnosticHistory = new Map();

  const syncExpressionDiagnostics = () => {
    const diagnostics = [...expressionDiagnosticHistory.values()];
    for (const body of document.querySelectorAll('[data-debugging-expression-errors]')) {
      if (!(body instanceof HTMLElement)) continue;
      body.replaceChildren();
      if (!diagnostics.length) {
        const row = document.createElement('tr');
        row.dataset.debuggingExpressionErrorsEmpty = '';
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.className = 'text-secondary py-3';
        cell.textContent = 'No expression errors in this browser session.';
        row.appendChild(cell);
        body.appendChild(row);
        continue;
      }
      for (const diagnostic of diagnostics) {
        const row = document.createElement('tr');
        row.className = 'table-danger';
        const phase = document.createElement('td');
        phase.textContent = diagnostic.phase === 'parse' ? 'Parse' : 'Evaluate';
        const expression = document.createElement('td');
        const code = document.createElement('code');
        code.className = 'text-danger';
        code.textContent = String(diagnostic.expression || '(expression unavailable)');
        expression.appendChild(code);
        const message = document.createElement('td');
        message.className = 'text-danger';
        message.textContent = String(diagnostic.message || 'Expression error');
        row.append(phase, expression, message);
        body.appendChild(row);
      }
    }

    for (const tab of document.querySelectorAll('[data-debugging-errors-tab]')) {
      if (!(tab instanceof HTMLElement)) continue;
      const count = diagnostics.length;
      tab.classList.toggle('debugging-errors-present', count > 0);
      tab.setAttribute('aria-label', count > 0 ? `Errors (${count})` : 'Errors');
      const badge = tab.querySelector('[data-debugging-errors-count]');
      if (badge instanceof HTMLElement) {
        badge.textContent = String(count);
        badge.classList.toggle('d-none', count === 0);
      }
    }

    for (const tab of document.querySelectorAll('[data-debugging-host-tab]')) {
      if (!(tab instanceof HTMLElement)) continue;
      const count = diagnostics.length;
      tab.classList.toggle('debugging-host-errors-present', count > 0);
      tab.setAttribute('aria-label', count > 0 ? `Debugging (${count} errors)` : 'Debugging');
      const badge = tab.querySelector('[data-debugging-host-errors-count]');
      if (badge instanceof HTMLElement) {
        badge.textContent = String(count);
        badge.classList.toggle('d-none', count === 0);
      }
    }

    const fieldOwnersForDiagnostic = (diagnostic) => {
      const expression = String(diagnostic?.expression || '').trim();
      if (!expression) return [];
      const owners = [];
      const entities = window.ManatOS?.ctx?.value?.entities;
      if (!entities || typeof entities !== 'object') return owners;
      for (const [entitySlot, entity] of Object.entries(entities)) {
        const fields = entity?.metadata?.fieldDefinition;
        if (!fields || typeof fields !== 'object') continue;
        for (const [fieldKey, definition] of Object.entries(fields)) {
          const candidates = [
            definition?.calculation?.expression,
            definition?.normalize?.expression,
            definition?.visible?.expression,
            definition?.editable?.expression,
          ]
            .filter((value) => typeof value === 'string')
            .map((value) => value.trim());
          if (!candidates.includes(expression)) continue;
          owners.push({
            fieldKey,
            metadataPath: `ctx.entities.${entitySlot}.metadata.fieldDefinition.${fieldKey}`,
          });
        }
      }
      return owners;
    };

    const ownerMatchesCtxPath = (diagnostic, owner, path) => {
      if (!path || !owner?.fieldKey) return false;
      if (path === owner.metadataPath || path.startsWith(`${owner.metadataPath}.`)) return true;
      const sourcePath = diagnostic?.caller?.sourcePath;
      if (typeof sourcePath !== 'string' || !sourcePath || !path.startsWith(sourcePath))
        return false;
      const escapedField = owner.fieldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[.\\[])(?:${escapedField})(?:$|[.\\]])`).test(path);
    };

    const ownerDiagnostics = diagnostics.map((diagnostic) => ({
      diagnostic,
      owners: fieldOwnersForDiagnostic(diagnostic),
    }));

    for (const source of document.querySelectorAll('[data-debug-expression]')) {
      if (!(source instanceof HTMLElement)) continue;
      const expression = String(source.textContent || '').trim();
      const diagnostic = diagnostics.find((candidate) => candidate.expression === expression);
      source.classList.toggle('text-danger', Boolean(diagnostic));
      source.classList.toggle('fw-semibold', Boolean(diagnostic));
      const row = source.closest('tr');
      row?.classList.toggle('debugging-expression-owner-error', Boolean(diagnostic));
      if (diagnostic) {
        source.dataset.expressionError = 'true';
        source.title = String(diagnostic.message || 'Expression error');
      } else {
        delete source.dataset.expressionError;
        source.removeAttribute('title');
      }
    }

    for (const row of document.querySelectorAll('.ctx-debug-row[data-ctx-path]')) {
      if (!(row instanceof HTMLElement)) continue;
      const path = row.dataset.ctxPath || '';
      const match = ownerDiagnostics.find(({ diagnostic, owners }) =>
        owners.some((owner) => ownerMatchesCtxPath(diagnostic, owner, path)),
      );
      row.classList.toggle('ctx-expression-error-owner', Boolean(match));
      let marker = row.querySelector(':scope > [data-ctx-expression-error-indicator]');
      if (match && !(marker instanceof HTMLElement)) {
        marker = document.createElement('i');
        marker.className = 'bi bi-exclamation-circle-fill ctx-expression-error-indicator';
        marker.dataset.ctxExpressionErrorIndicator = '';
        marker.setAttribute('aria-hidden', 'true');
        row.appendChild(marker);
      }
      if (marker instanceof HTMLElement) {
        if (match) marker.title = String(match.diagnostic.message || 'Expression error');
        else marker.remove();
      }
    }
  };

  const rememberExpressionDiagnostic = (diagnostic) => {
    if (!diagnostic || !['parse', 'evaluate'].includes(diagnostic.phase)) return;
    expressionDiagnosticHistory.set(diagnosticKey(diagnostic), diagnostic);
    window.ManatOS = window.ManatOS || {};
    window.ManatOS.expressionDiagnostics = [...expressionDiagnosticHistory.values()];
    syncExpressionDiagnostics();
  };

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
    if (!diagnostic) return;
    rememberExpressionDiagnostic(diagnostic);
    if (!debugDiagnosticsVisible) return;

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

  new MutationObserver((mutations) => {
    if (
      mutations.some((mutation) =>
        [...mutation.addedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches?.(
              '[data-debugging-expression-errors], [data-debug-expression], [data-debugging-host-tab], .ctx-debug-row[data-ctx-path]',
            ) ||
              node.querySelector?.(
                '[data-debugging-expression-errors], [data-debug-expression], [data-debugging-host-tab], .ctx-debug-row[data-ctx-path]',
              )),
        ),
      )
    )
      syncExpressionDiagnostics();
  }).observe(document.body, { childList: true, subtree: true });

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
      if (!developerToolsDock) return;
      let activeTab = normalizeDeveloperToolTab(tab);
      const availableTabs = [...developerToolsDock.querySelectorAll('[data-developer-tool-tab]')];
      const availablePanels = [
        ...developerToolsDock.querySelectorAll('[data-developer-tool-panel]'),
      ];
      if (!availableTabs.some((button) => button.dataset.developerToolTab === activeTab)) {
        activeTab = 'ctx';
      }

      for (const panel of availablePanels) {
        const active = panel.dataset.developerToolPanel === activeTab;
        panel.classList.toggle('d-none', !active);
        panel.setAttribute('aria-hidden', String(!active));
        panel.inert = !active;
        if (active) panel.removeAttribute('inert');
        else panel.setAttribute('inert', '');
      }

      for (const button of availableTabs) {
        const active = button.dataset.developerToolTab === activeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      }

      document.documentElement.dataset.manatosDebugTab = activeTab;
      const apiTrafficActive = activeTab === 'apiTraffic';
      window.dispatchEvent(
        new CustomEvent('manatos:api-traffic-visible', {
          detail: { visible: apiTrafficActive && appShell?.classList.contains('has-debug') },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('manatos:developer-tool-tab-changed', { detail: { tab: activeTab } }),
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
        if (developerToolsDock.ownerDocument === document) appShell.classList.add('has-debug');
        else appShell.classList.remove('has-debug');
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
      window.dispatchEvent(
        new CustomEvent('manatos:developer-tools-visibility-changed', {
          detail: { visible: Boolean(visible) },
        }),
      );
      if (persist) localStorage.setItem(DEBUG_STORAGE_KEY, String(visible));
    },

    /** CTX convenience entry point used by inspector actions. */
    setDebugVisible(visible, persist = true) {
      if (visible) {
        this.setDeveloperToolsVisible(true, 'ctx', persist);
        return;
      }
      const activeTab = document.documentElement.dataset.manatosDebugTab || '';
      if (activeTab === 'ctx' || activeTab.startsWith('ctxView:')) {
        this.setDeveloperToolsVisible(false, null, persist);
      }
    },

    /** Toggle the unified dock without changing whichever tool tab is active. */
    toggleDeveloperTools() {
      const dockVisible = developerToolsDock?.classList.contains('d-none') === false;
      this.setDeveloperToolsVisible(!dockVisible);
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
   * V2 navigation tracking
   * -------------------------------------------------------------------- */

  const activeNavigationCtxPath = () => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime) return null;
    let level = runtime.get('ctx.ui.level');
    if (!level) return null;
    let path = 'ctx.ui.level';
    while (level?.level) {
      level = level.level;
      path += '.level';
    }
    return runtime.get(`${path}.state.navigation`) ? `${path}.state.navigation` : null;
  };

  const writeNormalNavigationToCtx = (element) => {
    const runtime = window.ManatOS?.ctx;
    const path = activeNavigationCtxPath();
    if (!runtime || !path || !(element instanceof Element)) return;

    const statePath = element.getAttribute('data-navigation-track-path');
    const value = element.getAttribute('data-navigation-track-value');
    if (!statePath || !value) return;

    runtime.replace(`${path}.${statePath}`, value, {
      source: 'navigation',
      reason: 'navigation-selected',
    });
  };

  // Bootstrap tab events are authoritative after the UI reaches its new state;
  // CTX observes that state and never acts as a navigation command bus. Use one
  // delegated listener so browser-composed V2 navigation (for example developer
  // Debugging) participates without requiring server-authored tab inventory.
  document.addEventListener('shown.bs.tab', (event) => {
    if (event.target instanceof Element) writeNormalNavigationToCtx(event.target);
  });

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

  window.addEventListener('manatos:developer-tool-tab-select', (event) => {
    const tab = event instanceof CustomEvent ? event.detail?.tab : null;
    if (typeof tab !== 'string' || !tab) return;
    shellState.setDeveloperToolsVisible(true, tab);
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

  /* -----------------------------------------------------------------------
   * Universal interaction conventions
   * -------------------------------------------------------------------- */

  // All Bootstrap dropdowns use the viewport as their Popper boundary. This is
  // deliberately shell-owned so field menus, navigation menus and popup menus
  // behave consistently without each caller inventing overflow rules.
  const applyViewportDropdownBoundary = (scope = document) => {
    if (!(scope instanceof Document || scope instanceof Element)) return;
    scope.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((toggle) => {
      if (toggle instanceof HTMLElement && !toggle.hasAttribute('data-bs-boundary')) {
        toggle.setAttribute('data-bs-boundary', 'viewport');
      }
    });
  };
  applyViewportDropdownBoundary();
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('[data-bs-toggle="dropdown"]') && !node.hasAttribute('data-bs-boundary')) {
          node.setAttribute('data-bs-boundary', 'viewport');
        }
        applyViewportDropdownBoundary(node);
      }
    }
  }).observe(document.body, { subtree: true, childList: true });

  const firstInputControl = (scope = document) => {
    if (!(scope instanceof Document || scope instanceof Element)) return null;
    const selector = [
      'input:not([type="hidden"]):not([disabled]):not([readonly]):not([aria-hidden="true"])',
      'select:not([disabled]):not([aria-hidden="true"])',
      'textarea:not([disabled]):not([readonly]):not([aria-hidden="true"])',
      '[contenteditable="true"]:not([aria-hidden="true"])',
    ].join(',');
    return [...scope.querySelectorAll(selector)].find(
      (control) =>
        control instanceof HTMLElement &&
        control.getClientRects().length > 0 &&
        !control.closest('[hidden], [aria-hidden="true"]'),
    );
  };

  const focusFirstInput = (scope = document) => {
    // Metadata entry forms have a stricter readiness contract and therefore use
    // their dedicated focus runtime. This generic rule covers all other pages
    // and Bootstrap popups.
    if (scope instanceof Document && scope.querySelector('form.metadata-driven-record-form'))
      return;
    const target = firstInputControl(scope);
    if (!(target instanceof HTMLElement)) return;
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  };

  window.addEventListener('load', () => focusFirstInput(document), { once: true });
  document.addEventListener('shown.bs.modal', (event) => {
    const modal = event.target;
    if (modal instanceof HTMLElement) focusFirstInput(modal);
  });

  let pendingCancellation = null;
  let confirmedCancellationExit = false;

  const ensureSurfaceCancellationModal = () => {
    let modal = document.getElementById('surfaceCancellationModal');
    if (modal instanceof HTMLElement) return modal;

    modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'surfaceCancellationModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'surfaceCancellationModalLabel');
    modal.setAttribute('data-bs-backdrop', 'static');
    modal.setAttribute('data-bs-keyboard', 'false');
    modal.dataset.popupPurpose = 'unsaved-changes';
    modal.dataset.surfaceKind = 'custom';
    modal.dataset.popupInvocation = JSON.stringify({
      purpose: 'unsaved-changes',
      behavior: { recoverable: false },
    });
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-warning-subtle">
            <h5 class="modal-title" id="surfaceCancellationModalLabel" data-v2-layout-caption="surface">
              <i class="bi bi-exclamation-triangle me-2" aria-hidden="true"></i>Unsaved changes
            </h5>
            <span class="surface-owner-context-badge badge text-bg-light border d-none" data-owner-context-badge></span>
          </div>
          <div class="modal-body" data-v2-layout-region="content" data-v2-layout-component-instance="message">You have changes that have not been saved.</div>
          <div class="modal-footer" data-v2-layout-actions="surface">
            <button type="button" class="btn btn-link btn-sm p-0 me-auto text-primary" data-surface-cancel-review hidden>
              <i class="bi bi-pencil-square me-1" aria-hidden="true"></i>Unsaved changes
            </button>
            <button type="button" class="btn btn-secondary" data-v2-layout-action="cancel" data-surface-cancel-action="cancel">
              Cancel
            </button>
            <button type="button" class="btn btn-outline-danger" data-v2-layout-action="discard" data-surface-cancel-action="discard">
              Discard
            </button>
            <button type="button" class="btn btn-primary" data-v2-layout-action="save" data-surface-cancel-action="save">
              Save
            </button>
          </div>
        </div>
      </div>`;
    document.body.append(modal);
    window.ManatOS?.popup?.runtime?.registerBootstrapModal?.(modal);

    modal.querySelector('[data-surface-cancel-review]')?.addEventListener('click', () => {
      const path = pendingCancellation?.path;
      if (!path) return;
      const root = [...document.querySelectorAll('[data-ui-level-root]')].find(
        (candidate) => candidate instanceof HTMLElement && candidate.dataset.ctxScopePath === path,
      );
      const indicator = root?.querySelector(
        '[data-form-state-indicator], [data-hierarchy-state-indicator]',
      );
      if (indicator instanceof HTMLButtonElement && !indicator.disabled) indicator.click();
    });

    modal.querySelectorAll('[data-surface-cancel-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.surfaceCancelAction;
        const pending = pendingCancellation;
        if (!pending) return;
        const modalInstance = window.bootstrap?.Modal?.getOrCreateInstance(modal);
        if (action === 'cancel') {
          pendingCancellation = null;
          modalInstance?.hide();
          return;
        }

        button.disabled = true;
        const closed = await window.ManatOS?.uiHost?.closePath?.(
          pending.path,
          'surface-cancellation',
          action,
        );
        button.disabled = false;
        if (closed !== true) return;

        pending.action = action;
        if (pendingCancellation === pending) pendingCancellation = null;
        modalInstance?.hide();
        continueAfterSurfaceClose(pending);
      });
    });
    return modal;
  };

  const ownerContextForPath = (path) => {
    const surface = path ? window.ManatOS?.ctx?.get?.(path) : null;
    return window.ManatOS?.ownerContextPresentation?.(surface) || null;
  };

  const projectOwnerContextBadge = (host, path) => {
    if (!(host instanceof Element)) return;
    const badge = host.querySelector('[data-owner-context-badge]');
    if (!(badge instanceof HTMLElement)) return;
    const presentation = ownerContextForPath(path);
    badge.classList.toggle('d-none', !presentation);
    badge.textContent = presentation?.label || '';
    badge.title = presentation?.title || '';
  };

  const projectActiveOwnerContext = () => {
    document.querySelectorAll('[data-ui-level-root]').forEach((root) => {
      if (!(root instanceof HTMLElement)) return;
      const path = String(root.dataset.ctxScopePath || '').trim();
      projectOwnerContextBadge(root, path || null);
    });
  };
  window.addEventListener('load', projectActiveOwnerContext, { once: true });
  window.addEventListener('manatos:ctx-change', projectActiveOwnerContext);

  const showPendingCancellation = () => {
    const pending = pendingCancellation;
    if (!pending?.path) return false;
    const modal = ensureSurfaceCancellationModal();
    const presentation = window.ManatOS?.uiHost?.cancellationPresentation?.(pending.path) || {};
    projectOwnerContextBadge(modal, pending.path);
    const body = modal.querySelector('.modal-body');
    const discard = modal.querySelector('[data-surface-cancel-action="discard"]');
    const save = modal.querySelector('[data-surface-cancel-action="save"]');
    const review = modal.querySelector('[data-surface-cancel-review]');
    const root = [...document.querySelectorAll('[data-ui-level-root]')].find(
      (candidate) =>
        candidate instanceof HTMLElement && candidate.dataset.ctxScopePath === pending.path,
    );
    const stateIndicator = root?.querySelector(
      '[data-form-state-indicator], [data-hierarchy-state-indicator]',
    );
    if (review instanceof HTMLButtonElement) {
      review.hidden = !(stateIndicator instanceof HTMLButtonElement) || stateIndicator.disabled;
    }
    if (body instanceof HTMLElement) {
      body.textContent = presentation.message || 'You have changes that have not been saved.';
    }
    if (discard instanceof HTMLButtonElement) {
      discard.textContent = presentation.discardLabel || 'Discard';
    }
    if (save instanceof HTMLButtonElement) {
      save.textContent = presentation.saveLabel || 'Save';
      save.disabled = window.ManatOS?.uiHost?.canSaveUserChanges?.(pending.path) !== true;
    }
    window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
    return true;
  };

  const continueAfterSurfaceClose = (pending) => {
    if (!pending) return;
    confirmedCancellationExit = true;
    window.setTimeout(() => {
      confirmedCancellationExit = false;
    }, 0);
    // The continuation belongs to the close request itself. Queue it before
    // publishing the informational confirmation event so surface listeners
    // cannot become a second navigation authority or prevent the requested
    // continuation after canonical disposal has already succeeded.
    if (typeof pending.continue === 'function') queueMicrotask(() => pending.continue());
    window.dispatchEvent(
      new CustomEvent('manatos:surface-cancellation-confirmed', {
        detail: { path: pending.path, action: pending.action || 'close' },
      }),
    );
  };

  const requestSurfaceClose = async (trigger, continuation = null, requestedPath = null) => {
    if (!(trigger instanceof HTMLElement)) return false;
    const path = requestedPath || window.ManatOS?.uiHost?.currentUserChangePath?.() || null;
    if (!path) return false;

    const pending = { trigger, path, continue: continuation, action: 'close' };
    pendingCancellation = pending;
    const closed = await window.ManatOS?.uiHost?.closePath?.(path, 'surface-close-request');
    if (closed === true) {
      if (pendingCancellation === pending) pendingCancellation = null;
      continueAfterSurfaceClose(pending);
      return true;
    }
    // A dirty surface emits manatos:ui-close-decision-required from the typed
    // close bridge. The event handler below presents the one shared decision UI.
    // Other rejected closes (for example a blocked child editor) stay mounted.
    return true;
  };

  const surfaceCloseTriggerForPath = (path) => {
    if (!path) return null;
    const root = [...document.querySelectorAll('[data-ui-level-root]')].find(
      (candidate) =>
        candidate instanceof HTMLElement && candidate.dataset.ctxScopePath === String(path),
    );
    if (!(root instanceof HTMLElement)) return null;
    const trigger = root.querySelector('[data-cancel-operation]');
    return trigger instanceof HTMLElement ? trigger : null;
  };

  const NAVIGATION_CONTINUATION_KEY = 'manatos.ui.navigationContinuation.v1';

  const setNavigationContinuation = (href = null) => {
    try {
      if (href) sessionStorage.setItem(NAVIGATION_CONTINUATION_KEY, String(href));
      else sessionStorage.removeItem(NAVIGATION_CONTINUATION_KEY);
    } catch {
      /* navigation still closes safely when transient continuation storage is unavailable */
    }
  };

  const drainUserChangeSurfacesForNavigation = async (trigger, continuation, destinationHref) => {
    if (!(trigger instanceof HTMLElement) || typeof continuation !== 'function') return false;

    while (true) {
      const userChangePath = window.ManatOS?.uiHost?.currentUserChangePath?.() || null;
      if (!userChangePath) {
        continuation();
        return true;
      }
      const path = window.ManatOS?.uiHost?.currentSurfacePath?.() || null;
      if (!path) return false;

      // Navigation never disposes a UiLevel directly. Closing a live surface is
      // one infrastructure operation: its ordinary Close trigger supplies the
      // presentation continuation while requestSurfaceClose/UiRuntime owns the
      // dirty decision and semantic UiLevel lifecycle.
      const closeTrigger = surfaceCloseTriggerForPath(path);
      if (!(closeTrigger instanceof HTMLElement)) return false;
      const closeContinuation = closeContinuationForTrigger(closeTrigger);
      // A routed page close destroys this document. Preserve only the original
      // destination as transient process state so the newly rendered parent page
      // can continue the same clean drain. If this close asks for a dirty
      // decision, the continuation is cleared immediately below and navigation
      // is cancelled exactly as for an ordinary Close.
      if (typeof closeContinuation === 'function') setNavigationContinuation(destinationHref);
      await requestSurfaceClose(closeTrigger, closeContinuation, path);

      // A dirty/blocked surface remains live. Its normal decision UI now owns
      // the close transaction; the original navigation request is forgotten.
      if (window.ManatOS?.ctx?.get?.(path) !== undefined) {
        setNavigationContinuation(null);
        return false;
      }

      // A routed page close (anchor/form/surfaceCloseHref) crosses a document
      // boundary. Its canonical continuation owns that transition, so this
      // document's loop ends here; the transient continuation resumes the
      // clean drain after the canonical routed close renders the parent page.
      if (typeof closeContinuation === 'function') return false;

      // Popup/embedded closures are in-document; the loop can immediately
      // re-evaluate the newly current parent surface.
    }
  };

  const closeContinuationForTrigger = (trigger) => {
    const explicitHref = trigger?.dataset?.surfaceCloseHref;
    if (explicitHref) {
      const destination = new URL(explicitHref, window.location.href);
      return () => window.location.assign(destination.href);
    }
    if (trigger instanceof HTMLAnchorElement) {
      const destination = new URL(trigger.href, window.location.href);
      return () => window.location.assign(destination.href);
    }
    const form = trigger?.closest?.('form');
    if (
      trigger instanceof HTMLButtonElement &&
      trigger.type === 'submit' &&
      form instanceof HTMLFormElement
    ) {
      // A submit-shaped Close declares only its routed HTTP continuation. The
      // Entry submit pipeline is semantic editing behavior and must not run
      // after canonical UiLevel disposal.
      const action = trigger.formAction || form.action;
      const method = trigger.formMethod || form.method;
      return () => {
        form.action = action;
        form.method = method;
        HTMLFormElement.prototype.submit.call(form);
      };
    }
    return null;
  };

  const requestCloseTrigger = (trigger, requestedPath = null) =>
    requestSurfaceClose(
      trigger,
      closeContinuationForTrigger(trigger),
      requestedPath || trigger?.dataset?.surfaceClosePath || null,
    );
  const requestCloseWithContinuation = (trigger, continuation, requestedPath = null) =>
    requestSurfaceClose(
      trigger,
      typeof continuation === 'function' ? continuation : null,
      requestedPath || trigger?.dataset?.surfaceClosePath || null,
    );

  window.ManatOS ||= {};
  window.ManatOS.surfaceClosure = Object.freeze({
    requestTrigger: requestCloseTrigger,
    requestWithContinuation: requestCloseWithContinuation,
  });

  // The typed UiRuntime is the only dirty/lifecycle authority. Browser chrome
  // presents the decision requested by that authority; it does not independently
  // decide whether a surface is dirty or safe to destroy.
  window.addEventListener('manatos:ui-close-decision-required', (event) => {
    const detail = event?.detail || {};
    const handle = detail.handle;
    if (!handle?.path) return;
    // The shell presents only closure transactions that originated from its
    // explicit Close/Cancel/navigation adapter. Internal host operations (for
    // example opening a child and aborting an incomplete mount) may ask the
    // typed authority to close a level, but must never be reclassified here as
    // abandonment of the dirty owner workspace.
    if (!pendingCancellation || pendingCancellation.path !== String(handle.path)) return;
    pendingCancellation.decisionRequired = true;
    showPendingCancellation();
  });

  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const trigger =
        event.target instanceof Element ? event.target.closest('[data-cancel-operation]') : null;
      if (!(trigger instanceof HTMLElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      void requestCloseTrigger(trigger);
    },
    true,
  );

  /*
   * Same-origin navigation drains live user-change surfaces deepest-first.
   * Each surface receives its ordinary typed close request. Any requested dirty
   * decision cancels this navigation attempt; only a completely clean drain
   * reaches the original destination.
   */
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.matches('[data-cancel-operation]')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.dataset.bsToggle || anchor.dataset.bsTarget) return;

      let destination;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      if (
        destination.href === window.location.href ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search &&
          destination.hash)
      )
        return;

      const path = window.ManatOS?.uiHost?.currentUserChangePath?.() || null;
      if (!path) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void drainUserChangeSurfacesForNavigation(
        anchor,
        () => window.location.assign(destination.href),
        destination.href,
      );
    },
    true,
  );

  // Routed page closure (for example an owned Entry returning to its
  // Organization) crosses a document boundary. Resume only a clean navigation
  // drain; the first dirty decision clears this transient continuation.
  window.addEventListener(
    'load',
    () => {
      let destinationHref = '';
      try {
        destinationHref = sessionStorage.getItem(NAVIGATION_CONTINUATION_KEY) || '';
      } catch {
        destinationHref = '';
      }
      if (!destinationHref) return;
      setNavigationContinuation(null);
      let destination;
      try {
        destination = new URL(destinationHref, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      void drainUserChangeSurfacesForNavigation(
        document.body,
        () => window.location.assign(destination.href),
        destination.href,
      );
    },
    { once: true },
  );

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.allowDirtyPageExit !== 'true') return;
      confirmedCancellationExit = true;
    },
    true,
  );

  window.addEventListener('beforeunload', (event) => {
    if (confirmedCancellationExit) return;
    const path = window.ManatOS?.uiHost?.currentUserChangePath?.() || null;
    if (!path || window.ManatOS?.uiHost?.shouldConfirmCancellation?.(path) !== true) return;
    event.preventDefault();
    event.returnValue = '';
  });

  const visibleElement = (element) =>
    element instanceof HTMLElement && !element.hidden && element.getClientRects().length > 0;

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;

      // Focus and ordinary field/dropdown presentation never change whether the
      // owning surface accepts Escape. A genuinely local interaction may consume
      // Escape later only when the surface dismissal request itself is rejected
      // (for example an inline editor holding the surface input-readiness block).
      const visibleModal = [...document.querySelectorAll('.modal.show')]
        .filter(visibleElement)
        .at(-1);
      const visibleBackdrop = [...document.querySelectorAll('.manatos-popup-backdrop')]
        .filter(visibleElement)
        .at(-1);
      const dismissed = window.ManatOS?.popup?.runtime?.requestDismiss?.(
        visibleModal || visibleBackdrop || null,
        'escape',
      );
      if (dismissed !== true) return;

      event.preventDefault();
      event.stopPropagation();
    },
    // Entry controls (including rich editors and collection controls) may own
    // bubbling Escape for their local interaction. A hosted popup is a surface
    // boundary, so its shell must observe Escape before those descendants can
    // consume it. Transient menus/modals above the entry are still excluded by
    // the state checks above.
    true,
  );
})();
