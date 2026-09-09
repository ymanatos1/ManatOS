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
    for (const subscriber of subscribers.values()) {
      const subscriberPaths = subscriber.paths;
      let matched = false;
      if (subscriberPaths.includes('*')) {
        global += 1;
        matched = true;
      } else if (subscriberPaths.includes(normalized)) {
        direct += 1;
        matched = true;
      } else if (subscriberPaths.some((candidate) => pathsOverlap(candidate, normalized))) {
        dependent += 1;
        matched = true;
      }
      if (matched) kinds[subscriber.kind] = (kinds[subscriber.kind] || 0) + 1;
    }
    return Object.freeze({
      direct,
      dependent,
      global,
      total: direct + dependent + global,
      kinds: Object.freeze({ ...kinds }),
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

    if (normalized === 'ctx') kind = 'context-root';
    else if (tokens.length === 1) kind = `${String(last)}-context`;
    else if (last === 'level' && normalized.startsWith('ctx.ui.')) kind = 'ui-level';
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
    else if (last === 'invocation') kind = 'invocation';
    else if (last === 'state') kind = 'state';
    else if (last === 'presentation') kind = 'presentation';
    else if (last === 'facts') kind = 'facts';
    else if (last === 'resources') kind = 'resources';
    else if (Array.isArray(value)) kind = 'collection';
    else if (isObject(value)) kind = 'container';

    if (isObject(value) || Array.isArray(value)) attributes.add('container');
    if (normalized.startsWith('ctx.ui.')) attributes.add('runtime');
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
      let levelPath = normalized.slice(0, normalized.lastIndexOf('.fields.'));
      const entityKey = getExact(levelPath)?.entityKey;
      const entity = Object.values(ctx.entities || {}).find(
        (candidate) => candidate?.key === entityKey,
      );
      const definition = entity?.metadata?.fieldDefinition?.[fieldKey];
      type = definition?.type || definition?.dataType || 'field';
    }
    const watchable = value !== undefined;
    return Object.freeze({
      kind,
      type: String(type),
      attributes: Object.freeze([...attributes]),
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
      if (isObject(entryLevel.fields) && isObject(entryLevel.entry)) {
        if (!isObject(entryLevel.entry.current)) entryLevel.entry.current = {};
        for (const [key, field] of Object.entries(entryLevel.fields)) {
          if (!isObject(field)) continue;
          Object.defineProperty(entryLevel.entry.current, key, {
            enumerable: true,
            configurable: true,
            get: () => field.value,
          });
          Object.defineProperty(entryLevel.entry.original, key, {
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
      if (
        isObject(scopeValue?.facts) &&
        Object.prototype.hasOwnProperty.call(scopeValue.facts, first)
      ) {
        const factPath = `${scope}.facts.${first}`;
        return downward(scopeValue.facts[first], factPath, members);
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
        isObject(scopeValue?.fields) &&
        Object.prototype.hasOwnProperty.call(scopeValue.fields, first)
      ) {
        const fieldPath = `${scope}.fields.${first}`;
        return members.length ? appendRemaining(fieldPath) : `${fieldPath}.value`;
      }
      if (
        isObject(scopeValue?.facts) &&
        Object.prototype.hasOwnProperty.call(scopeValue.facts, first)
      ) {
        return appendRemaining(`${scope}.facts.${first}`);
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
    const isV2Surface = pagePath === 'ctx.ui.level' || pagePath.startsWith('ctx.ui.level.level');
    field.value = value;
    if (Object.prototype.hasOwnProperty.call(field, 'option') || option !== undefined) {
      field.option = option ?? null;
    }

    const relatedPaths = [];
    if (isV2Surface) {
      // fields.<key>.value is the sole live authority. entry.current.<key>
      // is installed as a read-only getter mirror, so there is no second write.
      if (isObject(page.entry?.current)) relatedPaths.push(`${pagePath}.entry.current.${key}`);
      if (Object.prototype.hasOwnProperty.call(field, 'originalValue')) {
        // dirty is a read-only projection of the one baseline + one live value.
        relatedPaths.push(`${pagePath}.fields.${key}.dirty`);
      }
    } else if (isObject(page.entry)) {
      page.entry[key] = value;
      relatedPaths.push(`${pagePath}.entry.${key}`);
    }

    const path = `${pagePath}.fields.${key}.value`;
    if (!Object.is(oldOption, field.option)) {
      relatedPaths.push(`${pagePath}.fields.${key}.option`);
    }
    return emit('replace', path, oldValue, value, {
      ...cause,
      triggerPath: cause.triggerPath || path,
      relatedPaths,
    });
  };

  const updateBaseline = (pagePath, key, value, cause = {}) => {
    const page = getExact(pagePath);
    if (!isObject(page?.fields?.[key])) throw new Error(`Unknown ctx field: ${pagePath}.${key}`);
    const field = page.fields[key];
    const oldValue = field.originalValue;
    field.originalValue = value;
    const path = `${pagePath}.fields.${key}.originalValue`;
    return emit('replace', path, oldValue, value, {
      ...cause,
      triggerPath: cause.triggerPath || path,
      relatedPaths: [`${pagePath}.entry.original.${key}`, `${pagePath}.fields.${key}.dirty`],
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
        /^(ctx\.ui\.level(?:\.level)*)\.fields\.([A-Za-z_$][A-Za-z0-9_$-]*)\.originalValue$/,
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
    updateBaseline,
    describe,
    trackSubscriber,
    subscriberSummary,
    tokenize,
  });

  // Explicit lifecycle point for consumers that must act only after CTX exists.
  window.dispatchEvent(new CustomEvent('manatos:ctx-ready'));
})();
