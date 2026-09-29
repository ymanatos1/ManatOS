(() => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  const treeElement = document.getElementById('ctxDebugTree');
  if (!runtime?.value || !treeElement) return;
  const panelElement = treeElement.closest('#debugPanel');

  const CHANGE_EVENT = 'manatos:ctx-change';
  const bootId =
    document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';

  const ctx = runtime.value;

  const pathPresentation = window.ManatOS?.debug?.ctxPath;
  const displayCtxPath = (path) => pathPresentation?.display?.(path) || path;

  // One canonical CTX node-copy command is shared by the root viewer and every
  // targeted node view. Keep serialization, clipboard behavior and failure
  // handling here so debugger surfaces cannot drift semantically.
  window.ManatOS = window.ManatOS || {};
  window.ManatOS.debug = window.ManatOS.debug || {};
  const copyNodeAsJsonText = async (name, value, anchor = null) => {
    const nodeName = String(name || 'node');
    const text = JSON.stringify({ [nodeName]: value }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      window.ManatOS?.notifications?.show?.({
        message: `Node ${nodeName} successfully copied in clipboard.`,
        variant: 'success',
        anchor,
        duration: 3000,
      });
      return true;
    } catch (error) {
      console.error('[ManatOS CTX] Unable to copy selected node as JSON text.', error);
      window.ManatOS?.notifications?.show?.({
        message: `Node ${nodeName} could not be copied in clipboard.`,
        variant: 'danger',
        anchor,
        duration: 3000,
      });
      return false;
    }
  };
  window.ManatOS.debug.copyCtxNodeAsJsonText = copyNodeAsJsonText;

  /*
   * DEBUG state is developer-workspace state, not application/business state.
   * localStorage intentionally preserves layout/selection/expansion across
   * navigation and UI-server restarts without persisting any CTX values.
   * Missing paths recover to their nearest surviving parent after the new page
   * CTX has loaded.
   */
  const DEBUG_STATE_KEY = 'manatos.debug.ctx.state.v2';

  const readPersistedState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DEBUG_STATE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return null;
      return saved;
    } catch {
      return null;
    }
  };

  const persisted = readPersistedState();
  const state = {
    expanded: new Set(
      Array.isArray(persisted?.expanded) && persisted.expanded.length
        ? persisted.expanded
        : ['ctx'],
    ),
    selected: typeof persisted?.selected === 'string' ? persisted.selected : 'ctx',
    scrollTop: Number.isFinite(persisted?.scrollTop) ? persisted.scrollTop : 0,
    scrollAnchorPath:
      typeof persisted?.scrollAnchorPath === 'string' ? persisted.scrollAnchorPath : null,
    scrollAnchorOffset: Number.isFinite(persisted?.scrollAnchorOffset)
      ? persisted.scrollAnchorOffset
      : 0,
    propertiesOpen: persisted?.propertiesOpen === true,
    propertiesHeight: Number.isFinite(persisted?.propertiesHeight)
      ? persisted.propertiesHeight
      : 256,
    debuggerWidth: Number.isFinite(persisted?.debuggerWidth) ? persisted.debuggerWidth : null,
  };

  const persistState = () => {
    try {
      localStorage.setItem(
        DEBUG_STATE_KEY,
        JSON.stringify({
          expanded: [...state.expanded],
          selected: state.selected,
          scrollTop: state.scrollTop,
          scrollAnchorPath: state.scrollAnchorPath,
          scrollAnchorOffset: state.scrollAnchorOffset,
          propertiesOpen: state.propertiesOpen,
          propertiesHeight: state.propertiesHeight,
          debuggerWidth: state.debuggerWidth,
          historyEntries: history?.entries ?? [],
          historyIndex: history?.index ?? -1,
          watchedPath,
        }),
      );
    } catch {
      // Debugging must never interfere with normal application behavior.
    }
  };

  const captureScrollState = () => {
    const treeRect = treeElement.getBoundingClientRect();
    const rows = [...treeElement.querySelectorAll('.ctx-debug-row[data-ctx-path]')];
    if (!rows.length) return;
    const anchor = rows.find((row) => row.getBoundingClientRect().bottom > treeRect.top);
    state.scrollTop = treeElement.scrollTop;
    state.scrollAnchorPath = anchor?.dataset.ctxPath || null;
    state.scrollAnchorOffset = anchor ? anchor.getBoundingClientRect().top - treeRect.top : 0;
  };

  const restoreScrollState = () => {
    const anchor = state.scrollAnchorPath
      ? [...treeElement.querySelectorAll('.ctx-debug-row[data-ctx-path]')].find(
          (row) => row.dataset.ctxPath === state.scrollAnchorPath,
        )
      : null;
    if (anchor) {
      const treeRect = treeElement.getBoundingClientRect();
      const currentOffset = anchor.getBoundingClientRect().top - treeRect.top;
      treeElement.scrollTop += currentOffset - state.scrollAnchorOffset;
      return;
    }
    const maxScroll = Math.max(0, treeElement.scrollHeight - treeElement.clientHeight);
    treeElement.scrollTop = Math.min(Math.max(0, state.scrollTop), maxScroll);
  };

  const saveState = () => {
    captureScrollState();
    persistState();
  };

  const isObject = (value) => value !== null && typeof value === 'object';
  const CONTEXT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  /**
   * Stable semantic key for an array member. The underlying CTX value remains
   * a normal JavaScript array; keyed access is a resolver/view capability.
   */
  const collectionMemberKey = (value) => {
    if (!isObject(value)) return null;
    for (const candidate of [value.id, value.key]) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return null;
  };

  // Canonical child addressing for arbitrary object keys as well as semantic array keys.
  // Presentation/layout nodes deliberately use stable keys such as `content.0`; those
  // are one property name, not two dotted CTX path segments.
  const appendCtxPath = (path, key) =>
    CONTEXT_IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

  /**
   * One debugger presentation path for every canonical UI level. Recognition is
   * owned by CTX semantic describe(); rendering never re-infers the contract.
   */
  const uiLevelBadgeText = (value) => {
    const control = isObject(value?.control) ? value.control : null;
    if (!control) return null;
    if (typeof control.host !== 'string' || typeof control.kind !== 'string') return null;
    const subject = control.entityKey || control.name || control.kind;
    return `${control.host.toUpperCase()} · ${control.kind.toUpperCase()} · ${subject}`;
  };

  const appendUiLevelBadge = (row, path, value) => {
    if (!(row instanceof HTMLElement)) return false;
    if (runtime.describe?.(path)?.kind !== 'ui-level') return false;
    const text = uiLevelBadgeText(value);
    if (!text) return false;
    const badge = document.createElement('span');
    badge.className = 'ctx-debug-ui-level-badge';
    badge.textContent = text;
    badge.title = `V2 UI level: ${value.control.host}/${value.control.kind}/${value.control.mode}`;
    row.appendChild(badge);
    return true;
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.debug = window.ManatOS.debug || {};
  window.ManatOS.debug.ctxUiLevelPresentation = Object.freeze({
    appendBadge: appendUiLevelBadge,
    badgeText: (path, value) =>
      runtime.describe?.(path)?.kind === 'ui-level' ? uiLevelBadgeText(value) : null,
  });

  const displayValue = (value) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'function') return 'ƒ';
    if (isObject(value)) return Array.isArray(value) ? `Array(${value.length})` : '{…}';
    return String(value);
  };

  const formatLogicalSize = (bytes) => {
    if (bytes < 1024) return `~${bytes} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    return `~${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const metadataForField = (path) => {
    const marker = '.fields.';
    const index = path.lastIndexOf(marker);
    if (index < 0) return undefined;

    const ownerPath = path.slice(0, index);
    const fieldTail = path.slice(index + marker.length);

    // metadata() belongs to the field context node itself only. A descendant
    // such as ctx.user.fields.id.value is the value property of that field; it
    // must not acquire another metadata() pseudo-child of its own.
    if (fieldTail.includes('.') || fieldTail.includes('[')) return undefined;

    const fieldName = fieldTail;
    let entityName = null;

    if (ownerPath === 'ctx.user') {
      entityName = ctx.user?.entityName ?? null;
    } else if (ownerPath.startsWith('ctx.ui.level')) {
      let candidatePath = ownerPath;
      while (candidatePath.startsWith('ctx.ui.level')) {
        const entityKey = getExact(`${candidatePath}.control`)?.entityKey;
        if (typeof entityKey === 'string' && entityKey) {
          entityName =
            Object.keys(ctx.entities || {}).find(
              (key) => ctx.entities?.[key]?.key === entityKey || key === entityKey,
            ) ?? null;
          break;
        }
        if (!candidatePath.endsWith('.level')) break;
        candidatePath = candidatePath.slice(0, -6);
      }
    }

    if (!entityName) return undefined;
    const metadata = ctx.entities?.[entityName]?.metadata;
    return metadata?.fieldDefinition?.[fieldName];
  };

  const virtualChildren = (path) => {
    const children = [];

    const fieldMetadata = metadataForField(path);
    if (fieldMetadata !== undefined) {
      children.push({
        key: 'metadata()',
        path: `${path}.metadata()`,
        value: fieldMetadata,
        derived: true,
      });
    }

    return children;
  };

  const isCalculatedContextField = (value) =>
    isObject(value) && typeof value.expression === 'string';

  const expressionSourceFor = (value) =>
    isCalculatedContextField(value) ? value.expression : null;

  /** A semantic CTX leaf that contains authored expression source text. */
  const isExpressionSourcePath = (path) => typeof path === 'string' && path.endsWith('.expression');

  const objectChildren = (path, value) => {
    if (!isObject(value)) return [];

    if (Array.isArray(value)) {
      const semanticKeys = value.map(collectionMemberKey);
      return value.map((item, index) => {
        const semanticKey = semanticKeys[index];
        const uniqueSemanticKey =
          semanticKey && semanticKeys.filter((key) => key === semanticKey).length === 1
            ? semanticKey
            : null;
        return {
          // Keep array ordering while presenting the stable record identity as
          // the member key whenever one exists (for example a SysBO UUID).
          key: uniqueSemanticKey ? `[${uniqueSemanticKey}]` : `[${index}]`,
          path: uniqueSemanticKey ? appendCtxPath(path, uniqueSemanticKey) : `${path}[${index}]`,
          value: item,
          derived: false,
          arrayIndex: index,
        };
      });
    }

    const entries = Object.entries(value);

    /*
     * Root CTX ordering is presentation-only. Keep company first for the
     * business-context-first debugger view without mutating the runtime object
     * or changing evaluator/path semantics. Unknown future root nodes retain
     * their original relative order after the known roots.
     */
    const preferredOrder = (preferred) =>
      [...entries].sort(([leftKey], [rightKey]) => {
        const leftIndex = preferred.indexOf(leftKey);
        const rightIndex = preferred.indexOf(rightKey);
        if (leftIndex < 0 && rightIndex < 0) return 0;
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex - rightIndex;
      });

    const isUiLevel = path.startsWith('ctx.ui.level') && isObject(value.control);
    const presentedEntries =
      path === 'ctx'
        ? preferredOrder(['company', 'system', 'enums', 'entities', 'user', 'ui'])
        : isUiLevel
          ? preferredOrder(['control', 'layout', 'data', 'state'])
          : entries;

    return presentedEntries.map(([key, item]) => ({
      key: Array.isArray(item) ? `${key}[]` : key,
      path: appendCtxPath(path, key),
      value: item,
      derived: false,
    }));
  };

  const childrenFor = (path, value) => [...virtualChildren(path), ...objectChildren(path, value)];

  /*
   * CTX debugging is an observer of the canonical browser context runtime.
   * Never maintain a second path parser/resolver here: keyed arrays, bracket
   * syntax and future CTX path semantics must resolve exactly as application
   * expressions and mutation routing do.
   */
  const getExact = (path) => runtime.get(path);

  /**
   * Current lexical resolver contract used by the expression runtime:
   * resolve the FIRST identifier at the current page scope, then parent pages,
   * then root. Once found, all remaining segments are traversed strictly
   * downward; lookup never jumps back to a parent for a missing child. Array
   * members may be traversed by zero-based index (`list[0]`) or by a semantic
   * `id`/`key`: identifier keys use dotted syntax (`platforms.protocrm`), while
   * arbitrary ids use quoted brackets (`entries['<uuid>']`).
   *
   * `metadata()` is a virtual field operation backed by ctx.entities and is
   * calculated rather than stored in CTX.
   */
  const sourceForDerived = (path) => {
    if (path.endsWith('.metadata()')) {
      const fieldPath = path.slice(0, -11);
      const marker = '.fields.';
      const index = fieldPath.lastIndexOf(marker);
      if (index < 0) return null;

      const ownerPath = fieldPath.slice(0, index);
      const fieldName = fieldPath.slice(index + marker.length).split('.')[0];
      let entityName = null;
      if (ownerPath === 'ctx.user') entityName = ctx.user?.entityName ?? null;
      else if (ownerPath.startsWith('ctx.ui.level')) {
        let candidatePath = ownerPath;
        while (candidatePath.startsWith('ctx.ui.level')) {
          const entityKey = getExact(`${candidatePath}.control`)?.entityKey;
          if (typeof entityKey === 'string' && entityKey) {
            entityName =
              Object.keys(ctx.entities || {}).find(
                (key) => ctx.entities?.[key]?.key === entityKey || key === entityKey,
              ) ?? null;
            break;
          }
          if (!candidatePath.endsWith('.level')) break;
          candidatePath = candidatePath.slice(0, -6);
        }
      }
      if (!entityName) return null;

      return `ctx.entities.${entityName}.metadata.fieldDefinition.${fieldName}`;
    }

    return null;
  };

  // Derived/function nodes are leaves in the CTX tree. Their provenance and
  // calculated details are shown exclusively in the Node Properties panel,
  // where the source path remains clickable. This avoids duplicating canonical
  // metadata or other derived data as synthetic tree children.
  const childrenForDebugger = (path, value, derived = false) => {
    if (derived) return [];
    return childrenFor(path, value);
  };

  const history = {
    entries: Array.isArray(persisted?.historyEntries)
      ? persisted.historyEntries.filter((value) => typeof value === 'string')
      : [],
    index: Number.isInteger(persisted?.historyIndex) ? persisted.historyIndex : -1,
  };
  if (history.index >= history.entries.length) history.index = history.entries.length - 1;

  const backButton = document.getElementById('ctxDebugBack');
  const forwardButton = document.getElementById('ctxDebugForward');
  const copyTextButton = document.getElementById('ctxDebugCopyText');
  const watchButton = document.getElementById('ctxDebugWatch');
  const cliButton = document.getElementById('ctxDebugCli');
  const openViewButton = document.getElementById('ctxDebugOpenView');
  const selectionElement = document.getElementById('ctxDebugSelection');
  const selectionPathElement = document.getElementById('ctxDebugSelectionPath');
  const statsElement = document.getElementById('ctxDebugStats');

  /*
   * The statistics explanation intentionally uses Bootstrap rather than the
   * browser's native `title` tooltip. Native title rendering is single-line
   * or browser-dependent, while this debugger text needs a stable four-line
   * layout and must escape the debug panel's overflow clipping.
   */
  if (statsElement && window.bootstrap?.Tooltip) {
    window.bootstrap.Tooltip.getOrCreateInstance(statsElement, {
      container: 'body',
      placement: 'bottom',
      trigger: 'hover focus',
      html: true,
      customClass: 'ctx-debug-stats-tooltip',
      title: () => statsElement.dataset.tooltipHtml || '',
    });
  }

  const propertiesButton = document.getElementById('ctxDebugProperties');
  const propertiesPanel = document.getElementById('ctxDebugPropertiesPanel');
  const propertiesBody = document.getElementById('ctxDebugPropertiesBody');
  const propertiesClose = document.getElementById('ctxDebugPropertiesClose');
  const propertiesTitle = document.getElementById('ctxDebugPropertiesTitle');
  const propertiesResize = document.getElementById('ctxDebugPropertiesResize');
  let watchedPath = typeof persisted?.watchedPath === 'string' ? persisted.watchedPath : null;
  let changedPath = null;
  let changedTimer = null;

  const pathExists = (path) => {
    if (path === 'ctx') return true;
    if (path.endsWith('.metadata()')) return metadataForField(path.slice(0, -11)) !== undefined;
    if (path.endsWith('.__source')) return sourceForDerived(path.slice(0, -9)) !== null;
    try {
      return getExact(path) !== undefined;
    } catch {
      return false;
    }
  };

  const parentPath = (path) => {
    if (!path || path === 'ctx') return 'ctx';
    const withoutVirtual = path
      .replace(/\.__source$/, '')
      .replace(/\.metadata\(\)$|\.path\(\)$/, '');
    const withoutIndex = withoutVirtual.replace(/\[\d+\]$/, '');
    if (withoutIndex !== withoutVirtual) return withoutIndex || 'ctx';
    return withoutVirtual.replace(/\.[^.]+$/, '') || 'ctx';
  };

  const nearestExistingPath = (path) => {
    let candidate = path || 'ctx';
    while (candidate !== 'ctx' && !pathExists(candidate)) candidate = parentPath(candidate);
    return pathExists(candidate) ? candidate : 'ctx';
  };

  const expandAncestors = (path) => {
    let candidate = parentPath(path);
    while (candidate && candidate !== 'ctx') {
      if (pathExists(candidate)) state.expanded.add(candidate);
      candidate = parentPath(candidate);
    }
    state.expanded.add('ctx');
  };

  const updateToolbar = () => {
    if (backButton) backButton.disabled = history.index <= 0;
    if (forwardButton)
      forwardButton.disabled = history.index < 0 || history.index >= history.entries.length - 1;
    if (selectionElement) {
      selectionElement.textContent = nodeNameFromPath(state.selected);
      selectionElement.title = displayCtxPath(state.selected);
    }
    if (selectionPathElement) pathPresentation?.render?.(selectionPathElement, state.selected);
    if (cliButton) {
      cliButton.title = `Open CLI at ${displayCtxPath(state.selected)}`;
      cliButton.setAttribute('aria-label', `Open CLI at ${displayCtxPath(state.selected)}`);
    }
    if (watchButton) {
      const isDerived = state.selected.endsWith('()') || state.selected.endsWith('.__source');
      watchButton.disabled = isDerived;
      watchButton.classList.toggle('is-active', watchedPath === state.selected);
      watchButton.title =
        watchedPath === state.selected
          ? 'Stop watching selected CTX value'
          : 'Watch selected CTX value for changes';
    }
  };

  const rememberSelection = (path) => {
    if (history.entries[history.index] === path) return;
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(path);
    history.index = history.entries.length - 1;
  };

  const selectedRowElement = () =>
    treeElement.querySelector(`.ctx-debug-row[data-ctx-path="${CSS.escape(state.selected)}"]`);

  const ensureSelectedVisible = ({ align = 'nearest' } = {}) => {
    selectedRowElement()?.scrollIntoView({ block: align, inline: 'nearest' });
  };

  /**
   * Reveal the complete rendered range of an expanded inspected node once,
   * then return the selected node to the top of the CTX viewport.
   *
   * Popup CTX payloads can contain enough children that their first and last
   * rows cannot be visible simultaneously. Scrolling to the last rendered row
   * first guarantees the expanded subtree has been laid out and is reachable;
   * the second frame restores the popup root as the developer's visual anchor.
   */
  const revealExpandedSelectionRange = () => {
    const selectedRow = selectedRowElement();
    const selectedNode = selectedRow?.closest('.ctx-debug-node');
    const visibleRows = selectedNode?.querySelectorAll('.ctx-debug-row');
    const lastRow = visibleRows?.length ? visibleRows[visibleRows.length - 1] : null;

    if (!(lastRow instanceof HTMLElement) || lastRow === selectedRow) {
      ensureSelectedVisible({ align: 'start' });
      return;
    }

    lastRow.scrollIntoView({ block: 'end', inline: 'nearest' });
    requestAnimationFrame(() => ensureSelectedVisible({ align: 'start' }));
  };

  const syncPropertiesPresentation = () => {
    propertiesPanel?.classList.toggle('d-none', !state.propertiesOpen);
    propertiesPanel?.setAttribute('aria-hidden', String(!state.propertiesOpen));
    selectionPathElement?.classList.toggle('d-none', state.propertiesOpen);
  };

  const selectPath = (
    requestedPath,
    { remember = true, expandSelected = false, revealExpandedRange = false } = {},
  ) => {
    const path = nearestExistingPath(requestedPath);
    layoutHighlightSuppressed = false;
    clearLayoutHighlight();
    expandAncestors(path);
    if (expandSelected) {
      let selectedValue;
      try {
        selectedValue = path === 'ctx' ? ctx : getExact(path);
      } catch {
        selectedValue = undefined;
      }
      if (
        isObject(selectedValue) &&
        !isCalculatedContextField(selectedValue) &&
        objectChildren(path, selectedValue).length > 0
      ) {
        state.expanded.add(path);
      }
    }
    state.selected = path;
    if (remember) rememberSelection(path);

    // Node selection and history navigation must not change the developer's
    // persisted Properties-panel preference. render() applies that preference
    // consistently after the selection changes.
    syncPropertiesPresentation();
    saveState();
    render({
      revealSelection: true,
      revealExpandedRange,
    });
  };

  cliButton?.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('manatos:debug-cli-toggle', {
        detail: { instanceKey: 'ctx-viewer', path: state.selected },
      }),
    );
  });

  copyTextButton?.addEventListener('click', () => {
    const path = nearestExistingPath(state.selected);
    const anchor = [...treeElement.querySelectorAll('.ctx-debug-row[data-ctx-path]')].find(
      (row) => row.dataset.ctxPath === path,
    );
    void copyNodeAsJsonText(nodeNameFromPath(path), getExact(path), anchor);
  });

  openViewButton?.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('manatos:ctx-target-view-open', {
        detail: { path: state.selected, sourceTab: 'ctx' },
      }),
    );
  });

  window.addEventListener('manatos:debug-cli-state', (event) => {
    if (!(event instanceof CustomEvent) || event.detail?.instanceKey !== 'ctx-viewer' || !cliButton)
      return;
    const open = event.detail?.open === true;
    cliButton.classList.toggle('is-active', open);
    cliButton.setAttribute('aria-pressed', String(open));
    cliButton.title = open
      ? 'CTX CLI is open; click to hide or retarget from another node'
      : `Open CLI at ${displayCtxPath(state.selected)}`;
  });

  window.addEventListener('manatos:ctx-viewer-select', (event) => {
    const requestedPath = event instanceof CustomEvent ? event.detail?.path : null;
    if (typeof requestedPath !== 'string' || !requestedPath) return;
    selectPath(requestedPath, {
      expandSelected: event.detail?.expand === true,
      revealExpandedRange: event.detail?.revealExpandedRange === true,
    });
  });

  const allRealNodePaths = () => {
    const paths = [];
    const visit = (path, value) => {
      paths.push(path);
      if (!isObject(value) || isCalculatedContextField(value)) return;
      for (const child of objectChildren(path, value)) visit(child.path, child.value);
    };
    visit('ctx', ctx);
    return paths;
  };

  const nodeNameFromPath = (path) => {
    const indexed = path.match(/\[(\d+)\]$/);
    if (indexed) return `[${indexed[1]}]`;
    return path.split('.').at(-1)?.replace(/\[\]$/, '') ?? path;
  };

  const createCtxFindRuntime = window.ManatOS?.createCtxFindRuntime;
  if (typeof createCtxFindRuntime !== 'function')
    throw new Error('CTX find runtime service is unavailable.');
  createCtxFindRuntime({
    bootId,
    allRealNodePaths,
    selectedPath: () => state.selected,
    getValue: (path) => (path === 'ctx' ? ctx : getExact(path)),
    nodeNameFromPath,
    selectPath,
  });

  const semanticDescriptor = (path, value, derived = false, source = false) => {
    if (source) return { kind: 'reference', type: 'string', attributes: ['derived', 'readonly'] };
    if (derived)
      return { kind: 'derived', type: typeof value, attributes: ['derived', 'readonly'] };
    return (
      runtime.describe?.(path) || {
        kind: nodeKind(path, value),
        type: typeof value,
        attributes: [],
      }
    );
  };

  const CTX_KIND_ICONS = Object.freeze({
    'context-root': 'bi-diagram-3',
    'company-context': 'bi-building',
    'system-context': 'bi-gear',
    'entities-context': 'bi-database',
    'user-context': 'bi-person-circle',
    'ui-context': 'bi-window-stack',
    'ui-level': 'bi-window',
    invocation: 'bi-box-arrow-in-right',
    presentation: 'bi-layout-text-window',
    state: 'bi-activity',
    entry: 'bi-card-text',
    'entry-current': 'bi-eye',
    'entry-original': 'bi-archive',
    list: 'bi-list-ul',
    fields: 'bi-ui-checks-grid',
    field: 'bi-input-cursor-text',
    'field-value': 'bi-pencil-square',
    'field-original-value': 'bi-eye',
    'field-ux': 'bi-sliders',
    facts: 'bi-info-circle',
    resources: 'bi-boxes',
    collection: 'bi-collection',
    container: 'bi-braces',
    reference: 'bi-link-45deg',
    derived: 'bi-calculator',
  });

  const iconForCtxNode = (descriptor) => CTX_KIND_ICONS[descriptor.kind] || 'bi-dot';

  const activeEntryAliasTargets = () => {
    let level = ctx?.ui?.level;
    if (!level) return new Map();
    let levelPath = 'ctx.ui.level';
    while (level?.level) {
      level = level.level;
      levelPath += '.level';
    }
    if (level?.control?.kind !== 'entry') return new Map();

    const entityName = getExact(`${levelPath}.control.entityName`);
    if (!entityName) return new Map();

    const entityPath = `ctx.entities.${entityName}`;
    const fieldsPath = `${entityPath}.metadata.fieldDefinition`;
    const entryCurrentPath = `${levelPath}.data.entry.current`;

    return new Map([
      [levelPath, ['#level']],
      [`${levelPath}.control`, ['#control']],
      [`${levelPath}.layout`, ['#layout']],
      [`${levelPath}.data`, ['#data']],
      [`${levelPath}.state`, ['#state']],
      [entityPath, ['$entity', '$level-entity']],
      [fieldsPath, ['$entity-fields', '$level-entity-fields']],
      [entryCurrentPath, ['$entry-current']],
    ]);
  };

  const aliasesForCtxPath = (path) => activeEntryAliasTargets().get(path) || [];

  const nodeKind = (path, value, derived = false, source = false) => {
    if (source) return 'reference';
    if (derived) return 'derived';
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return value.length ? 'array' : 'empty';
    if (isObject(value)) return Object.keys(value).length ? 'object' : 'empty';
    return 'value';
  };

  const selectedNodeInfo = () => {
    const path = nearestExistingPath(state.selected);
    if (path.endsWith('.__source')) {
      const derivedPath = path.slice(0, -9);
      const sourcePath = sourceForDerived(derivedPath);
      return { path, value: sourcePath, derived: false, source: true, sourcePath };
    }
    if (path.endsWith('.metadata()')) {
      return {
        path,
        value: metadataForField(path.slice(0, -11)),
        derived: true,
        source: false,
        sourcePath: sourceForDerived(path),
      };
    }
    return { path, value: getExact(path), derived: false, source: false, sourcePath: null };
  };

  let propertiesTab = 'main';

  const renderProperties = () => {
    if (!propertiesPanel || !propertiesBody || propertiesPanel.classList.contains('d-none')) return;
    const info = selectedNodeInfo();
    const descriptor = semanticDescriptor(info.path, info.value, info.derived, info.source);
    const kind = descriptor.kind;
    const children = info.derived ? [] : objectChildren(info.path, info.value);
    const calculated = isCalculatedContextField(info.value);
    const expressionSource = expressionSourceFor(info.value);
    if (propertiesTitle) pathPresentation?.render?.(propertiesTitle, info.path);

    const rows = [
      ...(aliasesForCtxPath(info.path).length
        ? [{ label: 'Aliases', value: aliasesForCtxPath(info.path).join(', ') }]
        : []),
      ...(() => {
        const badge = window.ManatOS?.debug?.ctxUiLevelPresentation?.badgeText?.(
          info.path,
          info.value,
        );
        return badge ? [{ label: 'UI level', value: badge }] : [];
      })(),
      { label: 'Kind', value: calculated ? 'calculated' : kind },
      { label: 'Type', value: descriptor.type },
      {
        label: 'Watchable',
        value: descriptor.watchable === false || info.derived || info.source ? 'no' : 'yes',
      },
      {
        label: 'JavaScript type',
        value:
          info.value === null ? 'null' : Array.isArray(info.value) ? 'array' : typeof info.value,
      },
      {
        label: 'Value',
        value: displayValue(info.value),
        formula: isExpressionSourcePath(info.path),
      },
      { label: 'Children', value: String(children.length) },
    ];
    if (info.sourcePath)
      rows.splice(4, 0, {
        label: 'Derived from',
        value: info.sourcePath,
        linkPath: info.sourcePath,
      });
    if (expressionSource)
      rows.splice(4, 0, { label: 'Expression', value: expressionSource, formula: true });

    window.ManatOS?.debug?.ctxProperties?.render({
      panel: propertiesPanel,
      body: propertiesBody,
      activeTab: propertiesTab,
      rows,
      properties: descriptor.properties,
      attributes: descriptor.attributes,
      subscribers: descriptor.subscribers,
      onNavigate: (path) => {
        propertiesPanel.classList.add('d-none');
        propertiesPanel.setAttribute('aria-hidden', 'true');
        selectPath(path);
      },
    });
  };

  propertiesPanel?.addEventListener('click', (event) => {
    const tab =
      event.target instanceof Element ? event.target.closest('[data-properties-tab]') : null;
    if (!(tab instanceof HTMLButtonElement)) return;
    const requestedTab = tab.getAttribute('data-properties-tab');
    propertiesTab = ['main', 'properties', 'attributes', 'subscribers'].includes(requestedTab)
      ? requestedTab
      : 'main';
    renderProperties();
  });

  let layoutHighlight = null;
  let layoutHighlightPath = null;
  // Opening/replacing a surface invalidates any physical correlation overlay.
  // The semantic CTX selection may persist, but a new overlay is created only
  // by an explicit hover/selection on the newly mounted surface.
  let layoutHighlightSuppressed = false;
  const clearLayoutHighlight = () => {
    layoutHighlight?.remove();
    layoutHighlight = null;
    layoutHighlightPath = null;
  };

  /*
   * #layout owns physical DOM identity.  The presentation projection publishes
   * domSelector together with rendererRef, so the debugger never has to infer
   * a selector from presentation semantics.  rendererRef remains descriptive;
   * domSelector is the executable inspection contract.
   */
  const owningUiLevel = (path) => {
    if (typeof path !== 'string') return null;
    const layoutMarker = '.layout';
    const layoutIndex = path.indexOf(layoutMarker);
    if (layoutIndex <= 0) return null;

    // #layout is a direct child of its canonical UI level.  Derive that owner
    // structurally from the selected layout path instead of searching the
    // runtime level registry.  Canonical lifecycle/host truth still comes from
    // CTX -- the same state UiLevel exposes -- so debugger ownership cannot
    // drift from nested LIST -> ENTRY or PAGE -> POPUP topology.
    const ownerPath = path.slice(0, layoutIndex);
    if (runtime.describe?.(ownerPath)?.kind !== 'ui-level') return null;
    const host = runtime.get?.(`${ownerPath}.control.host`);
    if (typeof host !== 'string') return null;
    const typedLevel = [...(window.ManatOS?.uiRuntimeV2?.levels?.values?.() || [])].find(
      (level) => level?.diagnosticIdentity?.sourceCtxPath === ownerPath,
    );
    const domId = typedLevel?.domId;
    if (typeof domId !== 'string' || !domId) return null;
    return { path: ownerPath, host, domId, typedLevel };
  };

  const tabIdForLayoutPath = (path, ownerPath) => {
    if (!ownerPath || typeof path !== 'string') return null;
    const prefix = `${ownerPath}.layout.tabs.`;
    if (!path.startsWith(prefix)) return null;
    const remainder = path.slice(prefix.length);
    const dot = remainder.indexOf('.');
    return dot > 0 ? remainder.slice(0, dot) : null;
  };

  // Every browser-mounted UiLevel now owns exactly one canonical DOM root.
  // Debugger DOM ownership is resolved from that root; data-ctx-scope-path on
  // descendants is semantic CTX scope and must not be used as a DOM-owner proxy.
  const uiLevelRoots = (owner) => {
    if (!owner?.path) return [];
    const roots = [
      ...document.querySelectorAll(`[data-ui-level-id="${CSS.escape(owner.domId)}"]`),
    ].filter((root) => root instanceof HTMLElement && root.hasAttribute('data-ui-level-root'));
    if (roots.length > 1) {
      console.error(`[ManatOS CTX] Duplicate DOM roots for ${owner.domId} (${owner.path}).`, roots);
      return [];
    }
    return roots.filter((root) => root.getClientRects().length > 0);
  };

  const rendererElementBelongsToRoot = (element, root) =>
    element instanceof HTMLElement &&
    root instanceof HTMLElement &&
    root.contains(element) &&
    element.closest('[data-ui-level-root]') === root;

  const tabContentIsActive = (tabId, owner) => {
    if (!tabId) return true;
    const escaped = window.CSS?.escape ? window.CSS.escape(tabId) : tabId.replace(/["\\]/g, '\\$&');
    return uiLevelRoots(owner).some((root) =>
      [...root.querySelectorAll(`[data-v2-tab-id="${escaped}"]`)].some(
        (tab) =>
          rendererElementBelongsToRoot(tab, root) &&
          (tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true'),
      ),
    );
  };

  const highlightIsEligible = (path, owner) => {
    // Physical presence is necessary but not sufficient: covered ancestors remain
    // mounted. Canonical UiRuntime topology identifies the one current/topmost
    // surface, so no layout mutation is needed to deactivate/reactivate highlighting.
    const currentLevel = window.ManatOS?.uiRuntimeV2?.currentLevel?.();
    if (!owner?.typedLevel || currentLevel !== owner.typedLevel || !uiLevelRoots(owner).length)
      return false;
    return tabContentIsActive(tabIdForLayoutPath(path, owner.path), owner);
  };

  const rendererElements = (domSelector, rendererRef, owner) => {
    if (typeof domSelector !== 'string' || !domSelector || !owner?.domId) return [];
    const roots = uiLevelRoots(owner);
    let matches = [];
    try {
      for (const root of roots) {
        if (root.matches(domSelector)) matches.push(root);
        matches.push(...root.querySelectorAll(domSelector));
      }
    } catch {
      return [];
    }
    const owned = matches.filter((element) =>
      roots.some((root) => rendererElementBelongsToRoot(element, root)),
    );
    const visible = owned.filter((element) => element.getClientRects().length > 0);
    if (!visible.length) return [];

    // A renderer selector is scoped by its canonical level root. If nested modal
    // chrome happens to repeat a generic renderer attribute (for example
    // caption:surface), the level's own renderer is the shallowest matching DOM
    // element. Repeated peers at that same depth are a genuinely plural renderer
    // and are highlighted together.
    const depthFromRoot = (element) => {
      let depth = 0;
      let current = element;
      while (current && !roots.includes(current)) {
        current = current.parentElement;
        depth += 1;
      }
      return depth;
    };
    const minimumDepth = Math.min(...visible.map(depthFromRoot));
    return visible.filter((element) => depthFromRoot(element) === minimumDepth);
  };

  const combinedRendererRect = (elements) => {
    const rects = elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) return null;
    return rects.slice(1).reduce(
      (result, rect) => ({
        left: Math.min(result.left, rect.left),
        top: Math.min(result.top, rect.top),
        right: Math.max(result.right, rect.right),
        bottom: Math.max(result.bottom, rect.bottom),
      }),
      {
        left: rects[0].left,
        top: rects[0].top,
        right: rects[0].right,
        bottom: rects[0].bottom,
      },
    );
  };

  const highlightLayoutNode = (domSelector, rendererRef, path) => {
    clearLayoutHighlight();
    layoutHighlightSuppressed = false;
    const owner = owningUiLevel(path);
    // CTX inspection remains unrestricted. Only the physical overlay follows
    // the canonical UiRuntime-owned active surface lifecycle.
    if (!highlightIsEligible(path, owner)) return;
    const rect = combinedRendererRect(rendererElements(domSelector, rendererRef, owner));
    if (!rect) return;
    const overlay = document.createElement('div');
    overlay.className = 'ctx-debug-layout-highlight';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.right - rect.left}px`,
      height: `${rect.bottom - rect.top}px`,
      pointerEvents: 'none',
      zIndex: '2147483646',
    });
    document.body.appendChild(overlay);
    layoutHighlight = overlay;
    layoutHighlightPath = path;
  };

  const renderNode = ({ key, path, value, derived = false, source = false, sourcePath = null }) => {
    const children = childrenForDebugger(path, value, derived);
    const expandable = children.length > 0;
    const expanded = expandable && state.expanded.has(path);

    const node = document.createElement('div');
    node.className = 'ctx-debug-node';

    const row = document.createElement('div');
    row.className = `ctx-debug-row${state.selected === path ? ' is-selected' : ''}${derived ? ' is-derived' : ''}${source ? ' is-derived-source' : ''}${changedPath === path ? ' is-changed' : ''}`;
    row.dataset.ctxPath = path;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-selected', String(state.selected === path));
    if (expandable) row.setAttribute('aria-expanded', String(expanded));

    // Expansion control is intentionally the left-most row element. Clicking
    // the node body selects only; only [+]/[-] changes expansion state.
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ctx-debug-toggle';
    toggle.tabIndex = expandable ? 0 : -1;
    toggle.textContent = expandable ? (expanded ? '[-]' : '[+]') : '';
    toggle.disabled = !expandable;
    toggle.setAttribute(
      'aria-label',
      expandable ? (expanded ? `Collapse ${key}` : `Expand ${key}`) : 'Leaf node',
    );
    if (expandable) {
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        clearLayoutHighlight();
        state.selected = path;
        rememberSelection(path);
        if (state.expanded.has(path)) state.expanded.delete(path);
        else state.expanded.add(path);
        saveState();
        render({ revealSelection: true });
      });
    }
    row.appendChild(toggle);

    const descriptor = semanticDescriptor(path, value, derived, source);
    const rendererRef = descriptor.properties?.rendererRef;
    const domSelector = descriptor.properties?.domSelector;
    if (domSelector) {
      row.addEventListener('mouseenter', () => highlightLayoutNode(domSelector, rendererRef, path));
      // A selected #layout node owns a persistent correlation overlay. The row is
      // rebuilt by selectPath(); its old DOM node can emit mouseleave during that
      // replacement. Clearing unconditionally here races the click-triggered
      // highlight and makes valid Entry/Page and Account highlights disappear.
      // Hover-only highlights still clear normally when the row is not selected.
      row.addEventListener('mouseleave', () => {
        if (state.selected !== path) clearLayoutHighlight();
      });
    }
    const semanticIcon = document.createElement('i');
    semanticIcon.className = `bi ${iconForCtxNode(descriptor)} ctx-debug-node-icon`;
    semanticIcon.setAttribute('aria-hidden', 'true');
    semanticIcon.title = descriptor.kind;
    row.appendChild(semanticIcon);

    const keyElement = document.createElement('span');
    keyElement.className = `ctx-debug-key${derived ? ' ctx-debug-derived' : ''}`;
    keyElement.textContent = key;
    row.appendChild(keyElement);

    if (!derived && !source) appendUiLevelBadge(row, path, value);

    if (!source) {
      const valueElement = document.createElement('span');
      valueElement.className = 'ctx-debug-value';
      if (derived) {
        valueElement.textContent = '= derived';
      } else if (!isObject(value)) {
        if (
          typeof value === 'string' &&
          isExpressionSourcePath(path) &&
          window.ManatOS?.debug?.expression
        ) {
          valueElement.appendChild(document.createTextNode('= '));
          const formulaElement = document.createElement('span');
          formulaElement.className = 'ctx-debug-expression';
          window.ManatOS?.debug?.expression.highlightElement(formulaElement, value);
          valueElement.appendChild(formulaElement);
        } else {
          valueElement.textContent = `= ${displayValue(value)}`;
        }
      }
      if (valueElement.textContent || valueElement.childNodes.length) row.appendChild(valueElement);
    }

    if (source) {
      row.title = `Go to ${sourcePath}`;
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        clearLayoutHighlight();
        selectPath(sourcePath);
      });
    } else {
      row.addEventListener('click', () => {
        clearLayoutHighlight();
        selectPath(path);
        if (domSelector) highlightLayoutNode(domSelector, rendererRef, path);
      });
    }

    node.appendChild(row);
    if (expanded) {
      const childContainer = document.createElement('div');
      childContainer.className = 'ctx-debug-children';
      childContainer.setAttribute('role', 'group');
      children.forEach((child) => childContainer.appendChild(renderNode(child)));
      node.appendChild(childContainer);
    }
    return node;
  };

  const render = ({ revealSelection = false, revealExpandedRange = false } = {}) => {
    captureScrollState();

    // A physical overlay is valid only while the exact originating #layout node
    // remains selected and still resolves to an eligible canonical UiLevel DOM root.
    // CTX mutation, root disposal and tab changes therefore tear down stale DOM
    // correlation without conflating UiRuntime interaction-active state with DOM visibility.
    if (layoutHighlightPath) {
      const owner = pathExists(layoutHighlightPath) ? owningUiLevel(layoutHighlightPath) : null;
      if (
        state.selected !== layoutHighlightPath ||
        !highlightIsEligible(layoutHighlightPath, owner)
      )
        clearLayoutHighlight();
    }

    const recovered = nearestExistingPath(state.selected);
    if (recovered !== state.selected) {
      state.selected = recovered;
      rememberSelection(recovered);
    }

    state.expanded = new Set([...state.expanded].filter((path) => pathExists(path)));
    treeElement.replaceChildren(renderNode({ key: '$ (ctx)', path: 'ctx', value: ctx }));
    restoreScrollState();

    /*
     * Selection is semantic debugger state, while tree rows are disposable DOM.
     * Re-establish the selected #layout correlation from canonical CTX after every
     * tree rebuild.  This makes highlighting independent of mouseenter/mouseleave
     * ordering and of the old row being destroyed by selectPath()/CTX refresh.
     */
    if (!layoutHighlightSuppressed && state.selected && pathExists(state.selected)) {
      let selectedValue;
      try {
        selectedValue = state.selected === 'ctx' ? ctx : getExact(state.selected);
      } catch {
        selectedValue = undefined;
      }
      const selectedDescriptor = semanticDescriptor(state.selected, selectedValue, false, false);
      const selectedDomSelector = selectedDescriptor.properties?.domSelector;
      if (selectedDomSelector) {
        highlightLayoutNode(
          selectedDomSelector,
          selectedDescriptor.properties?.rendererRef,
          state.selected,
        );
      } else {
        clearLayoutHighlight();
      }
    } else {
      clearLayoutHighlight();
    }

    if (statsElement) {
      const measured = runtime.statistics?.() || { nodes: 0, bytes: 0 };
      const renderedRows = treeElement.querySelectorAll('.ctx-debug-row').length;
      statsElement.textContent = `${measured.nodes} nodes · ${formatLogicalSize(measured.bytes)}`;
      statsElement.dataset.tooltipHtml = [
        `<div>${measured.nodes} logical CTX nodes</div>`,
        `<div>${formatLogicalSize(measured.bytes)} approximate logical payload</div>`,
        `<div>${renderedRows} debugger rows currently rendered</div>`,
        '<div class="ctx-debug-stats-tooltip-note">Actual JavaScript heap usage may differ.</div>',
      ].join('');
    }

    updateToolbar();
    renderProperties();
    if (revealSelection) {
      requestAnimationFrame(() => {
        if (revealExpandedRange) revealExpandedSelectionRange();
        else ensureSelectedVisible();
      });
    }
    saveState();
  };

  treeElement.addEventListener('scroll', () => {
    window.clearTimeout(treeElement._ctxSaveTimer);
    treeElement._ctxSaveTimer = window.setTimeout(saveState, 120);
  });

  backButton?.addEventListener('click', () => {
    if (history.index <= 0) return;
    history.index -= 1;
    selectPath(history.entries[history.index], { remember: false });
  });

  forwardButton?.addEventListener('click', () => {
    if (history.index >= history.entries.length - 1) return;
    history.index += 1;
    selectPath(history.entries[history.index], { remember: false });
  });

  watchButton?.addEventListener('click', () => {
    if (watchButton.disabled) return;
    watchedPath = watchedPath === state.selected ? null : state.selected;
    persistState();
    updateToolbar();
  });

  // The shared shell owns the outer Developer Tools dock resize.

  const DEFAULT_PROPERTIES_HEIGHT = 256;
  const applyPropertiesHeight = (requested = state.propertiesHeight) => {
    if (!propertiesPanel) return;
    const panelHeight =
      panelElement?.clientHeight ||
      treeElement.ownerDocument.defaultView?.innerHeight ||
      window.innerHeight;
    const minHeight = 136;
    const maxHeight = Math.max(minHeight, Math.floor((panelHeight * 2) / 3));
    state.propertiesHeight = Math.max(
      minHeight,
      Math.min(Number(requested) || DEFAULT_PROPERTIES_HEIGHT, maxHeight),
    );
    propertiesPanel.style.height = `${state.propertiesHeight}px`;
  };

  if (propertiesResize && propertiesPanel) {
    let startY = 0;
    let startHeight = 0;
    propertiesResize.addEventListener('pointerdown', (event) => {
      startY = event.clientY;
      startHeight = propertiesPanel.getBoundingClientRect().height;
      propertiesResize.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    propertiesResize.addEventListener('pointermove', (event) => {
      if (!propertiesResize.hasPointerCapture?.(event.pointerId)) return;
      applyPropertiesHeight(startHeight + (event.clientY - startY));
      requestAnimationFrame(ensureSelectedVisible);
    });
    propertiesResize.addEventListener('pointerup', (event) => {
      propertiesResize.releasePointerCapture?.(event.pointerId);
      persistState();
      requestAnimationFrame(ensureSelectedVisible);
    });
    propertiesResize.addEventListener('dblclick', () => {
      applyPropertiesHeight(DEFAULT_PROPERTIES_HEIGHT);
      persistState();
      requestAnimationFrame(ensureSelectedVisible);
    });
  }

  propertiesButton?.addEventListener('click', () => {
    if (!propertiesPanel) return;
    const opening = propertiesPanel.classList.contains('d-none');
    state.propertiesOpen = opening;
    syncPropertiesPresentation();
    if (opening) {
      applyPropertiesHeight();
      renderProperties();
    }
    persistState();
    requestAnimationFrame(ensureSelectedVisible);
  });

  propertiesClose?.addEventListener('click', () => {
    state.propertiesOpen = false;
    syncPropertiesPresentation();
    persistState();
    requestAnimationFrame(ensureSelectedVisible);
  });

  const revealOpenedUiLevel = (path) => {
    const viewerVisible = treeElement.getClientRects().length > 0;
    if (!viewerVisible || typeof path !== 'string' || !pathExists(path)) return;
    if (runtime.describe?.(path)?.kind !== 'ui-level') return;
    expandAncestors(path);
    state.expanded.add(path);
    persistState();
  };

  // CTX mutation/event infrastructure is provided by /js/runtime/context-runtime.js.
  runtime.trackSubscriber?.('*', { kind: 'debugger', label: 'CTX Viewer' });
  window.addEventListener(CHANGE_EVENT, (event) => {
    const path = event.detail?.path;
    // Surface opening is a CTX lifecycle fact, not a renderer-family event. A
    // newly inserted UiLevel is therefore revealed here for every page/popup/
    // embedded surface through the one canonical CTX mutation stream.
    if (event.detail?.oldValue === undefined) revealOpenedUiLevel(path);
    if (
      watchedPath &&
      typeof path === 'string' &&
      (path === watchedPath ||
        path.startsWith(`${watchedPath}.`) ||
        path.startsWith(`${watchedPath}[`))
    ) {
      changedPath = watchedPath;
      window.clearTimeout(changedTimer);
      changedTimer = window.setTimeout(() => {
        changedPath = null;
        render();
      }, 1400);
    }
    render();
  });

  const resetLayoutHighlightForSurfaceTransition = () => {
    layoutHighlightSuppressed = true;
    clearLayoutHighlight();
  };

  const revealMountedSurface = (event) => {
    resetLayoutHighlightForSurfaceTransition();
    const surfacePath = event instanceof CustomEvent ? event.detail?.path : null;
    revealOpenedUiLevel(surfacePath);
    render();
  };

  // Physical UiLevel mounting is the universal browser-surface boundary. It is
  // emitted by the DOM-identity projector after a canonical UiLevel root has
  // been paired with its typed runtime level, so page/popup/embedded families
  // all get identical reveal and stale-highlight teardown behavior.
  window.addEventListener('manatos:ui-surface-mounted', revealMountedSurface);

  // Existing render notifications remain a compatibility signal for renderers
  // that rematerialize an already-mounted surface. They use the same behavior.
  window.addEventListener('manatos:ui-surface-rendered', revealMountedSurface);

  // Non-surface UI states (for example the reconnecting/outage overlay) can
  // invalidate physical DOM correlation without changing semantic selection.
  // They use the same canonical reset path as surface lifecycle transitions.
  window.addEventListener('manatos:ui-physical-correlation-invalidated', () => {
    resetLayoutHighlightForSurfaceTransition();
    render();
  });

  // Closing a surface invalidates any physical correlation immediately, before
  // CTX disposal. Do not allow a selected node on the exposed parent surface to
  // resurrect its old overlay until the developer explicitly inspects it again.
  window.addEventListener('manatos:ui-level-disposing', () => {
    resetLayoutHighlightForSurfaceTransition();
    render();
  });

  // Restore paths only if they still exist in the newly rendered page CTX.
  state.selected = nearestExistingPath(state.selected);
  state.expanded = new Set([...state.expanded].filter((path) => pathExists(path)));
  state.expanded.add('ctx');
  if (watchedPath && !pathExists(watchedPath)) watchedPath = nearestExistingPath(watchedPath);

  if (propertiesPanel) {
    applyPropertiesHeight();
    syncPropertiesPresentation();
  }

  rememberSelection(state.selected);
  render({ revealSelection: true });

  // Pre-paint CSS has done its job; normal debugger classes now own visibility.
  delete document.documentElement.dataset.manatosDebugPropertiesOpen;
})();
