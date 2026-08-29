(() => {
  'use strict';

  const snapshotElement = document.getElementById('manatosCtxSnapshot');
  const treeElement = document.getElementById('ctxDebugTree');
  if (!snapshotElement || !treeElement) return;

  const CHANGE_EVENT = 'manatos:ctx-change';

  let ctx;
  try {
    ctx = JSON.parse(snapshotElement.textContent || 'null');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx !== 'object') return;

  /*
   * Debugger tree state is intentionally page-session local. Every newly
   * rendered page starts from the same predictable inspection position:
   * only the ctx root is expanded and selected. Context-change rerenders
   * keep the in-memory state for that page, but it is not persisted across
   * reloads/navigation and does not belong in SysState/database storage.
   */
  const state = {
    expanded: new Set(['ctx']),
    selected: 'ctx',
    scrollTop: 0,
  };

  const saveState = () => {
    // Retain only transient scroll state for rerenders in this page instance.
    state.scrollTop = treeElement.scrollTop;
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
      if (typeof candidate === 'string' && CONTEXT_IDENTIFIER.test(candidate)) return candidate;
    }
    return null;
  };

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
          key: uniqueSemanticKey ?? `[${index}]`,
          path: uniqueSemanticKey ? `${path}.${uniqueSemanticKey}` : `${path}[${index}]`,
          value: item,
          derived: false,
          arrayIndex: index,
        };
      });
    }

    return Object.entries(value).map(([key, item]) => ({
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
   * in identifiers; bracket indexes are non-negative integers.
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
        const raw = normalized.slice(index + 1, end);
        if (!/^\d+$/.test(raw)) throw new Error(`Invalid ctx array index: ${raw}`);
        tokens.push(Number(raw));
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
   * members may be traversed by zero-based index (`platforms[0]`) or by an
   * expression-safe semantic `id`/`key` (`platforms.mcrm`).
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
          value = scopeValue.fields[firstTokens[0]]?.value;
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
    entries: [],
    index: -1,
  };

  const backButton = document.getElementById('ctxDebugBack');
  const forwardButton = document.getElementById('ctxDebugForward');
  const watchButton = document.getElementById('ctxDebugWatch');
  const selectionElement = document.getElementById('ctxDebugSelection');
  const propertiesButton = document.getElementById('ctxDebugProperties');
  const propertiesPanel = document.getElementById('ctxDebugPropertiesPanel');
  const propertiesBody = document.getElementById('ctxDebugPropertiesBody');
  const propertiesClose = document.getElementById('ctxDebugPropertiesClose');
  let watchedPath = null;
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
      selectionElement.textContent = state.selected;
      selectionElement.title = state.selected;
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

  const selectPath = (requestedPath, { remember = true } = {}) => {
    const path = nearestExistingPath(requestedPath);
    expandAncestors(path);
    state.selected = path;
    if (remember) rememberSelection(path);
    saveState();
    render({ revealSelection: true });
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

  const renderProperties = () => {
    if (!propertiesPanel || !propertiesBody || propertiesPanel.classList.contains('d-none')) return;
    const info = selectedNodeInfo();
    const kind = nodeKind(info.path, info.value, info.derived, info.source);
    const children = info.derived ? [] : objectChildren(info.path, info.value);
    const rows = [
      ['Path', info.path],
      ['Kind', kind],
      ['JavaScript type', info.value === null ? 'null' : Array.isArray(info.value) ? 'array' : typeof info.value],
      ['Value', displayValue(info.value)],
      ['Children', String(children.length)],
      ['Watchable', info.derived || info.source ? 'no' : 'yes'],
    ];
    if (info.sourcePath) rows.splice(4, 0, ['Derived from', info.sourcePath]);

    propertiesBody.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'ctx-debug-property-row';
      const labelElement = document.createElement('span');
      labelElement.className = 'ctx-debug-property-label';
      labelElement.textContent = label;
      const valueElement = document.createElement('span');
      valueElement.className = 'ctx-debug-property-value';
      valueElement.textContent = value;
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
        valueElement.textContent = `= ${displayValue(value)}`;
      }
      if (valueElement.textContent) row.appendChild(valueElement);
    }

    if (source) {
      row.title = `Go to ${sourcePath}`;
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        selectPath(sourcePath);
      });
    } else {
      row.addEventListener('click', () => {
        state.selected = path;
        rememberSelection(path);
        saveState();
        render({ revealSelection: true });
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
    updateToolbar();
  });

  propertiesButton?.addEventListener('click', () => {
    if (!propertiesPanel) return;
    const opening = propertiesPanel.classList.contains('d-none');
    propertiesPanel.classList.toggle('d-none', !opening);
    propertiesPanel.setAttribute('aria-hidden', String(!opening));
    if (opening) renderProperties();
    requestAnimationFrame(ensureSelectedVisible);
  });

  propertiesClose?.addEventListener('click', () => {
    propertiesPanel?.classList.add('d-none');
    propertiesPanel?.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(ensureSelectedVisible);
  });

  const emitChange = (operation, path, oldValue, newValue, cause = {}) => {
    const eventId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const rootEventId = cause.rootEventId || cause.eventId || eventId;
    const detail = {
      operation, path, oldValue, newValue,
      cause: {
        source: cause.source || 'ctx-runtime', eventId, rootEventId,
        triggerPath: cause.triggerPath || path,
      },
    };
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
    return detail;
  };

  const mutate = (operation, path, value, cause) => {
    const tokens = tokenize(path.replace(/^ctx\.?/, ''));
    if (!tokens.length) throw new Error('The ctx root cannot be replaced by this operation.');
    let parent = ctx;
    for (const token of tokens.slice(0, -1)) {
      if (!isObject(parent[token])) throw new Error(`ctx path not found: ${path}`);
      parent = parent[token];
    }
    const key = tokens.at(-1);
    const oldValue = parent[key];
    if (operation === 'delete') {
      if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
      else delete parent[key];
      emitChange(operation, path, oldValue, undefined, cause);
      return;
    }
    if (operation === 'add' && Array.isArray(parent[key])) {
      parent[key].push(value);
      emitChange(operation, path, oldValue, parent[key], cause);
      return;
    }
    parent[key] = value;
    emitChange(operation, path, oldValue, value, cause);
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.ctx = {
    value: ctx, eventName: CHANGE_EVENT, get: getExact, resolve,
    set: (path, value, cause) => mutate('set', path, value, cause),
    replace: (path, value, cause) => mutate('replace', path, value, cause),
    delete: (path, cause) => mutate('delete', path, undefined, cause),
    add: (path, value, cause) => mutate('add', path, value, cause),
    emit: emitChange, tokenize,
  };

  window.addEventListener(CHANGE_EVENT, (event) => {
    const path = event.detail?.path;
    if (watchedPath && typeof path === 'string' && (path === watchedPath || path.startsWith(`${watchedPath}.`) || path.startsWith(`${watchedPath}[`))) {
      changedPath = watchedPath;
      window.clearTimeout(changedTimer);
      changedTimer = window.setTimeout(() => { changedPath = null; render(); }, 1400);
    }
    render();
  });

  state.selected = nearestExistingPath(state.selected);
  rememberSelection(state.selected);
  render();
})();
