(() => {
  'use strict';

  // A debugger script can be re-initialized by development navigation/hot reload.
  // Dispose the prior poll timer first so one visible viewer can never create
  // multiple concurrent /bo/debug/api-traffic polling loops.
  window.__manatosApiTrafficRuntime?.dispose?.();

  const panel = document.getElementById('apiTrafficPanel');
  const list = document.getElementById('apiTrafficList');
  if (!panel || !list) return;

  const stats = document.getElementById('apiTrafficStats');
  const pause = document.getElementById('apiTrafficPause');
  const clear = document.getElementById('apiTrafficClear');
  const errors = document.getElementById('apiTrafficErrors');
  const routesButton = document.getElementById('apiTrafficRoutes');
  const routeMenu = document.getElementById('apiTrafficRouteMenu');
  const routeMenuList = document.getElementById('apiTrafficRouteMenuList');
  const filter = document.getElementById('apiTrafficFilter');
  const details = document.getElementById('apiTrafficDetails');
  const detailsTitle = document.getElementById('apiTrafficDetailsTitle');
  const detailsBody = document.getElementById('apiTrafficDetailsBody');
  const detailsClose = document.getElementById('apiTrafficDetailsClose');
  const requestTab = document.getElementById('apiTrafficRequestTab');
  const responseTab = document.getElementById('apiTrafficResponseTab');
  const columns = document.getElementById('apiTrafficColumns');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const bootId = document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const STATE_KEY = `manatos.debug.apiTraffic.state.v2.${bootId}`;
  // Route choices are a durable developer preference. Unlike traffic counts,
  // they intentionally survive browser/UI restarts.
  const ROUTE_STATE_KEY = 'manatos.debug.apiTraffic.routes.v2';
  const ROUTE_CATALOG_KEY = 'manatos.debug.apiTraffic.routeCatalog.v1';
  const LEGACY_ROUTE_STATE_KEY = `manatos.debug.apiTraffic.routes.v1.${bootId}`;
  const COLUMN_STATE_KEY = `manatos.debug.apiTraffic.columns.v1.${bootId}`;
  // Counts survive full-page navigation but remain tied to the UI boot id.
  // A server/system restart therefore gets a fresh key automatically.
  const ROUTE_COUNT_STATE_KEY = `manatos.debug.apiTraffic.routeCounts.v1.${bootId}`;

  const readState = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  };
  const saved = readState();
  const readSessionObject = (key) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  };
  const savedRouteCounts = readSessionObject(ROUTE_COUNT_STATE_KEY);
  const readLocalArray = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };
  const readLocalObject = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  };
  const savedColumns = readLocalObject(COLUMN_STATE_KEY);
  const state = {
    entries: [],
    paused: saved.paused === true,
    errorsOnly: saved.errorsOnly === true,
    lastId: null,
    selectedId: typeof saved.selectedId === 'string' ? saved.selectedId : null,
    detailTab: saved.detailTab === 'response' ? 'response' : 'request',
    hiddenRoutes: new Set((() => {
      const current = readLocalArray(ROUTE_STATE_KEY);
      return current.length ? current : readLocalArray(LEGACY_ROUTE_STATE_KEY);
    })()),
    knownRoutes: new Set(readLocalArray(ROUTE_CATALOG_KEY)),
    // Boot-scoped counters live in sessionStorage, never durable localStorage.
    // Persisting seen request ids prevents a full page navigation from counting
    // the diagnostic store's existing rows a second time.
    routeCounts: new Map(
      Object.entries(savedRouteCounts.counts || {}).filter(([, count]) => Number.isFinite(Number(count))),
    ),
    countedEntryIds: new Set(
      Array.isArray(savedRouteCounts.seenIds) ? savedRouteCounts.seenIds.filter((id) => typeof id === 'string') : [],
    ),
    textFilter: typeof saved.textFilter === 'string' ? saved.textFilter : '',
    consecutiveFailures: 0,
    pollingSuspended: false,
    pollInFlight: false,
  };

  const persistState = () => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        paused: state.paused,
        errorsOnly: state.errorsOnly,
        selectedId: state.selectedId,
        detailTab: state.detailTab,
        textFilter: String(filter?.value || ''),
      }));
    } catch { /* debugger state must never affect application behavior */ }
  };

  const persistRouteState = () => {
    try {
      localStorage.setItem(ROUTE_STATE_KEY, JSON.stringify([...state.hiddenRoutes]));
      localStorage.setItem(ROUTE_CATALOG_KEY, JSON.stringify([...state.knownRoutes]));
    } catch { /* debugger only */ }
  };

  const persistRouteCounts = () => {
    try {
      sessionStorage.setItem(ROUTE_COUNT_STATE_KEY, JSON.stringify({
        counts: Object.fromEntries(state.routeCounts),
        seenIds: [...state.countedEntryIds],
      }));
    } catch { /* boot-scoped debugger telemetry must never affect the application */ }
  };

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const pretty = (value) => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } };
  const compactPath = (path) => String(path).replace(/^\/api\/v1(?:\/|$)/, './');

  /**
   * Render a compact API path while emphasizing only its SysBO/resource segment.
   * IDs, query strings and operation suffixes intentionally remain normal weight.
   */
  const resourcePathHtml = (path) => {
    const compact = compactPath(path);
    const match = compact.match(/^(\.\/(?:internal\/)?)((?:Sys)[^/?]+\/)(.*)$/);
    if (!match) return escapeHtml(compact);
    return `${escapeHtml(match[1])}<strong>${escapeHtml(match[2])}</strong>${escapeHtml(match[3])}`;
  };

  /**
   * Stable display/filter key for one kind of API call. Volatile entity ids and
   * query strings must not create hundreds of checkboxes for the same route.
   */
  const routeKey = (entry) => {
    const raw = String(entry.path || '').split('?')[0];
    const normalized = compactPath(raw)
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, '{id}')
      .replace(/\/[0-9]+(?=\/|$)/g, '/{id}');
    return `${String(entry.method || 'GET').toUpperCase()} ${normalized}`;
  };

  const selectedEntry = () => state.entries.find((entry) => entry.id === state.selectedId) || null;

  const observeRoutes = (entries) => {
    let changed = false;
    for (const entry of entries) {
      const key = routeKey(entry);
      if (!state.knownRoutes.has(key)) {
        state.knownRoutes.add(key);
        changed = true;
      }
    }
    if (changed) persistRouteState();
  };

  const countTraffic = (entries) => {
    let changed = false;
    for (const entry of entries) {
      if (!entry?.id || state.countedEntryIds.has(entry.id)) continue;
      const key = routeKey(entry);
      state.countedEntryIds.add(entry.id);
      state.routeCounts.set(key, Number(state.routeCounts.get(key) || 0) + 1);
      changed = true;
    }
    if (changed) persistRouteCounts();
  };

  const routeCounts = () => {
    const counts = new Map();
    for (const key of state.knownRoutes) counts.set(key, Number(state.routeCounts.get(key) || 0));
    for (const [key, count] of state.routeCounts) {
      if (!counts.has(key)) counts.set(key, Number(count) || 0);
    }
    return counts;
  };

  const knownRouteKeys = () => {
    observeRoutes(state.entries);
    const counts = routeCounts();
    return [...state.knownRoutes].sort((a, b) => {
      const countDifference = (counts.get(b) || 0) - (counts.get(a) || 0);
      return countDifference || a.localeCompare(b);
    });
  };

  const visibleEntries = () => {
    const q = String(filter?.value || '').trim().toLowerCase();
    return state.entries.filter((entry) => {
      if (state.errorsOnly && entry.ok) return false;
      if (state.hiddenRoutes.has(routeKey(entry))) return false;
      if (!q) return true;
      return `${entry.method} ${entry.path} ${entry.status ?? ''} ${entry.requestId}`.toLowerCase().includes(q);
    });
  };

  const renderRouteMenu = () => {
    if (!routeMenuList) return;
    const keys = knownRouteKeys();
    const counts = routeCounts();
    routeMenuList.replaceChildren();
    if (!keys.length) {
      routeMenuList.innerHTML = '<div class="api-traffic-route-empty">No API calls have been discovered yet.</div>';
      return;
    }

    let insertedInactiveSeparator = false;
    for (const key of keys) {
      const count = counts.get(key) || 0;
      if (count === 0 && !insertedInactiveSeparator && keys.some((candidate) => (counts.get(candidate) || 0) > 0)) {
        const separator = document.createElement('div');
        separator.className = 'api-traffic-route-separator';
        separator.setAttribute('role', 'separator');
        separator.setAttribute('aria-label', 'API calls with no traffic in this window');
        routeMenuList.appendChild(separator);
        insertedInactiveSeparator = true;
      }

      const label = document.createElement('label');
      label.className = 'api-traffic-route-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !state.hiddenRoutes.has(key);
      input.addEventListener('change', () => {
        if (input.checked) state.hiddenRoutes.delete(key); else state.hiddenRoutes.add(key);
        persistRouteState();
        persistState();
        render();
      });

      const firstSpace = key.indexOf(' ');
      const method = firstSpace > 0 ? key.slice(0, firstSpace) : '';
      const path = firstSpace > 0 ? key.slice(firstSpace + 1) : key;
      const call = document.createElement('span');
      call.className = 'api-traffic-route-call';
      const methodPart = document.createElement('span');
      methodPart.className = 'api-traffic-route-method';
      methodPart.textContent = method;
      const pathPart = document.createElement('span');
      pathPart.className = 'api-traffic-route-path';
      pathPart.innerHTML = resourcePathHtml(path);
      call.append(methodPart, document.createTextNode(' '), pathPart);

      const counter = document.createElement('span');
      counter.className = `api-traffic-route-count${count > 0 ? ' is-active' : ''}`;
      counter.textContent = String(count);
      counter.title = `${count} call${count === 1 ? '' : 's'} in this window`;
      label.append(input, call, counter);
      routeMenuList.appendChild(label);
    }
  };

  const renderDetails = () => {
    const entry = selectedEntry();
    if (!details || !detailsBody || !detailsTitle || !entry) {
      details?.classList.add('d-none');
      return;
    }
    details.classList.remove('d-none');
    detailsTitle.textContent = `${entry.method} ${compactPath(entry.path)}`;
    requestTab?.classList.toggle('is-active', state.detailTab === 'request');
    responseTab?.classList.toggle('is-active', state.detailTab === 'response');
    requestTab?.setAttribute('aria-selected', String(state.detailTab === 'request'));
    responseTab?.setAttribute('aria-selected', String(state.detailTab === 'response'));

    const meta = `<dl class="api-traffic-meta">
      <dt>Status</dt><dd>${escapeHtml(entry.status ?? 'network error')}</dd>
      <dt>Duration</dt><dd>${escapeHtml(entry.durationMs)} ms</dd>
      <dt>Started</dt><dd>${escapeHtml(entry.startedAt)}</dd>
      <dt>Request ID</dt><dd>${escapeHtml(entry.requestId)}</dd>
    </dl>`;
    if (state.detailTab === 'request') {
      detailsBody.innerHTML = `${meta}${entry.requestBody === undefined ? '<div class="api-traffic-empty">No request body.</div>' : `<pre>${escapeHtml(pretty(entry.requestBody))}</pre>`}`;
    } else {
      detailsBody.innerHTML = `${meta}${entry.error ? `<pre>${escapeHtml(entry.error)}</pre>` : ''}${entry.responseBody === undefined ? '<div class="api-traffic-empty">No response body.</div>' : `<pre>${escapeHtml(pretty(entry.responseBody))}</pre>`}`;
    }
  };

  const render = () => {
    const entries = visibleEntries();
    if (stats) stats.textContent = `${state.entries.length} request${state.entries.length === 1 ? '' : 's'}`;
    renderDetails();
    if (routeMenu && !routeMenu.classList.contains('d-none')) renderRouteMenu();
    list.replaceChildren();
    if (!entries.length) {
      list.innerHTML = '<div class="api-traffic-empty">No captured API traffic matches the current filters.</div>';
      return;
    }
    // Store order is chronological; developer presentation is always newest first.
    for (const entry of [...entries].reverse()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `api-traffic-row${entry.id === state.selectedId ? ' is-selected' : ''}${entry.ok ? '' : ' is-error'}`;
      row.setAttribute('role', 'listitem');
      const time = new Date(entry.startedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const path = compactPath(entry.path);
      row.innerHTML = `<span class="api-traffic-time">${escapeHtml(time)}</span><strong class="api-traffic-method">${escapeHtml(entry.method)}</strong><span class="api-traffic-path" title="${escapeHtml(entry.path)}">${resourcePathHtml(path)}</span><span class="api-traffic-status">${escapeHtml(entry.status ?? 'ERR')}</span><span class="api-traffic-duration">${escapeHtml(entry.durationMs)} ms</span>`;
      row.addEventListener('click', () => {
        state.selectedId = entry.id;
        persistState();
        render();
      });
      list.appendChild(row);
    }
  };

  const poll = async () => {
    if (state.paused || state.pollingSuspended || state.pollInFlight ||
        window.ManatOSConnectivity?.unavailable === true || panel.classList.contains('d-none')) return;

    /*
     * Polls are deliberately sequential. setInterval may fire again while a
     * network request is still pending; without this guard, stopping the server
     * can leave many concurrent fetches that all fail afterwards and flood
     * DevTools even though the outage threshold is only three calls.
     */
    state.pollInFlight = true;
    try {
      const query = state.lastId ? `?after=${encodeURIComponent(state.lastId)}` : '';
      let response;
      try {
        response = await fetch(`/bo/debug/api-traffic${query}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      } catch (error) {
        window.ManatOSConnectivity?.reportFailure?.('api-traffic');
        throw error;
      }
      // HTTP errors are server responses, not transport outages.
      window.ManatOSConnectivity?.reportSuccess?.('api-traffic');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const incoming = Array.isArray(payload.entries) ? payload.entries : [];
      if (!state.lastId) state.entries = incoming; else state.entries.push(...incoming);
      observeRoutes(incoming);
      countTraffic(incoming);
      if (state.entries.length > 500) state.entries.splice(0, state.entries.length - 500);
      if (incoming.length) state.lastId = incoming.at(-1).id;
      state.consecutiveFailures = 0;
      // Preserve selection across polling and full navigation. If the selected
      // record fell out of the bounded server buffer, close details explicitly.
      if (state.selectedId && !selectedEntry() && state.entries.length >= 500) state.selectedId = null;
      persistState();
      render();
    } catch {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= 3 || window.ManatOSConnectivity?.unavailable === true) {
        state.pollingSuspended = true;
      }
    } finally {
      state.pollInFlight = false;
    }
  };

  const resumePolling = () => {
    if (!state.pollingSuspended || state.paused || panel.classList.contains('d-none')) return;
    state.pollingSuspended = false;
    state.consecutiveFailures = 0;
    void poll();
  };


  pause?.classList.toggle('is-active', state.paused);
  pause?.setAttribute('aria-pressed', String(state.paused));
  pause?.querySelector('i')?.classList.toggle('bi-play', state.paused);
  pause?.querySelector('i')?.classList.toggle('bi-pause', !state.paused);
  errors?.classList.toggle('is-active', state.errorsOnly);
  errors?.setAttribute('aria-pressed', String(state.errorsOnly));
  if (filter) filter.value = state.textFilter;

  pause?.addEventListener('click', () => {
    state.paused = !state.paused;
    pause.classList.toggle('is-active', state.paused);
    pause.setAttribute('aria-pressed', String(state.paused));
    pause.querySelector('i')?.classList.toggle('bi-play', state.paused);
    pause.querySelector('i')?.classList.toggle('bi-pause', !state.paused);
    persistState();
    if (!state.paused) { state.pollingSuspended = false; void poll(); }
  });
  errors?.addEventListener('click', () => {
    state.errorsOnly = !state.errorsOnly;
    errors.classList.toggle('is-active', state.errorsOnly);
    errors.setAttribute('aria-pressed', String(state.errorsOnly));
    persistState();
    render();
  });
  filter?.addEventListener('input', () => { persistState(); render(); });
  requestTab?.addEventListener('click', () => { state.detailTab = 'request'; persistState(); renderDetails(); });
  responseTab?.addEventListener('click', () => { state.detailTab = 'response'; persistState(); renderDetails(); });
  detailsClose?.addEventListener('click', () => { state.selectedId = null; persistState(); render(); });

  const positionRouteMenu = () => {
    if (!routeMenu || !routesButton || routeMenu.classList.contains('d-none')) return;
    if (routeMenu.parentElement !== document.body) document.body.appendChild(routeMenu);
    const anchor = routesButton.getBoundingClientRect();
    const menuWidth = Math.min(448, Math.max(280, window.innerWidth - 16));
    routeMenu.style.width = `${menuWidth}px`;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, anchor.right - menuWidth));
    routeMenu.style.left = `${Math.round(left)}px`;
    routeMenu.style.top = `${Math.round(Math.min(window.innerHeight - 16, anchor.bottom + 4))}px`;
  };

  routesButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = routeMenu?.classList.contains('d-none') ?? true;
    routeMenu?.classList.toggle('d-none', !open);
    routesButton.setAttribute('aria-expanded', String(open));
    if (open) { renderRouteMenu(); requestAnimationFrame(positionRouteMenu); }
  });
  window.addEventListener('resize', positionRouteMenu);
  routeMenu?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
    routeMenu?.classList.add('d-none');
    routesButton?.setAttribute('aria-expanded', 'false');
  });
  routeMenu?.querySelector('[data-api-routes-all]')?.addEventListener('click', () => {
    state.hiddenRoutes.clear(); persistRouteState(); persistState(); render(); renderRouteMenu();
  });
  routeMenu?.querySelector('[data-api-routes-none]')?.addEventListener('click', () => {
    state.hiddenRoutes = new Set(knownRouteKeys()); persistRouteState(); persistState(); render(); renderRouteMenu();
  });

  clear?.addEventListener('click', async () => {
    try {
      await fetch('/bo/debug/api-traffic/clear', {
        method: 'POST', headers: { Accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ _csrf: csrf }),
      });
    } catch { /* local reset still proceeds */ }
    state.entries = [];
    state.lastId = null;
    state.selectedId = null;
    // Clear only the visible/captured request buffer. Route counters are
    // intentionally boot-lifetime telemetry and therefore continue until the
    // ManatOS UI boot id changes on a system/server restart.
    persistState();
    render();
  });

  window.addEventListener('manatos:api-traffic-visible', (event) => {
    if (event.detail?.visible) {
      state.pollingSuspended = false;
      state.consecutiveFailures = 0;
      void poll();
    }
  });
  // Recovery is explicit/environmental, not tied to every user gesture. Once
  // suspended, an offline UI server therefore cannot flood DevTools while the
  // developer keeps interacting with the still-loaded page.
  window.addEventListener('online', resumePolling);

  // Outer dock resizing is owned once by the shared Developer Tools dock.

  // Persisted, user-resizable request-list columns. Widths are deliberately
  // presentation-only and boot-scoped, just like the debugger's other sizing
  // preferences. A reset is available by double-clicking a column separator.
  const columnDefaults = { time: 75, method: 56, path: 220, status: 52, duration: 68 };
  const columnMin = { time: 54, method: 48, path: 100, status: 46, duration: 58 };
  const applyColumnWidths = () => {
    if (!columns) return;
    for (const [name, fallback] of Object.entries(columnDefaults)) {
      const savedWidth = Number(savedColumns[name]);
      const width = Number.isFinite(savedWidth) ? Math.max(columnMin[name], savedWidth) : fallback;
      document.documentElement.style.setProperty(`--api-traffic-col-${name}`, `${Math.round(width)}px`);
    }
  };
  const persistColumnWidths = () => {
    const next = {};
    for (const name of Object.keys(columnDefaults)) {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(`--api-traffic-col-${name}`);
      next[name] = Math.round(Number.parseFloat(raw) || columnDefaults[name]);
    }
    try { localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(next)); } catch { /* debugger only */ }
  };
  applyColumnWidths();
  columns?.querySelectorAll('[data-api-traffic-column-resize]').forEach((handle) => {
    let startX = 0;
    let startWidth = 0;
    const name = handle.getAttribute('data-api-traffic-column-resize');
    if (!name || !(name in columnDefaults)) return;
    handle.addEventListener('pointerdown', (event) => {
      const cell = handle.closest('[data-api-traffic-column]');
      if (!(cell instanceof HTMLElement)) return;
      startX = event.clientX;
      startWidth = cell.getBoundingClientRect().width;
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!handle.hasPointerCapture?.(event.pointerId)) return;
      const width = Math.max(columnMin[name], startWidth + event.clientX - startX);
      document.documentElement.style.setProperty(`--api-traffic-col-${name}`, `${Math.round(width)}px`);
    });
    handle.addEventListener('pointerup', (event) => {
      handle.releasePointerCapture?.(event.pointerId);
      persistColumnWidths();
    });
    handle.addEventListener('dblclick', (event) => {
      document.documentElement.style.setProperty(`--api-traffic-col-${name}`, `${columnDefaults[name]}px`);
      persistColumnWidths();
      event.preventDefault();
      event.stopPropagation();
    });
  });

  let pollTimer = null;
  window.addEventListener('manatos:system-unavailable', () => {
    state.pollingSuspended = true;
    state.consecutiveFailures = Math.max(state.consecutiveFailures, 3);
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = null;
  });

  render();
  void poll();
  pollTimer = window.setInterval(() => { void poll(); }, 1000);
  window.__manatosApiTrafficRuntime = {
    dispose: () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      pollTimer = null;
    },
  };
})();
