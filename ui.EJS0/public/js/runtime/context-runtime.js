(() => {
  'use strict';

  const snapshotElement = document.getElementById('manatosCtxSnapshot');
  if (!snapshotElement) return;

  // Global logical CTX statistics are accounted as nodes enter and leave the
  // runtime. There is no retrospective full-tree measurement. Initial JSON
  // deserialization is itself the creation boundary, so its reviver accounts
  // each value exactly once as it is materialized.
  const statistics = { nodes: 0, bytes: 0 };
  const valueBytes = (value) => {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return 16 + value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (typeof value === 'object') return Array.isArray(value) ? 24 : 32;
    return 8;
  };
  const memberBytes = (key) => (key === '' ? 0 : 8 + String(key).length * 2);
  const accountCreatedNode = (key, value) => {
    statistics.nodes += 1;
    statistics.bytes += valueBytes(value) + memberBytes(key);
  };
  const accountDisposedNode = (key, value) => {
    statistics.nodes -= 1;
    statistics.bytes -= valueBytes(value) + memberBytes(key);
  };
  const accountTreeLifecycle = (key, value, accountNode) => {
    const seen = new WeakSet();
    const visit = (memberKey, memberValue) => {
      accountNode(memberKey, memberValue);
      if (memberValue === null || typeof memberValue !== 'object') return;
      if (seen.has(memberValue)) return;
      seen.add(memberValue);
      for (const [childKey, child] of Object.entries(memberValue)) visit(childKey, child);
    };
    visit(key, value);
  };
  const accountCreatedTree = (key, value) => accountTreeLifecycle(key, value, accountCreatedNode);
  const accountDisposedTree = (key, value) => accountTreeLifecycle(key, value, accountDisposedNode);
  const accountReplacement = (oldValue, newValue) => {
    accountDisposedTree('', oldValue);
    accountCreatedTree('', newValue);
  };
  const statisticsSnapshot = () =>
    Object.freeze({ nodes: statistics.nodes, bytes: Math.max(0, statistics.bytes) });

  let ctx;
  try {
    ctx = JSON.parse(snapshotElement.textContent || 'null', (key, value) => {
      accountCreatedNode(key, value);
      return value;
    });
  } catch {
    ctx = null;
    statistics.nodes = 0;
    statistics.bytes = 0;
  }
  if (!ctx || typeof ctx !== 'object') return;

  const CHANGE_EVENT = 'manatos:ctx-change';
  const isObject = (value) => value !== null && typeof value === 'object';
  const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  const NODE_PROPERTIES = Symbol.for('manatos.ctx.node-properties');

  /*
   * Subscriber telemetry is kept beside CTX values, just like semantic node
   * metadata. It describes who is interested in a path without inserting
   * debugger/runtime bookkeeping into application data.
   */
  const subscribers = new Map();
  let nextSubscriberId = 1;

  const pathsOverlap = (left, right) => {
    if (left === right) return true;
    if (left === '*' || right === '*') return true;
    const childOf = (candidate, parent) =>
      candidate.startsWith(`${parent}.`) || candidate.startsWith(`${parent}[`);
    return childOf(left, right) || childOf(right, left);
  };

  const trackSubscriber = (paths, details = {}) => {
    const normalizedPaths = [
      ...new Set(
        (Array.isArray(paths) ? paths : [paths])
          .filter((path) => typeof path === 'string' && path)
          .map((path) => String(path)),
      ),
    ];
    if (!normalizedPaths.length) return () => {};
    const id = nextSubscriberId++;
    subscribers.set(
      id,
      Object.freeze({
        paths: Object.freeze(normalizedPaths),
        kind: typeof details.kind === 'string' ? details.kind : 'event',
        label: typeof details.label === 'string' ? details.label : null,
      }),
    );
    return () => subscribers.delete(id);
  };

  const subscriberSummary = (path) => {
    const normalized = String(path || 'ctx').replace(/\.$/, '');
    let direct = 0;
    let dependent = 0;
    let global = 0;
    const kinds = {};
    const registrations = [];
    for (const subscriber of subscribers.values()) {
      const subscriberPaths = subscriber.paths;
      let match = null;
      if (subscriberPaths.includes('*')) {
        global += 1;
        match = 'global';
      } else if (subscriberPaths.includes(normalized)) {
        direct += 1;
        match = 'direct';
      } else if (subscriberPaths.some((candidate) => pathsOverlap(candidate, normalized))) {
        dependent += 1;
        match = 'dependent';
      }
      if (match) {
        kinds[subscriber.kind] = (kinds[subscriber.kind] || 0) + 1;
        registrations.push(
          Object.freeze({
            kind: subscriber.kind,
            label: subscriber.label,
            match,
            paths: subscriber.paths,
          }),
        );
      }
    }
    return Object.freeze({
      direct,
      dependent,
      global,
      total: direct + dependent + global,
      kinds: Object.freeze({ ...kinds }),
      registrations: Object.freeze(registrations),
    });
  };

  const collectionMemberKey = (value) => {
    if (!isObject(value)) return null;
    for (const candidate of [value.id, value.key]) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return null;
  };

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
        if (/^\d+$/.test(raw)) tokens.push(Number(raw));
        else if (
          (raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'"))
        ) {
          tokens.push(
            raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'"),
          );
        } else throw new Error(`Invalid ctx array index/key: ${raw}`);
        index = end + 1;
        continue;
      }
      const match = IDENTIFIER.exec(normalized.slice(index));
      if (!match) throw new Error(`Invalid ctx identifier in path: ${path}`);
      tokens.push(match[0]);
      index += match[0].length;
    }
    return tokens;
  }

  const getExact = (path) => {
    const tokens = tokenize(String(path || '').replace(/^ctx\.?/, ''));
    let value = ctx;
    for (const token of tokens) {
      value = resolveMember(value, token);
      if (value === undefined) return undefined;
    }
    return value;
  };

  /**
   * Semantic CTX-node metadata is contract information, not application data.
   * It therefore lives beside the value tree and is exposed through describe()
   * instead of adding enumerable kind/type/attributes children to business data.
   */
  const describe = (path) => {
    const normalized = String(path || 'ctx').replace(/\.$/, '');
    const value = getExact(normalized);
    const tokens = tokenize(normalized.replace(/^ctx\.?/, ''));
    const last = tokens.at(-1);
    const parent = tokens.at(-2);
    const attributes = new Set();
    let kind = 'value';

    const control = isObject(value?.control) ? value.control : null;
    // A UI level is identified by its canonical control contract. Optional or
    // lifecycle-varying members must never decide whether the node is a level.
    const isUiLevel =
      Boolean(control) &&
      ['page', 'popup', 'embedded'].includes(control.host) &&
      ['static', 'list', 'entry', 'selector', 'hierarchy', 'custom'].includes(control.kind) &&
      typeof control.path === 'string';

    if (normalized === 'ctx') kind = 'context-root';
    else if (tokens.length === 1) kind = `${String(last)}-context`;
    else if (isUiLevel) kind = 'ui-level';
    else if (normalized.includes('.fields.')) {
      const marker = tokens.lastIndexOf('fields');
      if (tokens.length === marker + 2) kind = 'field';
      else if (tokens.length === marker + 3 && last === 'value') kind = 'field-value';
      else if (tokens.length === marker + 3 && last === 'originalValue')
        kind = 'field-original-value';
      else if (tokens.length === marker + 3 && last === 'ux') kind = 'field-ux';
      else kind = 'field-property';
    } else if (last === 'fields') kind = 'fields';
    else if (last === 'entry') kind = 'entry';
    else if (last === 'current' && parent === 'entry') kind = 'entry-current';
    else if (last === 'original' && parent === 'entry') kind = 'entry-original';
    else if (last === 'list') kind = 'list';
    else if (last === 'selection') kind = 'selection';
    else if (last === 'row') kind = 'row';
    else if (last === 'current' && parent === 'selection') kind = 'selection-current';
    else if (last === 'selected' && parent === 'selection') kind = 'selection-selected';
    else if (last === 'current' && parent === 'row') kind = 'row-current';
    else if (last === 'invocation') kind = 'invocation';
    else if (last === 'state') kind = 'state';
    else if (last === 'presentation') kind = 'presentation';
    else if (last === 'facts') kind = 'facts';
    else if (last === 'resources') kind = 'resources';
    else if (Array.isArray(value)) kind = 'collection';
    else if (isObject(value)) kind = 'container';

    if (isObject(value) || Array.isArray(value)) attributes.add('container');
    if (normalized.startsWith('ctx.ui.')) attributes.add('runtime');

    /* entry.current / entry.original are read-only mirrors of authoritative field state. */
    if (
      kind === 'entry-current' ||
      kind === 'entry-original' ||
      ((parent === 'current' || parent === 'original') && tokens.includes('entry'))
    ) {
      attributes.add('derived');
      attributes.add('readonly');
      attributes.add('mirror');
    }
    if (kind === 'field-original-value') {
      attributes.add('mutable');
      attributes.add('observable');
    }
    if (kind === 'invocation' || kind === 'facts' || kind === 'presentation')
      attributes.add('readonly');
    if (
      !attributes.has('readonly') &&
      (kind === 'field-value' || kind === 'state' || kind === 'field-property')
    )
      attributes.add('mutable');
    if (kind === 'field-value' || kind === 'state' || kind === 'field-property')
      attributes.add('observable');

    let type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (kind === 'field') {
      const fieldKey = String(last);
      let levelPath = normalized.slice(0, normalized.lastIndexOf('.data.fields.'));
      const entityKey = getExact(`${levelPath}.control`)?.entityKey;
      const entityContext = entity(entityKey);
      const definition = entityContext?.metadata?.fieldDefinition?.[fieldKey];
      type = definition?.type || definition?.dataType || 'field';
    }
    const watchable = value !== undefined;
    return Object.freeze({
      kind,
      type: String(type),
      attributes: Object.freeze([...attributes]),
      ...(isObject(value) && isObject(value[NODE_PROPERTIES])
        ? { properties: Object.freeze({ ...value[NODE_PROPERTIES] }) }
        : {}),
      watchable,
      subscribers: subscriberSummary(normalized),
    });
  };

  const installEntryMirrors = () => {
    let level = ctx.ui?.level;
    while (isObject(level)) {
      // Capture this iteration's level before installing getters. The loop variable
      // advances to the nested UI level, but each mirror must remain bound to
      // the entry surface on which it was created.
      const entryLevel = level;
      if (isObject(entryLevel.data?.fields) && isObject(entryLevel.data?.entry)) {
        if (!isObject(entryLevel.data.entry.current)) entryLevel.data.entry.current = {};
        for (const [key, field] of Object.entries(entryLevel.data.fields)) {
          if (!isObject(field)) continue;
          Object.defineProperty(entryLevel.data.entry.current, key, {
            enumerable: true,
            configurable: true,
            get: () => field.value,
          });
          Object.defineProperty(entryLevel.data.entry.original, key, {
            enumerable: true,
            configurable: true,
            get: () => field.originalValue,
          });
          Object.defineProperty(field, 'dirty', {
            enumerable: true,
            configurable: true,
            get: () => !Object.is(field.originalValue, field.value),
          });
        }
      }
      level = level.level;
    }
  };

  installEntryMirrors();

  const leafPagePath = () => {
    let node = ctx.ui?.level;
    if (!node) return 'ctx';
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  const appendPathMember = (base, member) =>
    typeof member === 'number'
      ? `${base}[${member}]`
      : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(member)
        ? `${base}.${member}`
        : `${base}[${JSON.stringify(member)}]`;

  /**
   * Lexical CTX resolution: only the FIRST identifier walks current page ->
   * parent page(s) -> root. Once found, remaining members resolve downward.
   *
   * Returning the resolved canonical path as well as the value lets the
   * metadata-driven reactive engine subscribe calculations to the exact CTX
   * values found by the same resolver used during evaluation.
   */
  const resolveWithPath = (expressionPath, scopePath) => {
    const explicitRoot = expressionPath === '$' || expressionPath.startsWith('$.');
    const normalized = explicitRoot ? expressionPath.replace(/^\$\.?/, '') : expressionPath;
    const members = tokenize(normalized);
    if (!members.length) return explicitRoot ? resolvedPathResult(ctx, 'ctx', scopePath) : null;
    const first = members.shift();
    if (typeof first !== 'string') return null;

    const downward = (start, startPath, remainingMembers) => {
      let value = start;
      let path = startPath;
      for (const member of remainingMembers) {
        value = resolveMember(value, member);
        if (value === undefined) return null;
        path = appendPathMember(path, member);
      }
      return resolvedPathResult(value, path, scopePath);
    };

    if (explicitRoot) {
      const start = resolveMember(ctx, first);
      if (start === undefined) return null;
      return downward(start, appendPathMember('ctx', first), members);
    }

    const scopes = [];
    const candidate = scopePath || leafPagePath();
    if (candidate === 'ctx.ui.level' || candidate.startsWith('ctx.ui.level.')) {
      let levelCandidate = candidate;
      while (levelCandidate.startsWith('ctx.ui.level')) {
        scopes.push(levelCandidate);
        if (!levelCandidate.endsWith('.level')) break;
        levelCandidate = levelCandidate.slice(0, -6);
      }
    }
    scopes.push('ctx');

    for (const scope of scopes) {
      const scopeValue = getExact(scope);
      if (
        isObject(scopeValue?.data?.fields) &&
        Object.prototype.hasOwnProperty.call(scopeValue.data.fields, first)
      ) {
        const field = scopeValue.data.fields[first];
        const fieldPath = `${scope}.data.fields.${first}`;
        if (!members.length) {
          return resolvedPathResult(field?.value, `${fieldPath}.value`, scopePath);
        }
        return downward(field, fieldPath, members);
      }
      if (
        isObject(scopeValue?.control?.facts) &&
        Object.prototype.hasOwnProperty.call(scopeValue.control.facts, first)
      ) {
        const factPath = `${scope}.control.facts.${first}`;
        return downward(scopeValue.control.facts[first], factPath, members);
      }
      if (
        isObject(scopeValue?.control) &&
        Object.prototype.hasOwnProperty.call(scopeValue.control, first)
      ) {
        return downward(scopeValue.control[first], `${scope}.control.${first}`, members);
      }
      if (isObject(scopeValue) && Object.prototype.hasOwnProperty.call(scopeValue, first)) {
        return downward(scopeValue[first], `${scope}.${first}`, members);
      }
    }
    return null;
  };

  const resolve = (expressionPath, scopePath) => resolveWithPath(expressionPath, scopePath)?.value;

  const parentPathForCtx = (path) => {
    if (!path || path === 'ctx') return null;
    const tokens = tokenize(String(path).replace(/^ctx\.?/, ''));
    if (!tokens.length) return null;
    tokens.pop();
    return tokens.reduce((base, member) => appendPathMember(base, member), 'ctx');
  };

  const nearestUiLevelPath = (scopePath) => {
    let candidate = scopePath || leafPagePath();
    while (candidate && candidate.startsWith('ctx.ui.level')) {
      const value = getExact(candidate);
      if (
        isObject(value?.control) &&
        (value.control.host === 'page' || value.control.host === 'popup') &&
        typeof value.control.kind === 'string'
      )
        return candidate;
      candidate = parentPathForCtx(candidate);
    }
    return null;
  };

  /**
   * Preferred symbolic CTX path notation.
   *
   * Canonical absolute paths remain the internal identity used for graph keys,
   * subscriptions and mutation routing. Whenever a path is represented,
   * diagnosed or returned alongside a resolved value, prefer a # anchored form
   * when the target can be expressed relative to the active UI level; fall
   * back to the immediate-parent # form, then to the root $ form.
   */
  const describePathNotation = (path, scopePath) => {
    const canonical = String(path || 'ctx');
    const scope = scopePath || leafPagePath() || 'ctx';

    const levelPath = nearestUiLevelPath(scope);
    if (levelPath) {
      if (canonical === levelPath) return '#level';
      for (const namespace of ['control', 'layout', 'data', 'state']) {
        const namespacePath = `${levelPath}.${namespace}`;
        if (canonical === namespacePath) return `#${namespace}`;
        if (canonical.startsWith(`${namespacePath}.`))
          return `#${namespace}${canonical.slice(namespacePath.length)}`;
      }
      if (canonical.startsWith(`${levelPath}.`))
        return `#level${canonical.slice(levelPath.length)}`;
    }

    const parentPath = parentPathForCtx(scope);
    if (parentPath) {
      if (canonical === parentPath) return '#';
      if (canonical.startsWith(`${parentPath}.`)) return `#${canonical.slice(parentPath.length)}`;
    }

    return canonical === 'ctx'
      ? '$'
      : canonical.startsWith('ctx.')
        ? `$.${canonical.slice(4)}`
        : canonical;
  };

  const resolvedPathResult = (value, path, scopePath) => ({
    value,
    path,
    notation: describePathNotation(path, scopePath),
  });

  const normalizeDynamicPathKey = (member, evaluateDynamicPath) => {
    if (typeof member === 'string' || typeof member === 'number') return member;
    if (!member || member.kind !== 'dynamic-path')
      throw new Error('Invalid dynamic CTX path member.');
    const value = evaluateDynamicPath?.(member.expression);
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    throw new Error(
      `Dynamic CTX path segment (${member.source || 'expression'}) must resolve to a non-empty string or non-negative integer; received ${type}.`,
    );
  };

  /**
   * Resolve the canonical compiled variable AST, including #/#level selectors
   * and parenthesized dynamic path members. Aliases are already expanded by
   * the canonical parser, so the browser never reparses expression text.
   */
  const resolveVariableWithPath = (variable, scopePath, evaluateDynamicPath) => {
    if (!variable || !Array.isArray(variable.members) || !variable.members.length) return null;
    const members = [...variable.members];

    const downward = (start, startPath, remaining) => {
      let value = start;
      let path = startPath;
      for (const rawMember of remaining) {
        const member = normalizeDynamicPathKey(rawMember, evaluateDynamicPath);
        value = resolveMember(value, member);
        if (value === undefined) return null;
        path = appendPathMember(path, member);
      }
      return resolvedPathResult(value, path, scopePath);
    };

    if (variable.absolute || members[0] === '$') {
      if (members[0] === '$') members.shift();
      return members.length
        ? downward(ctx, 'ctx', members)
        : resolvedPathResult(ctx, 'ctx', scopePath);
    }

    const first = members.shift();
    if (['#', '#level', '#control', '#data', '#layout', '#state'].includes(first)) {
      const levelPath = nearestUiLevelPath(scopePath);
      const selectedPath =
        first === '#'
          ? parentPathForCtx(scopePath || leafPagePath())
          : first === '#level'
            ? levelPath
            : levelPath
              ? `${levelPath}.${first.slice(1)}`
              : null;
      if (!selectedPath) return null;
      const selected = getExact(selectedPath);
      return members.length
        ? downward(selected, selectedPath, members)
        : resolvedPathResult(selected, selectedPath, scopePath);
    }
    if (typeof first !== 'string') return null;

    const scopes = [];
    const candidate = scopePath || leafPagePath();
    if (candidate === 'ctx.ui.level' || candidate.startsWith('ctx.ui.level.')) {
      // An explicit evaluator owner may be a CTX descendant of a UI surface
      // (for example collections.<source>.current[n]), not the surface
      // container itself. Resolve ordinary lexical identifiers against that exact
      // owner first, then climb through enclosing UI levels. This keeps row-local
      // fields observable without manufacturing a detached evaluator scope.
      if (getExact(candidate) !== undefined) scopes.push(candidate);

      let levelCandidate = nearestUiLevelPath(candidate) || candidate;
      while (levelCandidate?.startsWith('ctx.ui.level')) {
        if (!scopes.includes(levelCandidate)) scopes.push(levelCandidate);
        const parent = parentPathForCtx(levelCandidate);
        if (!parent || !parent.startsWith('ctx.ui.level')) break;
        levelCandidate = nearestUiLevelPath(parent);
      }
    }
    scopes.push('ctx');

    for (const scope of scopes) {
      const scopeValue = getExact(scope);
      if (
        isObject(scopeValue?.data?.fields) &&
        Object.prototype.hasOwnProperty.call(scopeValue.data.fields, first)
      ) {
        const field = scopeValue.data.fields[first];
        const fieldPath = `${scope}.data.fields.${first}`;
        if (!members.length)
          return resolvedPathResult(field?.value, `${fieldPath}.value`, scopePath);
        return downward(field, fieldPath, members);
      }
      if (
        isObject(scopeValue?.control?.facts) &&
        Object.prototype.hasOwnProperty.call(scopeValue.control.facts, first)
      ) {
        return downward(
          scopeValue.control.facts[first],
          `${scope}.control.facts.${first}`,
          members,
        );
      }
      if (
        isObject(scopeValue?.control) &&
        Object.prototype.hasOwnProperty.call(scopeValue.control, first)
      ) {
        return downward(scopeValue.control[first], `${scope}.control.${first}`, members);
      }
      if (isObject(scopeValue) && Object.prototype.hasOwnProperty.call(scopeValue, first)) {
        return downward(scopeValue[first], `${scope}.${first}`, members);
      }
    }
    return null;
  };

  const resolveVariable = (variable, scopePath, evaluateDynamicPath) =>
    resolveVariableWithPath(variable, scopePath, evaluateDynamicPath)?.value;

  /**
   * Resolve only the canonical CTX source path for a variable. Unlike value
   * resolution, this deliberately keeps paths through currently-null members
   * (for example principalType.option.canHaveParent before an enum is chosen)
   * so reactive subscriptions can be registered once at page startup.
   */
  const resolvePath = (expressionPath, scopePath) => {
    const explicitRoot = expressionPath === '$' || expressionPath.startsWith('$.');
    const normalized = explicitRoot ? expressionPath.replace(/^\$\.?/, '') : expressionPath;
    const members = tokenize(normalized);
    if (!members.length) return explicitRoot ? 'ctx' : undefined;
    const first = members.shift();
    if (typeof first !== 'string') return undefined;

    const appendRemaining = (base) =>
      members.reduce((path, member) => appendPathMember(path, member), base);

    if (explicitRoot) return appendRemaining(appendPathMember('ctx', first));

    const scopes = [];
    const candidate = scopePath || leafPagePath();
    if (candidate === 'ctx.ui.level' || candidate.startsWith('ctx.ui.level.')) {
      let levelCandidate = candidate;
      while (levelCandidate.startsWith('ctx.ui.level')) {
        scopes.push(levelCandidate);
        if (!levelCandidate.endsWith('.level')) break;
        levelCandidate = levelCandidate.slice(0, -6);
      }
    }
    scopes.push('ctx');

    for (const scope of scopes) {
      const scopeValue = getExact(scope);
      if (
        isObject(scopeValue?.data?.fields) &&
        Object.prototype.hasOwnProperty.call(scopeValue.data.fields, first)
      ) {
        const fieldPath = `${scope}.data.fields.${first}`;
        return members.length ? appendRemaining(fieldPath) : `${fieldPath}.value`;
      }
      if (
        isObject(scopeValue?.control?.facts) &&
        Object.prototype.hasOwnProperty.call(scopeValue.control.facts, first)
      ) {
        return appendRemaining(`${scope}.control.facts.${first}`);
      }
      if (
        isObject(scopeValue?.control) &&
        Object.prototype.hasOwnProperty.call(scopeValue.control, first)
      ) {
        return appendRemaining(`${scope}.control.${first}`);
      }
      if (isObject(scopeValue) && Object.prototype.hasOwnProperty.call(scopeValue, first)) {
        return appendRemaining(`${scope}.${first}`);
      }
    }
    return undefined;
  };

  const emit = (operation, path, oldValue, newValue, cause = {}) => {
    const eventId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const rootEventId = cause.rootEventId || cause.eventId || eventId;
    const relatedPaths = Array.isArray(cause.relatedPaths)
      ? cause.relatedPaths.filter((candidate) => typeof candidate === 'string')
      : [];
    const detail = {
      operation,
      path,
      relatedPaths,
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

  /**
   * Atomically update one entry field's live CTX views. `entryOriginal` is never
   * touched; `fields.<key>.value` and `entry.<key>` move together and one
   * causal CTX event wakes dependents.
   */
  const metadataFieldDefinition = (page, key) => {
    const entityKey = page?.control?.entityKey;
    if (!entityKey) return null;
    const entityContext = entity(entityKey);
    return entityContext?.metadata?.fieldDefinition?.[key] || null;
  };

  const stringLengthIssues = (definition, value) => {
    if (!definition || typeof value !== 'string' || value.length === 0) return [];
    const issues = [];
    const minLength = Number(definition.minLength);
    const maxLength = Number(definition.maxLength);
    if (Number.isFinite(minLength) && minLength >= 0 && value.length < minLength) {
      issues.push({
        code: 'minLength',
        message: `${definition.label || definition.key || 'Value'} must contain at least ${minLength} characters.`,
        severity: 'error',
        source: 'metadata-length',
      });
    }
    if (Number.isFinite(maxLength) && maxLength >= 0 && value.length > maxLength) {
      issues.push({
        code: 'maxLength',
        message: `${definition.label || definition.key || 'Value'} must contain at most ${maxLength} characters.`,
        severity: 'error',
        source: 'metadata-length',
      });
    }
    return issues;
  };

  const updateField = (pagePath, key, value, option, cause = {}) => {
    const page = getExact(pagePath);
    if (!isObject(page?.data?.fields?.[key]))
      throw new Error(`ctx field not found: ${pagePath}.data.fields.${key}`);
    const field = page.data.fields[key];
    const oldValue = field.value;
    const hadOption = Object.prototype.hasOwnProperty.call(field, 'option');
    const oldOption = field.option;
    const hadValid = Object.prototype.hasOwnProperty.call(field, 'valid');
    const oldValid = field.valid;
    const hadValidationIssues = Object.prototype.hasOwnProperty.call(field, 'validationIssues');
    const oldValidationIssues = Array.isArray(field.validationIssues) ? field.validationIssues : [];
    field.value = value;
    accountReplacement(oldValue, value);
    const retainedIssues = oldValidationIssues.filter(
      (issue) => issue?.source !== 'metadata-length',
    );
    const nextValidationIssues = [
      ...retainedIssues,
      ...stringLengthIssues(metadataFieldDefinition(page, key), value),
    ];
    field.validationIssues = nextValidationIssues;
    if (hadValidationIssues) accountReplacement(oldValidationIssues, nextValidationIssues);
    else accountCreatedTree('validationIssues', nextValidationIssues);
    const nextValid = !field.validationIssues.some((issue) => issue?.severity === 'error');
    field.valid = nextValid;
    if (hadValid) accountReplacement(oldValid, nextValid);
    else accountCreatedTree('valid', nextValid);
    const resolvedOption =
      option !== undefined
        ? option
        : Array.isArray(field.options)
          ? (field.options.find(
              (candidate) =>
                String(candidate?.value ?? candidate?.id ?? '') === String(value ?? ''),
            ) ?? null)
          : undefined;
    if (Object.prototype.hasOwnProperty.call(field, 'option') || resolvedOption !== undefined) {
      const nextOption = resolvedOption ?? null;
      field.option = nextOption;
      if (hadOption) accountReplacement(oldOption, nextOption);
      else accountCreatedTree('option', nextOption);
    }

    const relatedPaths = [];
    // fields.<key>.value is the sole live authority. entry.current.<key>
    // is installed as a read-only getter mirror, so there is no second write.
    if (isObject(page.data?.entry?.current))
      relatedPaths.push(`${pagePath}.data.entry.current.${key}`);
    if (Object.prototype.hasOwnProperty.call(field, 'originalValue')) {
      // dirty is a read-only projection of the one baseline + one live value.
      relatedPaths.push(`${pagePath}.data.fields.${key}.dirty`);
    }
    if (!Object.is(oldValid, field.valid))
      relatedPaths.push(`${pagePath}.data.fields.${key}.valid`);
    // Validation issues are an ordered presentation/event projection. Preserve exact serialized
    // sequence identity here rather than treating them as generic entity/CTX semantic values.
    if (JSON.stringify(oldValidationIssues) !== JSON.stringify(field.validationIssues)) {
      relatedPaths.push(`${pagePath}.data.fields.${key}.validationIssues`);
    }

    const path = `${pagePath}.data.fields.${key}.value`;
    if (!Object.is(oldOption, field.option)) {
      relatedPaths.push(`${pagePath}.data.fields.${key}.option`);
    }
    return emit('replace', path, oldValue, value, {
      ...cause,
      triggerPath: cause.triggerPath || path,
      relatedPaths,
    });
  };

  const updateBaseline = (pagePath, key, value, cause = {}) => {
    const page = getExact(pagePath);
    if (!isObject(page?.data?.fields?.[key]))
      throw new Error(`Unknown ctx field: ${pagePath}.${key}`);
    const field = page.data.fields[key];
    const oldValue = field.originalValue;
    field.originalValue = value;
    accountReplacement(oldValue, value);
    const path = `${pagePath}.data.fields.${key}.originalValue`;
    return emit('replace', path, oldValue, value, {
      ...cause,
      triggerPath: cause.triggerPath || path,
      relatedPaths: [
        `${pagePath}.data.entry.original.${key}`,
        `${pagePath}.data.fields.${key}.dirty`,
      ],
    });
  };

  const mutate = (operation, path, value, cause) => {
    /*
     * V2 field values have exactly one mutation authority. Callers may use the
     * generic set/replace API, but field-value paths are normalized through
     * updateField so entry.current/dirty projections and the causal event stay
     * coherent. This prevents a second "generic replace" write route.
     */
    if (operation === 'set' || operation === 'replace') {
      const match = String(path || '').match(
        /^(ctx\.ui\.level(?:\.level)*)\.fields\.([A-Za-z_$][A-Za-z0-9_$-]*)\.value$/,
      );
      if (match) return updateField(match[1], match[2], value, undefined, cause);
      const baselineMatch = String(path || '').match(
        /^(ctx\.ui\.level(?:\.level)*)\.data\.fields\.([A-Za-z_$][A-Za-z0-9_$-]*)\.originalValue$/,
      );
      if (baselineMatch) return updateBaseline(baselineMatch[1], baselineMatch[2], value, cause);
    }

    const descriptor = describe(path);
    if (descriptor.attributes.includes('readonly'))
      throw new Error(`ctx path is read-only: ${path}`);
    const tokens = tokenize(String(path || '').replace(/^ctx\.?/, ''));
    if (!tokens.length) throw new Error('The ctx root cannot be replaced by this operation.');
    let parent = ctx;
    for (const token of tokens.slice(0, -1)) {
      parent = resolveMember(parent, token);
      if (!isObject(parent)) throw new Error(`ctx path not found: ${path}`);
    }
    const key = tokens.at(-1);
    const oldValue = resolveMember(parent, key);
    if (operation === 'delete') {
      if (oldValue !== undefined) accountDisposedTree(key, oldValue);
      if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
      else delete parent[key];
      emit(operation, path, oldValue, undefined, cause);
      return;
    }
    if (operation === 'add' && Array.isArray(parent[key])) {
      const memberKey = parent[key].length;
      parent[key].push(value);
      accountCreatedTree(memberKey, value);
      emit(operation, path, oldValue, parent[key], cause);
      return;
    }
    const hadMember = Object.prototype.hasOwnProperty.call(parent, key);
    if (hadMember) accountDisposedTree(key, oldValue);
    parent[key] = value;
    accountCreatedTree(key, value);
    // Child UI levels can be opened after ctx-runtime startup. Install the same
    // canonical entry.current/original + field.dirty mirrors used by bootstrap
    // entry surfaces before observers react to the newly attached level.
    if (/^ctx\.ui\.level(?:\.level)*$/.test(String(path || '')) && isObject(value)) {
      installEntryMirrors();
    }
    emit(operation, path, oldValue, value, cause);
  };

  function entity(entityKey) {
    const registry = ctx.entities;
    if (!isObject(registry)) return null;
    if (isObject(registry[entityKey])) return registry[entityKey];
    return Object.values(registry).find((candidate) => candidate?.key === entityKey) || null;
  }

  const leafUiLevelPath = () => {
    let node = ctx.ui?.level;
    if (!isObject(node)) return null;
    let path = 'ctx.ui.level';
    while (isObject(node.level)) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.CtxPath = describePathNotation;
  window.ManatOS.ctx = Object.freeze({
    value: ctx,
    eventName: CHANGE_EVENT,
    get: getExact,
    entity,
    leafUiLevelPath,
    resolve,
    resolveWithPath,
    resolveVariable,
    resolveVariableWithPath,
    CtxPath: describePathNotation,
    describePath: describePathNotation,
    resolvePath,
    set: (path, value, cause) => mutate('set', path, value, cause),
    replace: (path, value, cause) => mutate('replace', path, value, cause),
    delete: (path, cause) => mutate('delete', path, undefined, cause),
    add: (path, value, cause) => mutate('add', path, value, cause),
    emit,
    updateField,
    updateBaseline,
    describe,
    trackSubscriber,
    subscriberSummary,
    statistics: statisticsSnapshot,
    tokenize,
  });

  // Explicit lifecycle point for consumers that must act only after CTX exists.
  window.dispatchEvent(new CustomEvent('manatos:ctx-ready'));
})();
