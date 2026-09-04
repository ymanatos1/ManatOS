(() => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  const treeElement = document.getElementById('ctxDebugTree');
  if (!runtime?.value || !treeElement) return;

  const CHANGE_EVENT = 'manatos:ctx-change';
  const bootId = document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';

  const ctx = runtime.value;

  /*
   * DEBUG state is browser-session state, not application/business state.
   * sessionStorage intentionally preserves it across ordinary full-page
   * navigation/reloads in the same browser tab, while avoiding SysState/DB
   * persistence. Missing paths are recovered to their nearest surviving
   * parent after the new page CTX has been loaded.
   */
  const DEBUG_STATE_KEY = `manatos.debug.ctx.state.v1.${bootId}`;

  const readPersistedState = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEBUG_STATE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return null;
      return saved;
    } catch {
      return null;
    }
  };

  const persisted = readPersistedState();
  const state = {
    expanded: new Set(Array.isArray(persisted?.expanded) && persisted.expanded.length ? persisted.expanded : ['ctx']),
    selected: typeof persisted?.selected === 'string' ? persisted.selected : 'ctx',
    scrollTop: Number.isFinite(persisted?.scrollTop) ? persisted.scrollTop : 0,
    propertiesOpen: persisted?.propertiesOpen === true,
    propertiesHeight: Number.isFinite(persisted?.propertiesHeight) ? persisted.propertiesHeight : 256,
    debuggerWidth: Number.isFinite(persisted?.debuggerWidth) ? persisted.debuggerWidth : null,
  };

  const persistState = () => {
    try {
      sessionStorage.setItem(DEBUG_STATE_KEY, JSON.stringify({
        expanded: [...state.expanded],
        selected: state.selected,
        scrollTop: state.scrollTop,
        propertiesOpen: state.propertiesOpen,
        propertiesHeight: state.propertiesHeight,
        debuggerWidth: state.debuggerWidth,
        historyEntries: history?.entries ?? [],
        historyIndex: history?.index ?? -1,
        watchedPath,
      }));
    } catch {
      // Debugging must never interfere with normal application behavior.
    }
  };

  const saveState = () => {
    state.scrollTop = treeElement.scrollTop;
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

  const semanticArrayPath = (path, key) =>
    CONTEXT_IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

  /** Resolve one strict downward member, including keyed access into arrays. */
  const resolveMember = (container, member) => {
    if (container == null) return undefined;
    if (Array.isArray(container)) {
      if (typeof member === 'number') return container[member];
      if (member in container) return container[member];
      return container.find((item) => collectionMemberKey(item) === member);
    }
    if (!isObject(container)) return undefined;
    return container[member];
  };

  const displayValue = (value) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'function') return 'ƒ';
    if (isObject(value)) return Array.isArray(value) ? `Array(${value.length})` : '{…}';
    return String(value);
  };

  /**
   * Cheap cycle-safe logical-size estimator for the CTX model. This is useful
   * for development trend monitoring, not a claim about V8 heap allocation:
   * engine object headers, shapes, interning and GC metadata are not observable
   * from ordinary JavaScript.
   */
  const measureContext = (root) => {
    const seen = new WeakSet();
    let nodes = 0;
    let bytes = 0;

    const visit = (value) => {
      nodes += 1;
      if (value === null || value === undefined) { bytes += 8; return; }
      if (typeof value === 'string') { bytes += 16 + value.length * 2; return; }
      if (typeof value === 'number') { bytes += 8; return; }
      if (typeof value === 'boolean') { bytes += 4; return; }
      if (typeof value !== 'object') { bytes += 8; return; }
      if (seen.has(value)) { bytes += 8; return; }
      seen.add(value);
      bytes += Array.isArray(value) ? 24 : 32;
      for (const [key, child] of Object.entries(value)) {
        bytes += 8 + key.length * 2;
        visit(child);
      }
    };

    visit(root);
    return { nodes, bytes };
  };

  const formatLogicalSize = (bytes) => {
    if (bytes < 1024) return `~${bytes} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    return `~${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const childPagePath = (pagePath) => `${pagePath}.page`;

  /** Return the derived slash path for one ctx.page node. */
  const derivedPagePath = (targetPath) => {
    const segments = [];
    let node = ctx.page;
    let path = 'ctx.page';

    while (node) {
      segments.push(node.name);
      if (path === targetPath) return `/${segments.filter(Boolean).join('/')}`;
      node = node.page;
      path = childPagePath(path);
    }
    return null;
  };

  const pageEntityName = (pagePath) => {
    const pageSegments = pagePath.split('.');
    while (pageSegments.length >= 2) {
      const candidatePath = pageSegments.join('.');
      const candidate = getExact(candidatePath);
      const entity = candidate?.fields?.entity?.value;
      if (typeof entity === 'string') return entity;
      if (pageSegments.at(-1) !== 'page') break;
      pageSegments.pop();
    }
    return null;
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
    } else if (ownerPath.startsWith('ctx.page')) {
      entityName = pageEntityName(ownerPath);
    }

    if (!entityName) return undefined;
    const metadata = ctx.entities?.[entityName]?.metadata;
    return metadata?.fieldDefinition?.[fieldName];
  };

  const virtualChildren = (path, value) => {
    const children = [];

    if (path.startsWith('ctx.page') && value && value.name && value.fields) {
      children.push({
        key: 'path()',
        path: `${path}.path()`,
        value: derivedPagePath(path),
        derived: true,
      });
    }

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
    isObject(value) && typeof value.expression === 'string' && isObject(value.ast);

  /** A CTX leaf that contains the source text of a compiled calculation. */
  const isExpressionSourcePath = (path) => typeof path === 'string' && path.endsWith('.expression');

  const objectChildren = (path, value) => {
    if (!isObject(value)) return [];

    if (Array.isArray(value)) {
      const semanticKeys = value.map(collectionMemberKey);
      return value.map((item, index) => {
        const semanticKey = semanticKeys[index];
        const uniqueSemanticKey = semanticKey && semanticKeys.filter((key) => key === semanticKey).length === 1
          ? semanticKey
          : null;
        return {
          // Keep array ordering while presenting the stable record identity as
          // the member key whenever one exists (for example a SysBO UUID).
          key: uniqueSemanticKey ? `[${uniqueSemanticKey}]` : `[${index}]`,
          path: uniqueSemanticKey ? semanticArrayPath(path, uniqueSemanticKey) : `${path}[${index}]`,
          value: item,
          derived: false,
          arrayIndex: index,
        };
      });
    }

    const entries = Object.entries(value).filter(([key]) => !(isCalculatedContextField(value) && key === 'ast'));

    /*
     * Root CTX ordering is presentation-only. Keep company first for the
     * business-context-first debugger view without mutating the runtime object
     * or changing evaluator/path semantics. Unknown future root nodes retain
     * their original relative order after the known roots.
     */
    const presentedEntries = path === 'ctx'
      ? [...entries].sort(([leftKey], [rightKey]) => {
          const preferred = ['company', 'system', 'entities', 'user', 'page'];
          const leftIndex = preferred.indexOf(leftKey);
          const rightIndex = preferred.indexOf(rightKey);
          if (leftIndex < 0 && rightIndex < 0) return 0;
          if (leftIndex < 0) return 1;
          if (rightIndex < 0) return -1;
          return leftIndex - rightIndex;
        })
      : entries;

    return presentedEntries.map(([key, item]) => ({
      key: Array.isArray(item) ? `${key}[]` : key,
      path: `${path}.${key}`,
      value: item,
      derived: false,
    }));
  };

  const childrenFor = (path, value) => [
    ...virtualChildren(path, value),
    ...objectChildren(path, value),
  ];

  function getExact(path) {
    if (path === 'ctx') return ctx;
    const tokens = tokenize(path.replace(/^ctx\.?/, ''));
    let value = ctx;
    for (const token of tokens) {
      if (value == null) return undefined;
      value = resolveMember(value, token);
    }
    return value;
  }

  /**
   * Canonical array syntax is `array[1]`; `array.[1]` remains accepted only
   * as a temporary compatibility form while existing CTX code is migrated.
   * It intentionally rejects '-' and other expression-significant punctuation
   * in dotted identifiers. Brackets accept either non-negative numeric indexes
   * or quoted semantic collection keys such as UUID record ids.
   */
  function tokenize(path) {
    if (!path) return [];
    const normalized = path.replace(/\.\[/g, '[');
    const tokens = [];
    let index = 0;

    while (index < normalized.length) {
      if (normalized[index] === '.') {
        index += 1;
        continue;
      }

      if (normalized[index] === '[') {
        const end = normalized.indexOf(']', index);
        if (end < 0) throw new Error(`Invalid ctx array path: ${path}`);
        const raw = normalized.slice(index + 1, end).trim();
        if (/^\d+$/.test(raw)) {
          tokens.push(Number(raw));
        } else if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
          try {
            tokens.push(raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'"));
          } catch {
            throw new Error(`Invalid ctx array key: ${raw}`);
          }
        } else {
          throw new Error(`Invalid ctx array index/key: ${raw}`);
        }
        index = end + 1;
        continue;
      }

      const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(normalized.slice(index));
      if (!match) throw new Error(`Invalid ctx identifier in path: ${path}`);
      tokens.push(match[0]);
      index += match[0].length;
    }
    return tokens;
  }


  /**
   * Lexical resolver contract used by the future expression evaluator:
   * resolve the FIRST identifier at the current page scope, then parent pages,
   * then root. Once found, all remaining segments are traversed strictly
   * downward; lookup never jumps back to a parent for a missing child. Array
   * members may be traversed by zero-based index (`list[0]`) or by a semantic
   * `id`/`key`: identifier keys use dotted syntax (`platforms.mcrm`), while
   * arbitrary ids use quoted brackets (`entries['<uuid>']`).
   *
   * `metadata()` is a virtual field operation backed by ctx.entities.
   * `path()` is a virtual page operation. Both are calculated, never stored.
   */
  const resolve = (expressionPath, scopePath) => {
    const explicitRoot = expressionPath === 'ctx' || expressionPath.startsWith('ctx.');
    const normalized = explicitRoot ? expressionPath.replace(/^ctx\.?/, '') : expressionPath;
    const parts = normalized.replace(/\.\[/g, '[').split('.').filter(Boolean);
    if (!parts.length) return explicitRoot ? ctx : undefined;

    const first = parts.shift();
    const firstTokens = tokenize(first);
    if (firstTokens.length !== 1 || typeof firstTokens[0] !== 'string') {
      throw new Error(`A ctx expression must start with an identifier: ${expressionPath}`);
    }

    let basePath = 'ctx';
    let value;

    if (explicitRoot) {
      value = resolveMember(ctx, firstTokens[0]);
      basePath = `ctx.${firstTokens[0]}`;
    } else {
      const scopes = [];
      let candidate = scopePath || (() => {
        let path = 'ctx.page';
        let node = ctx.page;
        while (node?.page) {
          node = node.page;
          path += '.page';
        }
        return node ? path : 'ctx';
      })();

      while (candidate.startsWith('ctx.page')) {
        scopes.push(candidate);
        if (!candidate.endsWith('.page')) break;
        candidate = candidate.slice(0, -5);
      }
      scopes.push('ctx');

      for (const scope of scopes) {
        const scopeValue = getExact(scope);

        // Page/user field collections form the lexical variable namespace.
        if (
          isObject(scopeValue?.fields) &&
          Object.prototype.hasOwnProperty.call(scopeValue.fields, firstTokens[0])
        ) {
          const field = scopeValue.fields[firstTokens[0]];
          /*
           * Match the server evaluator's lexical field semantics. A bare field
           * name resolves to its scalar `.value`, but a path continuing below
           * the field (for example `principalType.option.canHaveParent`) must
           * keep the field wrapper so declarative metadata attached to the
           * selected enum item remains addressable in browser-side reactivity.
           */
          value = parts.length ? field : field?.value;
          basePath = `${scope}.fields.${firstTokens[0]}`;
          break;
        }

        if (isObject(scopeValue) && Object.prototype.hasOwnProperty.call(scopeValue, firstTokens[0])) {
          value = scopeValue[firstTokens[0]];
          basePath = `${scope}.${firstTokens[0]}`;
          break;
        }
      }
    }

    if (value === undefined) return undefined;

    for (const part of parts) {
      if (part === 'metadata()') {
        value = metadataForField(basePath);
        basePath += '.metadata()';
        if (value === undefined) return undefined;
        continue;
      }

      if (part === 'path()') {
        value = derivedPagePath(basePath);
        basePath += '.path()';
        if (value === null) return undefined;
        continue;
      }

      const tokens = tokenize(part);
      for (const token of tokens) {
        if (value == null) return undefined;
        value = resolveMember(value, token);
        basePath += typeof token === 'number' ? `[${token}]` : `.${token}`;
      }
    }

    return value;
  };

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
      else if (ownerPath.startsWith('ctx.page')) entityName = pageEntityName(ownerPath);
      if (!entityName) return null;

      return `ctx.entities.${entityName}.metadata.fieldDefinition.${fieldName}`;
    }

    if (path.endsWith('.path()')) {
      const pagePath = path.slice(0, -7);
      return `${pagePath}.name`;
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
    entries: Array.isArray(persisted?.historyEntries) ? persisted.historyEntries.filter((value) => typeof value === 'string') : [],
    index: Number.isInteger(persisted?.historyIndex) ? persisted.historyIndex : -1,
  };
  if (history.index >= history.entries.length) history.index = history.entries.length - 1;

  const backButton = document.getElementById('ctxDebugBack');
  const forwardButton = document.getElementById('ctxDebugForward');
  const watchButton = document.getElementById('ctxDebugWatch');
  const cliButton = document.getElementById('ctxDebugCli');
  const selectionElement = document.getElementById('ctxDebugSelection');
  const statsElement = document.getElementById('ctxDebugStats');

  /*
   * The statistics explanation intentionally uses Bootstrap rather than the
   * browser's native `title` tooltip. Native title rendering is single-line
   * or browser-dependent, while this debugger text needs a stable four-line
   * layout and must escape the debug panel's overflow clipping.
   */
  if (statsElement && window.bootstrap?.Tooltip) {
    bootstrap.Tooltip.getOrCreateInstance(statsElement, {
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
  const findButton = document.getElementById('ctxDebugFind');
  const findBox = document.getElementById('ctxDebugFindBox');
  const findInput = document.getElementById('ctxDebugFindInput');
  const findHistoryList = document.getElementById('ctxDebugFindHistory');
  const FIND_HISTORY_KEY = `manatos.debug.ctx.find-history.v1.${bootId}`;
  const FIND_HISTORY_LIMIT = 30;
  let watchedPath = typeof persisted?.watchedPath === 'string' ? persisted.watchedPath : null;
  let changedPath = null;
  let changedTimer = null;

  const pathExists = (path) => {
    if (path === 'ctx') return true;
    if (path.endsWith('.path()')) return derivedPagePath(path.slice(0, -7)) !== null;
    if (path.endsWith('.metadata()')) return metadataForField(path.slice(0, -11)) !== undefined;
    if (path.endsWith('.__source')) return sourceForDerived(path.slice(0, -9)) !== null;
    try { return getExact(path) !== undefined; } catch { return false; }
  };

  const parentPath = (path) => {
    if (!path || path === 'ctx') return 'ctx';
    const withoutVirtual = path.replace(/\.__source$/, '').replace(/\.metadata\(\)$|\.path\(\)$/, '');
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
    if (forwardButton) forwardButton.disabled = history.index < 0 || history.index >= history.entries.length - 1;
    if (selectionElement) {
      selectionElement.textContent = nodeNameFromPath(state.selected);
      selectionElement.title = state.selected;
    }
    if (cliButton) {
      cliButton.title = `Open CLI at ${state.selected}`;
      cliButton.setAttribute('aria-label', `Open CLI at ${state.selected}`);
    }
    if (watchButton) {
      const isDerived = state.selected.endsWith('()') || state.selected.endsWith('.__source');
      watchButton.disabled = isDerived;
      watchButton.classList.toggle('is-active', watchedPath === state.selected);
      watchButton.title = watchedPath === state.selected
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

  const ensureSelectedVisible = () => {
    const selectedRow = treeElement.querySelector(
      `.ctx-debug-row[data-ctx-path="${CSS.escape(state.selected)}"]`,
    );
    selectedRow?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const selectPath = (requestedPath, { remember = true, expandSelected = false } = {}) => {
    const path = nearestExistingPath(requestedPath);
    expandAncestors(path);
    if (expandSelected) {
      let selectedValue;
      try { selectedValue = path === 'ctx' ? ctx : getExact(path); } catch { selectedValue = undefined; }
      if (isObject(selectedValue) && !isCalculatedContextField(selectedValue) && objectChildren(path, selectedValue).length > 0) {
        state.expanded.add(path);
      }
    }
    state.selected = path;
    if (remember) rememberSelection(path);

    // Node selection and history navigation must not change the developer's
    // persisted Properties-panel preference. render() applies that preference
    // consistently after the selection changes.
    propertiesPanel?.classList.toggle('d-none', !state.propertiesOpen);
    propertiesPanel?.setAttribute('aria-hidden', String(!state.propertiesOpen));
    saveState();
    render({ revealSelection: true });
  };

  cliButton?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('manatos:debug-cli-toggle', {
      detail: { instanceKey: 'ctx-viewer', path: state.selected },
    }));
  });

  window.addEventListener('manatos:debug-cli-state', (event) => {
    if (!(event instanceof CustomEvent) || event.detail?.instanceKey !== 'ctx-viewer' || !cliButton) return;
    const open = event.detail?.open === true;
    cliButton.classList.toggle('is-active', open);
    cliButton.setAttribute('aria-pressed', String(open));
    cliButton.title = open ? 'CTX CLI is open; click to hide or retarget from another node' : `Open CLI at ${state.selected}`;
  });

  window.addEventListener('manatos:ctx-viewer-select', (event) => {
    const requestedPath = event instanceof CustomEvent ? event.detail?.path : null;
    if (typeof requestedPath !== 'string' || !requestedPath) return;
    selectPath(requestedPath, { expandSelected: event.detail?.expand === true });
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

  const readFindHistory = () => {
    try {
      const values = JSON.parse(sessionStorage.getItem(FIND_HISTORY_KEY) || '[]');
      return Array.isArray(values)
        ? values.filter((v) => typeof v === 'string' && v.trim()).slice(0, FIND_HISTORY_LIMIT)
        : [];
    } catch { return []; }
  };

  const closeFindHistory = () => findHistoryList?.classList.add('d-none');

  const refreshFindHistory = () => {
    if (!findHistoryList) return;
    const values = readFindHistory();
    findHistoryList.replaceChildren(...values.map((value) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'ctx-debug-find-history-item';
      option.textContent = value;
      option.title = value;
      option.setAttribute('role', 'option');
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => {
        if (findInput) findInput.value = value;
        closeFindHistory();
        findNextByName(value);
      });
      return option;
    }));
    findHistoryList.classList.toggle('d-none', values.length === 0);
  };

  const rememberFind = (term) => {
    const values = [term, ...readFindHistory().filter((v) => v !== term)].slice(0, FIND_HISTORY_LIMIT);
    try { sessionStorage.setItem(FIND_HISTORY_KEY, JSON.stringify(values)); } catch { /* debugger only */ }
    refreshFindHistory();
  };

  const findNextByName = (rawTerm) => {
    const term = rawTerm.trim();
    if (!term) return;
    rememberFind(term);
    const paths = allRealNodePaths();
    const current = Math.max(0, paths.indexOf(state.selected));
    const ordered = [...paths.slice(current + 1), ...paths.slice(0, current + 1)];
    const exact = ordered.find((path) => nodeNameFromPath(path) === term);
    const match = exact ?? ordered.find((path) => nodeNameFromPath(path).toLowerCase().includes(term.toLowerCase()));
    if (match) selectPath(match);
  };

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
      return { path, value: metadataForField(path.slice(0, -11)), derived: true, source: false, sourcePath: sourceForDerived(path) };
    }
    if (path.endsWith('.path()')) {
      return { path, value: derivedPagePath(path.slice(0, -7)), derived: true, source: false, sourcePath: sourceForDerived(path) };
    }
    return { path, value: getExact(path), derived: false, source: false, sourcePath: null };
  };

  const astDescriptor = (node) => {
    if (!node || typeof node !== 'object') return { value: 'Invalid', type: 'AST node', icon: 'bi-exclamation-triangle' };
    switch (node.kind) {
      case 'literal': {
        const literalValue = typeof node.value === 'string'
          ? `'${String(node.value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
          : displayValue(node.value);
        return { value: literalValue, type: 'literal', icon: 'bi-quote' };
      }
      case 'variable': return { value: node.path, type: 'variable', icon: 'bi-tag' };
      case 'binary': return { value: node.operator, type: 'binary', icon: 'bi-calculator' };
      case 'unary': return { value: node.operator, type: 'unary', icon: 'bi-calculator' };
      case 'group': return { value: '(...)', type: 'group', icon: 'bi-parentheses' };
      case 'conditional': return { value: '?:', type: 'conditional', icon: 'bi-signpost-split' };
      case 'function': return { value: node.functionName, type: 'function', icon: 'bi-gear' };
      default: return { value: String(node.kind ?? 'Unknown'), type: 'unknown', icon: 'bi-question-circle' };
    }
  };

  const astChildren = (node) => {
    if (!node || typeof node !== 'object') return [];
    switch (node.kind) {
      case 'binary': return [
        {role: 'left', node: node.left},
        {role: 'right', node: node.right},
      ];
      case 'unary': return [{role: 'operand', node: node.operand}];
      case 'group': return [{role: 'expression', node: node.expression}];
      case 'conditional': return [
        {role: 'condition', node: node.condition},
        {role: 'true', node: node.whenTrue},
        {role: 'false', node: node.whenFalse},
      ];
      case 'function': return (node.arguments || []).map((argument, index) => ({role: `arg[${index}]`, node: argument}));
      default: return [];
    }
  };

  const renderAstNode = (node, role = null) => {
    const item = document.createElement('li');
    item.className = 'ctx-debug-ast-node';

    const line = document.createElement('div');
    line.className = 'ctx-debug-ast-line';

    const descriptor = astDescriptor(node);

    const icon = document.createElement('i');
    icon.className = `bi ${descriptor.icon} ctx-debug-ast-icon`;
    icon.setAttribute('aria-hidden', 'true');
    line.appendChild(icon);

    const value = document.createElement('span');
    value.className = `ctx-debug-ast-value ctx-debug-ast-${String(node?.kind ?? 'unknown')}`;
    value.textContent = descriptor.value;
    line.appendChild(value);

    if (role) {
      const roleElement = document.createElement('span');
      roleElement.className = 'ctx-debug-ast-role';
      roleElement.textContent = `(${role})`;
      line.appendChild(roleElement);
    }

    const separator = document.createElement('span');
    separator.className = 'ctx-debug-ast-separator';
    separator.textContent = '-';
    line.appendChild(separator);

    const type = document.createElement('span');
    type.className = 'ctx-debug-ast-type';
    type.textContent = descriptor.type;
    line.appendChild(type);

    item.appendChild(line);

    const children = astChildren(node);
    if (children.length) {
      const list = document.createElement('ul');
      list.className = 'ctx-debug-ast-children';
      children.forEach((child) => list.appendChild(renderAstNode(child.node, child.role)));
      item.appendChild(list);
    }
    return item;
  };

  const renderAst = (ast) => {
    const section = document.createElement('div');
    section.className = 'ctx-debug-ast-section';
    const title = document.createElement('div');
    title.className = 'ctx-debug-ast-title';
    title.textContent = 'AST';
    const tree = document.createElement('ul');
    tree.className = 'ctx-debug-ast-tree';
    tree.appendChild(renderAstNode(ast));
    section.append(title, tree);
    return section;
  };

  const renderProperties = () => {
    if (!propertiesPanel || !propertiesBody || propertiesPanel.classList.contains('d-none')) return;
    const info = selectedNodeInfo();
    const kind = nodeKind(info.path, info.value, info.derived, info.source);
    const children = info.derived ? [] : objectChildren(info.path, info.value);
    const calculated = isCalculatedContextField(info.value);
    if (propertiesTitle) {
      const variableName = nodeNameFromPath(info.path);
      const prefix = info.path.slice(0, Math.max(0, info.path.length - variableName.length));
      const variableElement = document.createElement('strong');
      variableElement.className = 'ctx-debug-properties-variable-name';
      variableElement.textContent = variableName;
      propertiesTitle.replaceChildren(document.createTextNode(prefix), variableElement);
      propertiesTitle.title = info.path;
    }
    const rows = [
      ['Path', info.path],
      ['Kind', calculated ? 'calculated' : kind],
      ['JavaScript type', info.value === null ? 'null' : Array.isArray(info.value) ? 'array' : typeof info.value],
      ['Value', displayValue(info.value)],
      ['Children', String(children.length)],
      ['Watchable', info.derived || info.source ? 'no' : 'yes'],
    ];
    if (info.sourcePath) rows.splice(4, 0, ['Derived from', info.sourcePath]);
    if (calculated) rows.splice(4, 0, ['Expression', info.value.expression]);

    propertiesBody.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'ctx-debug-property-row';
      const labelElement = document.createElement('span');
      labelElement.className = 'ctx-debug-property-label';
      labelElement.textContent = label;
      const valueElement = document.createElement('span');
      valueElement.className = 'ctx-debug-property-value';
      const formulaValue = label === 'Expression' || (label === 'Value' && isExpressionSourcePath(info.path));
      if (formulaValue && typeof value === 'string' && window.ManatOSDebugExpression) {
        valueElement.classList.add('ctx-debug-expression');
        window.ManatOSDebugExpression.highlightElement(valueElement, value);
      } else {
        valueElement.textContent = value;
      }
      if (label === 'Derived from' && info.sourcePath) {
        valueElement.classList.add('is-link');
        valueElement.title = `Go to ${info.sourcePath}`;
        valueElement.addEventListener('click', () => {
          propertiesPanel.classList.add('d-none');
          propertiesPanel.setAttribute('aria-hidden', 'true');
          selectPath(info.sourcePath);
        });
      }
      row.append(labelElement, valueElement);
      propertiesBody.appendChild(row);
      if (calculated && label === 'Expression') {
        propertiesBody.appendChild(renderAst(info.value.ast));
      }
    }
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
    toggle.setAttribute('aria-label', expandable ? (expanded ? `Collapse ${key}` : `Expand ${key}`) : 'Leaf node');
    if (expandable) {
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        state.selected = path;
        rememberSelection(path);
        if (state.expanded.has(path)) state.expanded.delete(path);
        else state.expanded.add(path);
        saveState();
        render({ revealSelection: true });
      });
    }
    row.appendChild(toggle);

    const keyElement = document.createElement('span');
    keyElement.className = `ctx-debug-key${derived ? ' ctx-debug-derived' : ''}`;
    keyElement.textContent = key;
    row.appendChild(keyElement);

    if (!source) {
      const valueElement = document.createElement('span');
      valueElement.className = 'ctx-debug-value';
      if (derived) {
        valueElement.textContent = '= derived';
      } else if (!isObject(value)) {
        if (typeof value === 'string' && isExpressionSourcePath(path) && window.ManatOSDebugExpression) {
          valueElement.appendChild(document.createTextNode('= '));
          const formulaElement = document.createElement('span');
          formulaElement.className = 'ctx-debug-expression';
          window.ManatOSDebugExpression.highlightElement(formulaElement, value);
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
        selectPath(sourcePath);
      });
    } else {
      row.addEventListener('click', () => {
        selectPath(path);
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

  const render = ({ revealSelection = false } = {}) => {
    const scrollTop = treeElement.scrollTop;
    const recovered = nearestExistingPath(state.selected);
    if (recovered !== state.selected) {
      state.selected = recovered;
      rememberSelection(recovered);
    }

    state.expanded = new Set([...state.expanded].filter((path) => pathExists(path)));
    treeElement.replaceChildren(renderNode({ key: 'ctx', path: 'ctx', value: ctx }));
    treeElement.scrollTop = Math.min(scrollTop || state.scrollTop, treeElement.scrollHeight);

    if (statsElement) {
      const measured = measureContext(ctx);
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
    if (revealSelection) requestAnimationFrame(ensureSelectedVisible);
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

  refreshFindHistory();
  findButton?.addEventListener('click', () => {
    findBox?.classList.toggle('d-none');
    if (findBox && !findBox.classList.contains('d-none')) {
      refreshFindHistory();
      findInput?.focus();
      findInput?.select();
    } else {
      closeFindHistory();
    }
  });
  findInput?.addEventListener('focus', refreshFindHistory);
  findInput?.addEventListener('input', refreshFindHistory);
  findInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      closeFindHistory();
      findNextByName(findInput.value);
    } else if (event.key === 'Escape') {
      closeFindHistory();
      findBox?.classList.add('d-none');
      findButton?.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (findBox && !findBox.contains(event.target) && event.target !== findButton) closeFindHistory();
  });

  // The shared shell owns the outer Developer Tools dock resize.


  const DEFAULT_PROPERTIES_HEIGHT = 256;
  const applyPropertiesHeight = (requested = state.propertiesHeight) => {
    if (!propertiesPanel) return;
    const panelHeight = document.getElementById('debugPanel')?.clientHeight || window.innerHeight;
    const minHeight = 136;
    const maxHeight = Math.max(minHeight, Math.floor(panelHeight * 2 / 3));
    state.propertiesHeight = Math.max(minHeight, Math.min(Number(requested) || DEFAULT_PROPERTIES_HEIGHT, maxHeight));
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
    propertiesPanel.classList.toggle('d-none', !opening);
    propertiesPanel.setAttribute('aria-hidden', String(!opening));
    if (opening) { applyPropertiesHeight(); renderProperties(); }
    persistState();
    requestAnimationFrame(ensureSelectedVisible);
  });

  propertiesClose?.addEventListener('click', () => {
    state.propertiesOpen = false;
    propertiesPanel?.classList.add('d-none');
    propertiesPanel?.setAttribute('aria-hidden', 'true');
    persistState();
    requestAnimationFrame(ensureSelectedVisible);
  });

  // CTX mutation/event infrastructure is provided by /js/ctx-runtime.js.
  window.addEventListener(CHANGE_EVENT, (event) => {
    const path = event.detail?.path;
    if (watchedPath && typeof path === 'string' && (path === watchedPath || path.startsWith(`${watchedPath}.`) || path.startsWith(`${watchedPath}[`))) {
      changedPath = watchedPath;
      window.clearTimeout(changedTimer);
      changedTimer = window.setTimeout(() => { changedPath = null; render(); }, 1400);
    }
    render();
  });

  // Restore paths only if they still exist in the newly rendered page CTX.
  state.selected = nearestExistingPath(state.selected);
  state.expanded = new Set([...state.expanded].filter((path) => pathExists(path)));
  state.expanded.add('ctx');
  if (watchedPath && !pathExists(watchedPath)) watchedPath = nearestExistingPath(watchedPath);

  if (propertiesPanel) {
    applyPropertiesHeight();
    propertiesPanel.classList.toggle('d-none', !state.propertiesOpen);
    propertiesPanel.setAttribute('aria-hidden', String(!state.propertiesOpen));
  }

  rememberSelection(state.selected);
  render({ revealSelection: true });

  // Pre-paint CSS has done its job; normal debugger classes now own visibility.
  delete document.documentElement.dataset.manatosDebugPropertiesOpen;
})();
