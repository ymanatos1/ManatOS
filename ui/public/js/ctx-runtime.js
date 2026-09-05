(() => {
  'use strict';

  const snapshotElement = document.getElementById('manatosCtxSnapshot');
  if (!snapshotElement) return;

  let ctx;
  try {
    ctx = JSON.parse(snapshotElement.textContent || 'null');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx !== 'object') return;

  const CHANGE_EVENT = 'manatos:ctx-change';
  const isObject = (value) => value !== null && typeof value === 'object';
  const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;

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

  const leafPagePath = () => {
    let node = ctx.page;
    let path = 'ctx.page';
    while (node?.page) {
      node = node.page;
      path += '.page';
    }
    return node ? path : 'ctx';
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
    const explicitRoot = expressionPath === 'ctx' || expressionPath.startsWith('ctx.');
    const normalized = explicitRoot ? expressionPath.replace(/^ctx\.?/, '') : expressionPath;
    const members = tokenize(normalized);
    if (!members.length) return explicitRoot ? { value: ctx, path: 'ctx' } : null;
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
      return { value, path };
    };

    if (explicitRoot) {
      const start = resolveMember(ctx, first);
      if (start === undefined) return null;
      return downward(start, appendPathMember('ctx', first), members);
    }

    const scopes = [];
    let candidate = scopePath || leafPagePath();
    while (candidate.startsWith('ctx.page')) {
      scopes.push(candidate);
      if (!candidate.endsWith('.page')) break;
      candidate = candidate.slice(0, -5);
    }
    scopes.push('ctx');

    for (const scope of scopes) {
      const scopeValue = getExact(scope);
      if (
        isObject(scopeValue?.fields) &&
        Object.prototype.hasOwnProperty.call(scopeValue.fields, first)
      ) {
        const field = scopeValue.fields[first];
        const fieldPath = `${scope}.fields.${first}`;
        if (!members.length) {
          return { value: field?.value, path: `${fieldPath}.value` };
        }
        return downward(field, fieldPath, members);
      }
      if (isObject(scopeValue) && Object.prototype.hasOwnProperty.call(scopeValue, first)) {
        return downward(scopeValue[first], `${scope}.${first}`, members);
      }
    }
    return null;
  };

  const resolve = (expressionPath, scopePath) => resolveWithPath(expressionPath, scopePath)?.value;

  /**
   * Resolve only the canonical CTX source path for a variable. Unlike value
   * resolution, this deliberately keeps paths through currently-null members
   * (for example principalType.option.canHaveParent before an enum is chosen)
   * so reactive subscriptions can be registered once at page startup.
   */
  const resolvePath = (expressionPath, scopePath) => {
    const explicitRoot = expressionPath === 'ctx' || expressionPath.startsWith('ctx.');
    const normalized = explicitRoot ? expressionPath.replace(/^ctx\.?/, '') : expressionPath;
    const members = tokenize(normalized);
    if (!members.length) return explicitRoot ? 'ctx' : undefined;
    const first = members.shift();
    if (typeof first !== 'string') return undefined;

    const appendRemaining = (base) =>
      members.reduce((path, member) => appendPathMember(path, member), base);

    if (explicitRoot) return appendRemaining(appendPathMember('ctx', first));

    const scopes = [];
    let candidate = scopePath || leafPagePath();
    while (candidate.startsWith('ctx.page')) {
      scopes.push(candidate);
      if (!candidate.endsWith('.page')) break;
      candidate = candidate.slice(0, -5);
    }
    scopes.push('ctx');

    for (const scope of scopes) {
      const scopeValue = getExact(scope);
      if (
        isObject(scopeValue?.fields) &&
        Object.prototype.hasOwnProperty.call(scopeValue.fields, first)
      ) {
        const fieldPath = `${scope}.fields.${first}`;
        return members.length ? appendRemaining(fieldPath) : `${fieldPath}.value`;
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
  const updateField = (pagePath, key, value, option, cause = {}) => {
    const page = getExact(pagePath);
    if (!isObject(page?.fields?.[key]))
      throw new Error(`ctx field not found: ${pagePath}.fields.${key}`);
    const field = page.fields[key];
    const oldValue = field.value;
    const oldOption = field.option;
    field.value = value;
    if (Object.prototype.hasOwnProperty.call(field, 'option') || option !== undefined) {
      field.option = option ?? null;
    }
    if (isObject(page.entry)) page.entry[key] = value;

    const path = `${pagePath}.fields.${key}.value`;
    const relatedPaths = [`${pagePath}.entry.${key}`];
    if (!Object.is(oldOption, field.option)) {
      relatedPaths.push(`${pagePath}.fields.${key}.option`);
    }
    return emit('replace', path, oldValue, value, {
      ...cause,
      triggerPath: cause.triggerPath || path,
      relatedPaths,
    });
  };

  const mutate = (operation, path, value, cause) => {
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
      if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
      else delete parent[key];
      emit(operation, path, oldValue, undefined, cause);
      return;
    }
    if (operation === 'add' && Array.isArray(parent[key])) {
      parent[key].push(value);
      emit(operation, path, oldValue, parent[key], cause);
      return;
    }
    parent[key] = value;
    emit(operation, path, oldValue, value, cause);
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.ctx = Object.freeze({
    value: ctx,
    eventName: CHANGE_EVENT,
    get: getExact,
    resolve,
    resolveWithPath,
    resolvePath,
    set: (path, value, cause) => mutate('set', path, value, cause),
    replace: (path, value, cause) => mutate('replace', path, value, cause),
    delete: (path, cause) => mutate('delete', path, undefined, cause),
    add: (path, value, cause) => mutate('add', path, value, cause),
    emit,
    updateField,
    tokenize,
  });
})();
