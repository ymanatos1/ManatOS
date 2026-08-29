(() => {
  'use strict';

  const snapshotElement = document.getElementById('manatosCtxSnapshot');
  const treeElement = document.getElementById('ctxDebugTree');
  if (!snapshotElement || !treeElement) return;

  const STORAGE_KEY = 'manatos.debug.ctx.tree.state.v1';
  const CHANGE_EVENT = 'manatos:ctx-change';

  let ctx;
  try {
    ctx = JSON.parse(snapshotElement.textContent || 'null');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx !== 'object') return;

  const readState = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        expanded: new Set(Array.isArray(value.expanded) ? value.expanded : ['ctx']),
        selected: typeof value.selected === 'string' ? value.selected : 'ctx',
        scrollTop: Number.isFinite(value.scrollTop) ? value.scrollTop : 0,
      };
    } catch {
      return { expanded: new Set(['ctx']), selected: 'ctx', scrollTop: 0 };
    }
  };

  const state = readState();

  const saveState = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expanded: [...state.expanded],
        selected: state.selected,
        scrollTop: treeElement.scrollTop,
      }),
    );
  };

  const isObject = (value) => value !== null && typeof value === 'object';

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
    const fieldName = path.slice(index + marker.length).split('.')[0];
    let entityName = null;

    if (ownerPath === 'ctx.user') {
      entityName = ctx.user?.entity ?? null;
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
      return value.map((item, index) => ({
        key: `[${index}]`,
        path: `${path}[${index}]`,
        value: item,
        derived: false,
      }));
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
      value = value[token];
    }
    return value;
  }

  /**
   * Tokenizer accepts both `array[1]` and `array.[1]`.
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
   * downward; lookup never jumps back to a parent for a missing child.
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
      value = ctx[firstTokens[0]];
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
        value = value[token];
        basePath += typeof token === 'number' ? `[${token}]` : `.${token}`;
      }
    }

    return value;
  };

  const renderNode = ({ key, path, value, derived = false }) => {
    const children = childrenFor(path, value);
    const expandable = children.length > 0;
    const expanded = expandable && state.expanded.has(path);

    const node = document.createElement('div');
    node.className = 'ctx-debug-node';

    const row = document.createElement('div');
    row.className = `ctx-debug-row${state.selected === path ? ' is-selected' : ''}`;
    row.dataset.ctxPath = path;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-selected', String(state.selected === path));
    if (expandable) row.setAttribute('aria-expanded', String(expanded));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ctx-debug-toggle';
    toggle.tabIndex = -1;
    toggle.textContent = expandable ? (expanded ? '▾' : '▸') : '·';
    row.appendChild(toggle);

    const keyElement = document.createElement('span');
    keyElement.className = `ctx-debug-key${derived ? ' ctx-debug-derived' : ''}`;
    keyElement.textContent = key;
    row.appendChild(keyElement);

    const valueElement = document.createElement('span');
    valueElement.className = 'ctx-debug-value';
    valueElement.textContent = `= ${displayValue(value)}`;
    row.appendChild(valueElement);

    const toggleExpansion = () => {
      if (!expandable) return false;
      if (state.expanded.has(path)) state.expanded.delete(path);
      else state.expanded.add(path);
      state.selected = path;
      saveState();
      render();
      return true;
    };

    const select = () => {
      state.selected = path;
      saveState();
      render();
    };

    // Objects/arrays behave like a normal tree control: the entire row toggles
    // expansion. Leaf rows only change the current selection.
    row.addEventListener('click', () => {
      if (!toggleExpansion()) select();
    });

    if (expandable) {
      const action = document.createElement('span');
      action.className = 'ctx-debug-expand-action';
      action.textContent = expanded ? '[-]' : '[+]';
      action.setAttribute('aria-hidden', 'true');
      row.appendChild(action);
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

  const pathExists = (path) => {
    if (path === 'ctx') return true;
    if (path.endsWith('.path()')) return derivedPagePath(path.slice(0, -7)) !== null;
    if (path.endsWith('.metadata()')) return metadataForField(path.slice(0, -11)) !== undefined;
    try {
      return getExact(path) !== undefined;
    } catch {
      return false;
    }
  };

  const nearestExistingPath = (path) => {
    let candidate = path || 'ctx';
    while (candidate !== 'ctx' && !pathExists(candidate)) {
      candidate = candidate
        .replace(/\.metadata\(\)$|\.path\(\)$/, '')
        .replace(/\[\d+\]$/, '')
        .replace(/\.[^.]+$/, '');
      if (!candidate) candidate = 'ctx';
    }
    return pathExists(candidate) ? candidate : 'ctx';
  };

  const render = () => {
    const scrollTop = treeElement.scrollTop;
    state.selected = nearestExistingPath(state.selected);

    // Stale expansion paths are harmless but pruning keeps persisted state tidy.
    state.expanded = new Set([...state.expanded].filter((path) => pathExists(path)));

    treeElement.replaceChildren(renderNode({ key: 'ctx', path: 'ctx', value: ctx }));
    treeElement.scrollTop = Math.min(scrollTop || state.scrollTop, treeElement.scrollHeight);
    saveState();
  };

  treeElement.addEventListener('scroll', () => {
    window.clearTimeout(treeElement._ctxSaveTimer);
    treeElement._ctxSaveTimer = window.setTimeout(saveState, 120);
  });

  const emitChange = (operation, path, oldValue, newValue, cause = {}) => {
    const eventId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const rootEventId = cause.rootEventId || cause.eventId || eventId;
    const detail = {
      operation,
      path,
      oldValue,
      newValue,
      cause: {
        source: cause.source || 'ctx-runtime',
        eventId,
        rootEventId,
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

  /**
   * Public browser runtime. This is intentionally small: it establishes the
   * event-driven mutation seam required by the debugger and later expression
   * dependencies without implementing the expression evaluator prematurely.
   */
  window.ManatOS = window.ManatOS || {};
  window.ManatOS.ctx = {
    value: ctx,
    eventName: CHANGE_EVENT,
    get: getExact,
    resolve,
    set: (path, value, cause) => mutate('set', path, value, cause),
    replace: (path, value, cause) => mutate('replace', path, value, cause),
    delete: (path, cause) => mutate('delete', path, undefined, cause),
    add: (path, value, cause) => mutate('add', path, value, cause),
    emit: emitChange,
    tokenize,
  };

  window.addEventListener(CHANGE_EVENT, () => render());

  render();
})();
