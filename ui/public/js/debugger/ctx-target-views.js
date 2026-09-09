(() => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  const dock = document.getElementById('developerToolsDock');
  const body = dock?.querySelector('.developer-tools-body');
  const strip = dock?.querySelector('.developer-tools-tab-strip');
  const tabAnchor = document.getElementById('developerToolsCtxViewTabAnchor');
  const overflowToggle = document.getElementById('developerToolsTabOverflowToggle');
  const overflowMenu = document.getElementById('developerToolsTabOverflowMenu');
  if (!runtime?.value || !dock || !body || !strip || !tabAnchor) return;

  const STATE_KEY = 'manatos.debug.ctx.targetViews.v2';
  const ORDER_KEY = 'manatos.debug.toolTabs.order.v2';
  const ACTIVE_TAB_KEY = 'manatos.debug.activeTab.v1';
  const CHANGE_EVENT = runtime.eventName || 'manatos:ctx-change';
  const views = new Map();
  let sequence = 0;

  const isObject = (value) => value !== null && typeof value === 'object';
  const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const UI_SURFACE_HOSTS = new Set(['page', 'popup']);
  const UI_SURFACE_KINDS = new Set(['static', 'list', 'entry', 'selector', 'hierarchy', 'custom']);
  const UI_SURFACE_MODES = new Set(['browse', 'create', 'edit', 'view', 'select', 'manage']);
  const isUiSurfaceLevel = (value) =>
    isObject(value) &&
    typeof value.id === 'string' &&
    UI_SURFACE_HOSTS.has(value.host) &&
    UI_SURFACE_KINDS.has(value.kind) &&
    UI_SURFACE_MODES.has(value.mode) &&
    typeof value.name === 'string';

  const nodeNameFromPath = (path) => {
    const semantic = path.match(/\[(?:"([^"]+)"|'([^']+)')\]$/);
    if (semantic) return semantic[1] || semantic[2];
    const indexed = path.match(/\[(\d+)\]$/);
    if (indexed) return `[${indexed[1]}]`;
    return path.split('.').at(-1) || path;
  };

  const appendPath = (path, key) =>
    identifier.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

  const collectionMemberKey = (value) => {
    if (!isObject(value)) return null;
    for (const candidate of [value.id, value.key]) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return null;
  };

  const getRealValue = (path) => {
    if (path === 'ctx') return runtime.value;
    try {
      return runtime.get(path);
    } catch {
      return undefined;
    }
  };

  const metadataForField = (path) => {
    const fieldPath = path.replace(/\.metadata\(\)$/, '');
    const marker = '.fields.';
    const index = fieldPath.lastIndexOf(marker);
    if (index < 0) return undefined;
    const ownerPath = fieldPath.slice(0, index);
    const fieldTail = fieldPath.slice(index + marker.length);
    if (fieldTail.includes('.') || fieldTail.includes('[')) return undefined;

    let entityName = null;
    if (ownerPath === 'ctx.user') {
      entityName = runtime.value.user?.entityName ?? null;
    } else if (ownerPath.startsWith('ctx.ui.level')) {
      let candidatePath = ownerPath;
      while (candidatePath.startsWith('ctx.ui.level')) {
        const entityKey = getRealValue(candidatePath)?.entityKey;
        if (typeof entityKey === 'string' && entityKey) {
          entityName =
            Object.keys(runtime.value.entities || {}).find(
              (key) => runtime.value.entities?.[key]?.key === entityKey || key === entityKey,
            ) ?? null;
          break;
        }
        if (!candidatePath.endsWith('.level')) break;
        candidatePath = candidatePath.slice(0, -6);
      }
    }
    return entityName
      ? runtime.value.entities?.[entityName]?.metadata?.fieldDefinition?.[fieldTail]
      : undefined;
  };

  const valueAt = (path) =>
    path.endsWith('.metadata()') ? metadataForField(path) : getRealValue(path);

  const childEntries = (path, value) => {
    if (!isObject(value)) return [];
    const virtual = [];
    const fieldMetadata = metadataForField(path);
    if (fieldMetadata !== undefined)
      virtual.push({ key: 'metadata()', path: `${path}.metadata()`, value: fieldMetadata });

    if (Array.isArray(value)) {
      const semanticKeys = value.map(collectionMemberKey);
      const members = value.map((child, index) => {
        const semanticKey = semanticKeys[index];
        const uniqueSemanticKey =
          semanticKey && semanticKeys.filter((candidate) => candidate === semanticKey).length === 1
            ? semanticKey
            : null;
        return {
          key: uniqueSemanticKey || `[${index}]`,
          path: uniqueSemanticKey ? appendPath(path, uniqueSemanticKey) : `${path}[${index}]`,
          value: child,
        };
      });
      return [...virtual, ...members];
    }

    const members = Object.entries(value)
      .filter(([key]) => !(typeof value.expression === 'string' && key === 'ast'))
      .map(([key, child]) => ({ key, path: appendPath(path, key), value: child }));
    return [...virtual, ...members];
  };

  const displayValue = (value) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'function') return 'ƒ';
    if (isObject(value)) return Array.isArray(value) ? `Array(${value.length})` : '{…}';
    return String(value);
  };

  const iconFor = (value) => {
    if (Array.isArray(value)) return 'bi-list-ul';
    if (isObject(value)) return 'bi-braces';
    if (typeof value === 'boolean') return 'bi-toggle-on';
    if (typeof value === 'number') return 'bi-hash';
    if (value === null || value === undefined) return 'bi-dash-circle';
    return 'bi-fonts';
  };

  const readJson = (key, fallback) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };

  const captureScrollState = (view) => {
    const tree = view.tree;
    if (!tree) return { scrollTop: 0, scrollAnchorPath: null, scrollAnchorOffset: 0 };
    const treeRect = tree.getBoundingClientRect();
    const rows = [...tree.querySelectorAll('.ctx-debug-row[data-ctx-path]')];
    if (!rows.length) {
      return {
        scrollTop: Number(view.scrollTop) || 0,
        scrollAnchorPath: view.scrollAnchorPath || null,
        scrollAnchorOffset: Number(view.scrollAnchorOffset) || 0,
      };
    }
    const anchor = rows.find((row) => row.getBoundingClientRect().bottom > treeRect.top);
    return {
      scrollTop: tree.scrollTop || 0,
      scrollAnchorPath: anchor?.dataset.ctxPath || null,
      scrollAnchorOffset: anchor ? anchor.getBoundingClientRect().top - treeRect.top : 0,
    };
  };

  const restoreScrollState = (view) => {
    const tree = view.tree;
    if (!tree) return;
    const anchorPath = view.scrollAnchorPath;
    const anchor = anchorPath
      ? [...tree.querySelectorAll('.ctx-debug-row[data-ctx-path]')].find(
          (row) => row.dataset.ctxPath === anchorPath,
        )
      : null;
    if (anchor) {
      const treeRect = tree.getBoundingClientRect();
      const currentOffset = anchor.getBoundingClientRect().top - treeRect.top;
      tree.scrollTop += currentOffset - (Number(view.scrollAnchorOffset) || 0);
      return;
    }
    const maxScroll = Math.max(0, tree.scrollHeight - tree.clientHeight);
    tree.scrollTop = Math.min(Math.max(0, Number(view.scrollTop) || 0), maxScroll);
  };

  const serializeViews = () => {
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify(
          [...views.values()].map((view) => {
            const scroll = captureScrollState(view);
            Object.assign(view, scroll);
            return {
              id: view.id,
              path: view.path,
              selected: view.selected,
              expanded: [...view.expanded],
              history: view.history,
              historyIndex: view.historyIndex,
              propertiesOpen: view.propertiesOpen,
              propertiesHeight: view.propertiesHeight,
              scrollTop: scroll.scrollTop,
              scrollAnchorPath: scroll.scrollAnchorPath,
              scrollAnchorOffset: scroll.scrollAnchorOffset,
            };
          }),
        ),
      );
    } catch {
      /* debugger state must never affect application behavior */
    }
  };

  const tabItemKey = (item) =>
    item?.querySelector?.('[data-developer-tool-tab]')?.dataset.developerToolTab ||
    item?.dataset?.developerToolTab ||
    null;
  const tabItems = () =>
    [...strip.children].filter((child) => child !== tabAnchor && tabItemKey(child));

  const persistOrder = () => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(tabItems().map(tabItemKey).filter(Boolean)));
    } catch {
      /* debugger only */
    }
    refreshOverflowAffordance();
  };

  const applyPersistedOrder = () => {
    const order = readJson(ORDER_KEY, []);
    if (!Array.isArray(order) || !order.length) return;
    const byKey = new Map(tabItems().map((item) => [tabItemKey(item), item]));
    for (const key of order) {
      const item = byKey.get(key);
      if (item) strip.insertBefore(item, tabAnchor);
    }
    for (const item of byKey.values()) {
      if (!order.includes(tabItemKey(item))) strip.insertBefore(item, tabAnchor);
    }
  };

  const closeOverflowMenu = () => {
    overflowMenu?.classList.add('d-none');
    overflowToggle?.setAttribute('aria-expanded', 'false');
  };

  const tabCaption = (item) =>
    item?.querySelector?.('.developer-tools-tab-caption')?.textContent?.trim() ||
    item?.querySelector?.('[data-developer-tool-tab]')?.textContent?.trim() ||
    tabItemKey(item) ||
    'Developer Tool';

  const renderOverflowMenu = () => {
    if (!overflowMenu) return;
    overflowMenu.replaceChildren();
    const activeKey = document.documentElement.dataset.manatosDebugTab || 'ctx';
    for (const item of tabItems()) {
      const key = tabItemKey(item);
      if (!key) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `developer-tools-tab-overflow-item${key === activeKey ? ' is-active' : ''}`;
      button.setAttribute('role', 'menuitem');
      button.title = item.querySelector?.('[data-developer-tool-tab]')?.title || tabCaption(item);
      const indicator = document.createElement('i');
      indicator.className = `bi ${key === activeKey ? 'bi-check2' : 'bi-dot'}`;
      indicator.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('span');
      caption.className = 'developer-tools-tab-overflow-item-caption';
      caption.textContent = tabCaption(item);
      button.append(indicator, caption);
      button.addEventListener('click', () => {
        selectToolTab(key);
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        closeOverflowMenu();
      });
      overflowMenu.appendChild(button);
    }
  };

  const refreshOverflowAffordance = () => {
    if (!overflowToggle) return;
    const overflowing = strip.scrollWidth > strip.clientWidth + 2;
    overflowToggle.classList.toggle('d-none', !overflowing);
    if (!overflowing) closeOverflowMenu();
    else if (!overflowMenu?.classList.contains('d-none')) renderOverflowMenu();
  };

  let draggedItem = null;
  const makeDraggable = (item) => {
    if (!item || item.dataset.debugTabDraggable === 'true') return;
    item.dataset.debugTabDraggable = 'true';
    item.draggable = true;
    item.addEventListener('dragstart', (event) => {
      draggedItem = item;
      item.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', tabItemKey(item) || '');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      draggedItem = null;
      persistOrder();
    });
  };

  strip.addEventListener('dragover', (event) => {
    if (!draggedItem) return;
    event.preventDefault();
    const target =
      event.target instanceof Element
        ? event.target.closest('[data-debug-tab-draggable="true"]')
        : null;
    if (!target || target === draggedItem || target.parentElement !== strip) return;
    const rect = target.getBoundingClientRect();
    const before = event.clientX < rect.left + rect.width / 2;
    strip.insertBefore(draggedItem, before ? target : target.nextSibling);
  });

  const selectToolTab = (tab) =>
    window.dispatchEvent(new CustomEvent('manatos:developer-tool-tab-select', { detail: { tab } }));

  const pushHistory = (view, path) => {
    if (view.history[view.historyIndex] === path) return;
    view.history = view.history.slice(0, view.historyIndex + 1);
    view.history.push(path);
    view.historyIndex = view.history.length - 1;
  };

  const updateHistoryButtons = (view) => {
    view.back.disabled = view.historyIndex <= 0;
    view.forward.disabled = view.historyIndex < 0 || view.historyIndex >= view.history.length - 1;
  };

  const renderProperties = (view) => {
    if (!view.propertiesOpen) return;
    const value = valueAt(view.selected);
    const description = runtime.describe?.(view.selected) || {};
    view.propertiesTitle.textContent = view.selected;
    const rows = [
      ['Path', view.selected],
      ['Kind', description.kind || (isObject(value) ? 'container' : 'value')],
      [
        'Type',
        description.type ||
          (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value),
      ],
      [
        'Attributes',
        Array.isArray(description.attributes) ? description.attributes.join(', ') : '',
      ],
      ['Watchable', description.watchable === false ? 'no' : 'yes'],
      ['Subscribers', description.subscribers ? `${description.subscribers.total ?? 0} total` : ''],
      ['Value', displayValue(value)],
      ['Children', isObject(value) ? String(childEntries(view.selected, value).length) : '0'],
    ];
    view.propertiesBody.replaceChildren();
    for (const [label, text] of rows) {
      const row = document.createElement('div');
      row.className = 'ctx-debug-property-row';
      const key = document.createElement('span');
      key.className = 'ctx-debug-property-label';
      key.textContent = label;
      const val = document.createElement('span');
      val.className = 'ctx-debug-property-value';
      val.textContent = text;
      row.append(key, val);
      view.propertiesBody.appendChild(row);
    }
  };

  const renderView = (view) => {
    const rootValue = valueAt(view.path);
    const selection = view.selection;
    view.rootPath.textContent = view.path;
    view.rootPath.title = view.path;
    view.availability.textContent = rootValue === undefined ? 'NOT PRESENT' : 'LIVE';
    view.availability.classList.toggle('is-missing', rootValue === undefined);
    updateHistoryButtons(view);

    if (rootValue === undefined) {
      view.tree.replaceChildren();
      const missing = document.createElement('div');
      missing.className = 'ctx-target-view-missing';
      missing.textContent = `Variable not found in CTX: ${view.path}`;
      view.tree.appendChild(missing);
      selection.textContent = nodeNameFromPath(view.path);
      selection.title = view.path;
      renderProperties(view);
      return;
    }

    if (valueAt(view.selected) === undefined) view.selected = view.path;

    const renderNode = ({ key, path, value }) => {
      const node = document.createElement('div');
      node.className = 'ctx-debug-node';
      const row = document.createElement('div');
      row.className = `ctx-debug-row${view.selected === path ? ' is-selected' : ''}`;
      row.dataset.ctxPath = path;
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-selected', String(view.selected === path));

      const children = childEntries(path, value);
      const expandable = children.length > 0;
      const expanded = expandable && view.expanded.has(path);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ctx-debug-toggle';
      toggle.textContent = expandable ? (expanded ? '[-]' : '[+]') : '·';
      toggle.disabled = !expandable;
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!expandable) return;
        if (view.expanded.has(path)) view.expanded.delete(path);
        else view.expanded.add(path);
        serializeViews();
        renderView(view);
      });
      row.appendChild(toggle);

      const icon = document.createElement('i');
      icon.className = `ctx-debug-node-icon bi ${iconFor(value)}`;
      icon.setAttribute('aria-hidden', 'true');
      row.appendChild(icon);

      const keyElement = document.createElement('span');
      keyElement.className = 'ctx-debug-key';
      keyElement.textContent = key;
      row.appendChild(keyElement);

      if (isUiSurfaceLevel(value)) {
        const badge = document.createElement('span');
        badge.className = 'ctx-debug-ui-level-badge';
        badge.textContent = `${String(value.host).toUpperCase()} · ${String(value.kind).toUpperCase()} · ${value.name}`;
        row.appendChild(badge);
      }
      if (!isObject(value)) {
        const valueElement = document.createElement('span');
        valueElement.className = 'ctx-debug-value';
        valueElement.textContent = `= ${displayValue(value)}`;
        row.appendChild(valueElement);
      }

      row.addEventListener('click', () => {
        view.selected = path;
        pushHistory(view, path);
        selection.textContent = nodeNameFromPath(path);
        selection.title = path;
        serializeViews();
        renderView(view);
      });
      node.appendChild(row);
      if (expanded) {
        const childContainer = document.createElement('div');
        childContainer.className = 'ctx-debug-children';
        children.forEach((child) => childContainer.appendChild(renderNode(child)));
        node.appendChild(childContainer);
      }
      return node;
    };

    const scrollState = captureScrollState(view);
    Object.assign(view, scrollState);
    view.tree.replaceChildren(
      renderNode({ key: nodeNameFromPath(view.path), path: view.path, value: rootValue }),
    );
    restoreScrollState(view);
    selection.textContent = nodeNameFromPath(view.selected);
    selection.title = view.selected;
    renderProperties(view);
  };

  const closeView = (id) => {
    const view = views.get(id);
    if (!view) return;
    const wasActive = document.documentElement.dataset.manatosDebugTab === view.tabKey;
    view.tabWrap.remove();
    view.panel.remove();
    views.delete(id);
    serializeViews();
    persistOrder();
    if (wasActive) selectToolTab('ctx');
  };

  const createView = ({
    id,
    path,
    selected = path,
    expanded = [path],
    history = null,
    historyIndex = null,
    propertiesOpen = false,
    propertiesHeight = 256,
    scrollTop = 0,
    scrollAnchorPath = null,
    scrollAnchorOffset = 0,
    activate = true,
    sourceTab = 'ctx',
  }) => {
    if (typeof path !== 'string' || !path) return null;
    const existing = [...views.values()].find((view) => view.path === path);
    if (existing) {
      if (activate) selectToolTab(existing.tabKey);
      return existing;
    }

    const viewId = id || `v${Date.now().toString(36)}-${(++sequence).toString(36)}`;
    const tabKey = `ctxView:${viewId}`;
    const title = `'${nodeNameFromPath(path)}' view`;
    const tabWrap = document.createElement('div');
    tabWrap.className = 'developer-tools-target-tab-wrap';

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'developer-tools-tab developer-tools-target-tab';
    tab.dataset.developerToolTab = tabKey;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-controls', `ctxTargetViewPanel-${viewId}`);
    tab.title = path;
    const caption = document.createElement('span');
    caption.className = 'developer-tools-tab-caption';
    caption.textContent = title;
    tab.appendChild(caption);
    tab.addEventListener('click', () => selectToolTab(tabKey));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'developer-tools-target-tab-close';
    close.setAttribute('aria-label', `Close ${title}`);
    close.title = 'Close view';
    close.textContent = '×';
    close.addEventListener('click', () => closeView(viewId));
    tabWrap.append(tab, close);

    const sourceButton = dock.querySelector(`[data-developer-tool-tab="${CSS.escape(sourceTab)}"]`);
    const sourceItem = sourceButton?.closest('.developer-tools-target-tab-wrap') || sourceButton;
    const insertBefore = sourceItem?.nextElementSibling || tabAnchor;
    strip.insertBefore(tabWrap, insertBefore);
    makeDraggable(tabWrap);

    const panel = document.createElement('aside');
    panel.id = `ctxTargetViewPanel-${viewId}`;
    panel.className = 'ctx-target-view-panel d-none';
    panel.dataset.developerToolPanel = tabKey;
    panel.setAttribute('aria-label', `CTX targeted view ${path}`);
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    panel.innerHTML = `
      <div class="ctx-target-view-path-row">
        <code class="ctx-target-view-root"></code>
        <span class="ctx-target-view-availability"></span>
      </div>
      <div class="debug-panel-tools" role="toolbar" aria-label="Targeted CTX view controls">
        <button class="debug-tool-button ctx-target-view-back" type="button" title="Previous selection" aria-label="Previous selection"><i class="bi bi-arrow-left"></i></button>
        <button class="debug-tool-button ctx-target-view-forward" type="button" title="Next selection" aria-label="Next selection"><i class="bi bi-arrow-right"></i></button>
        <button class="debug-tool-button ctx-target-view-properties" type="button" title="Selected node properties" aria-label="Selected node properties"><i class="bi bi-info-square"></i></button>
        <button class="debug-tool-button ctx-target-view-copy-path" type="button" title="Copy selected CTX path" aria-label="Copy selected CTX path"><i class="bi bi-copy"></i></button>
        <button class="debug-tool-button ctx-target-view-copy-value" type="button" title="Copy selected CTX value" aria-label="Copy selected CTX value"><i class="bi bi-clipboard-data"></i></button>
        <button class="debug-tool-button ctx-target-view-open" type="button" title="Open selected node in another dedicated view tab" aria-label="Open selected node in another dedicated view tab"><i class="bi bi-window-plus"></i></button>
        <strong class="debug-tool-selection ctx-target-view-selection"></strong>
      </div>
      <section class="ctx-debug-properties d-none ctx-target-view-properties-panel" aria-hidden="true" aria-label="Selected CTX node properties">
        <div class="ctx-debug-properties-heading"><span class="ctx-target-view-properties-title"></span><button class="btn-close btn-close-sm ctx-target-view-properties-close" type="button" aria-label="Close node properties"></button></div>
        <div class="ctx-debug-properties-body ctx-target-view-properties-body"></div>
        <div class="ctx-debug-properties-resize ctx-target-view-properties-resize" title="Drag to resize; double-click to reset" aria-hidden="true"></div>
      </section>
      <div class="ctx-debug-tree ctx-target-view-tree" role="tree" aria-label="Targeted CTX subtree"></div>`;
    body.appendChild(panel);

    const view = {
      id: viewId,
      tabKey,
      path,
      selected: typeof selected === 'string' && selected ? selected : path,
      expanded: new Set(Array.isArray(expanded) && expanded.length ? expanded : [path]),
      history:
        Array.isArray(history) && history.length
          ? history.filter((item) => typeof item === 'string')
          : [selected || path],
      historyIndex: Number.isInteger(historyIndex) ? historyIndex : 0,
      propertiesOpen: propertiesOpen === true,
      propertiesHeight: Number.isFinite(propertiesHeight) ? propertiesHeight : 256,
      scrollTop: Number(scrollTop) || 0,
      scrollAnchorPath: typeof scrollAnchorPath === 'string' ? scrollAnchorPath : null,
      scrollAnchorOffset: Number(scrollAnchorOffset) || 0,
      tabWrap,
      tab,
      panel,
      tree: panel.querySelector('.ctx-target-view-tree'),
      selection: panel.querySelector('.ctx-target-view-selection'),
      rootPath: panel.querySelector('.ctx-target-view-root'),
      availability: panel.querySelector('.ctx-target-view-availability'),
      back: panel.querySelector('.ctx-target-view-back'),
      forward: panel.querySelector('.ctx-target-view-forward'),
      propertiesPanel: panel.querySelector('.ctx-target-view-properties-panel'),
      propertiesTitle: panel.querySelector('.ctx-target-view-properties-title'),
      propertiesBody: panel.querySelector('.ctx-target-view-properties-body'),
    };
    view.historyIndex = Math.max(0, Math.min(view.historyIndex, view.history.length - 1));
    views.set(viewId, view);

    const setPropertiesOpen = (open) => {
      view.propertiesOpen = open;
      view.propertiesPanel.classList.toggle('d-none', !open);
      view.propertiesPanel.setAttribute('aria-hidden', String(!open));
      if (open) {
        view.propertiesPanel.style.height = `${view.propertiesHeight}px`;
        renderProperties(view);
      }
      serializeViews();
    };

    panel
      .querySelector('.ctx-target-view-properties')
      .addEventListener('click', () => setPropertiesOpen(!view.propertiesOpen));
    panel
      .querySelector('.ctx-target-view-properties-close')
      .addEventListener('click', () => setPropertiesOpen(false));
    panel.querySelector('.ctx-target-view-open').addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('manatos:ctx-target-view-open', {
          detail: { path: view.selected, sourceTab: view.tabKey },
        }),
      );
    });
    panel
      .querySelector('.ctx-target-view-copy-path')
      .addEventListener('click', () => void navigator.clipboard?.writeText?.(view.selected));
    panel.querySelector('.ctx-target-view-copy-value').addEventListener('click', () => {
      const value = valueAt(view.selected);
      const text =
        typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));
      void navigator.clipboard?.writeText?.(text);
    });
    view.back.addEventListener('click', () => {
      if (view.historyIndex <= 0) return;
      view.historyIndex -= 1;
      view.selected = view.history[view.historyIndex];
      serializeViews();
      renderView(view);
    });
    view.forward.addEventListener('click', () => {
      if (view.historyIndex >= view.history.length - 1) return;
      view.historyIndex += 1;
      view.selected = view.history[view.historyIndex];
      serializeViews();
      renderView(view);
    });
    view.tree.addEventListener('scroll', () => {
      window.clearTimeout(view.scrollSaveTimer);
      view.scrollSaveTimer = window.setTimeout(serializeViews, 120);
    });

    const resize = panel.querySelector('.ctx-target-view-properties-resize');
    let resizeStartY = 0;
    let resizeStartHeight = 0;
    resize.addEventListener('pointerdown', (event) => {
      resizeStartY = event.clientY;
      resizeStartHeight = view.propertiesPanel.getBoundingClientRect().height;
      resize.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    resize.addEventListener('pointermove', (event) => {
      if (!resize.hasPointerCapture?.(event.pointerId)) return;
      view.propertiesHeight = Math.max(
        136,
        Math.min(
          resizeStartHeight + event.clientY - resizeStartY,
          Math.floor(panel.clientHeight * 0.66),
        ),
      );
      view.propertiesPanel.style.height = `${view.propertiesHeight}px`;
    });
    resize.addEventListener('pointerup', (event) => {
      resize.releasePointerCapture?.(event.pointerId);
      serializeViews();
    });
    resize.addEventListener('dblclick', () => {
      view.propertiesHeight = 256;
      view.propertiesPanel.style.height = '256px';
      serializeViews();
    });

    if (view.propertiesOpen) setPropertiesOpen(true);
    renderView(view);
    restoreScrollState(view);
    serializeViews();
    applyPersistedOrder();
    if (activate) selectToolTab(tabKey);
    return view;
  };

  for (const item of tabItems()) makeDraggable(item);
  applyPersistedOrder();

  window.addEventListener('manatos:ctx-target-view-open', (event) => {
    const path = event instanceof CustomEvent ? event.detail?.path : null;
    const sourceTab = event instanceof CustomEvent ? event.detail?.sourceTab : null;
    if (typeof path !== 'string' || !path) return;
    createView({ path, sourceTab: typeof sourceTab === 'string' ? sourceTab : 'ctx' });
  });

  overflowToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = overflowMenu?.classList.contains('d-none') ?? false;
    if (opening) {
      renderOverflowMenu();
      overflowMenu?.classList.remove('d-none');
      overflowToggle.setAttribute('aria-expanded', 'true');
    } else {
      closeOverflowMenu();
    }
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    if (overflowMenu?.contains(event.target) || overflowToggle?.contains(event.target)) return;
    closeOverflowMenu();
  });
  window.addEventListener('manatos:developer-tool-tab-select', () => {
    window.requestAnimationFrame(() => {
      renderOverflowMenu();
      refreshOverflowAffordance();
    });
  });
  const overflowResizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => refreshOverflowAffordance())
      : null;
  overflowResizeObserver?.observe(strip);
  window.addEventListener('resize', refreshOverflowAffordance);

  runtime.trackSubscriber?.('*', { kind: 'debugger', label: 'Targeted CTX views' });
  window.addEventListener(CHANGE_EVENT, () => {
    for (const view of views.values()) renderView(view);
  });
  window.addEventListener('pagehide', serializeViews);

  const persisted = readJson(STATE_KEY, []);
  if (Array.isArray(persisted)) {
    for (const definition of persisted) createView({ ...definition, activate: false });
  }
  applyPersistedOrder();
  refreshOverflowAffordance();

  const persistedActive = localStorage.getItem(ACTIVE_TAB_KEY);
  if (persistedActive?.startsWith('ctxView:')) {
    if (dock.querySelector(`[data-developer-tool-tab="${CSS.escape(persistedActive)}"]`))
      selectToolTab(persistedActive);
    else localStorage.setItem(ACTIVE_TAB_KEY, 'ctx');
  }

  window.ManatOSCtxTargetViews = Object.freeze({
    open: (path) => createView({ path }),
    close: closeView,
  });
})();
