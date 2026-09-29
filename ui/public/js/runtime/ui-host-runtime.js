(() => {
  'use strict';

  /*
   * Browser-owned V2 UI host.
   *
   * The server supplies invocation/data facts only. This runtime is the first
   * browser authority that turns those facts into the recursive ctx.ui.level
   * topology. The resulting CTX is written into the snapshot before ctx-runtime
   * starts, so every later browser subsystem sees one client-authored UI tree.
   */
  const ctxElement = document.getElementById('manatosCtxSnapshot');
  if (!ctxElement) return;

  let ctx;
  try {
    ctx = JSON.parse(ctxElement.textContent || 'null');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return;

  const bootstrapElement = document.getElementById('manatosUiBootstrap');
  let bootstrap = null;
  try {
    bootstrap = JSON.parse(bootstrapElement?.textContent || 'null');
  } catch {
    bootstrap = null;
  }

  const state = (navigation = null) => ({
    lifecycle: 'created',
    active: true,
    dirty: false,
    valid: true,
    loading: false,
    saving: false,
    deleting: false,
    blocked: false,
    // Canonical surface-level gate for keyboard/pointer user input. Runtime
    // blockers own the reasons; CTX exposes only the aggregate semantic fact.
    userInputReady: true,
    navigation: {
      activeTabId: navigation?.activeTabId ?? null,
      activeInternalTabIds: { ...(navigation?.activeInternalTabIds || {}) },
    },
  });

  const safeName = (value, fallback = 'page') => {
    const normalized = String(value || '')
      .trim()
      .replace(/[^A-Za-z0-9_$-]+/g, '-');
    if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(normalized)) return normalized;
    if (normalized) return `page-${normalized}`;
    return fallback;
  };

  const surface = ({
    id,
    parent = null,
    host,
    kind,
    mode,
    name,
    entityKey = null,
    entityName = null,
    recordId = null,
    invocation = {},
    presentation = {},
    navigation = null,
    entry = null,
    list = null,
    facts = null,
    resources = null,
    fields = null,
    selection = null,
    row = null,
    supportsUserChanges = false,
  }) => {
    const normalizedName = safeName(name, kind || 'page');
    const path = parent
      ? `${parent.control.path}/${host}:${normalizedName}`
      : `/ui/${host}:${normalizedName}`;
    return {
      control: {
        id,
        host,
        kind,
        mode,
        name: normalizedName,
        path,
        scope: 'sys',
        invocation: { ...invocation },
        presentation: { kind, ...presentation },
        state: state(navigation),
        facts: facts && typeof facts === 'object' ? { ...facts } : {},
        supportsUserChanges: supportsUserChanges === true,
        ...(entityKey ? { entityKey: String(entityKey) } : {}),
        ...(entityName ? { entityName } : {}),
        ...(recordId ? { recordId } : {}),
      },
      ...(resources && Object.keys(resources).length ? { resources } : {}),
      ...(selection ? { selection } : {}),
      ...(row ? { row } : {}),
      ...(entry ? { entry } : {}),
      ...(list ? { list } : {}),
      ...(fields && Object.keys(fields).length ? { fields } : {}),
    };
  };

  const link = (parent, child) => {
    parent.control.state.active = false;
    parent.level = child;
    return child;
  };

  const callerReference = (parent) =>
    parent
      ? {
          surfaceRef: parent.control.path,
          ...(parent.control?.entityName ? { entityName: parent.control.entityName } : {}),
          ...(parent.control?.recordId ? { recordId: parent.control.recordId } : {}),
        }
      : null;

  const canonicalEntryRules = (defaults = {}, overrides = {}) => {
    const values = {};
    for (const [key, value] of Object.entries(defaults || {})) values[key] = { default: value };

    const fields = {};
    for (const [key, raw] of Object.entries(overrides || {})) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const rule = {};
      if (typeof raw.label === 'string') rule.label = raw.label;
      if (typeof raw.visible === 'boolean') rule.visible = raw.visible;
      if (typeof raw.required === 'boolean') rule.required = raw.required;
      if (typeof raw.enabled === 'boolean') rule.enabled = raw.enabled;
      if (typeof raw.readOnly === 'boolean') rule.readOnly = raw.readOnly;
      if (typeof raw.editable === 'boolean') rule.readOnly = !raw.editable;
      if (Array.isArray(raw.allowedValues)) rule.allowedValues = [...raw.allowedValues];
      if (Array.isArray(raw.excludedValues)) rule.excludedValues = [...raw.excludedValues];
      if (typeof raw.allowedEnumItemTrait === 'string')
        rule.allowedEnumItemTrait = raw.allowedEnumItemTrait;
      if (Object.keys(rule).length) fields[key] = rule;

      if (Object.prototype.hasOwnProperty.call(raw, 'readOnlyValue')) {
        values[key] = { fixed: raw.readOnlyValue };
      }
    }

    return {
      ...(Object.keys(values).length ? { values } : {}),
      ...(Object.keys(fields).length ? { fields } : {}),
    };
  };

  const staticPage = () => {
    const pathOnly = String(location.pathname || '/')
      .split('/')
      .filter(Boolean)
      .join('-');
    const name = safeName(pathOnly || 'home', 'home');
    return surface({
      id: `page-${name}`,
      host: 'page',
      kind: 'static',
      mode: 'view',
      name,
      invocation: { purpose: 'view' },
      presentation: name === 'home' ? { title: 'Home' } : {},
    });
  };

  const listSurface = (input) => {
    const entity = entityContextFor(input.entityKey);
    return surface({
      id: `sysbo-list-${input.entityKey}`,
      parent: input.parent || null,
      host: 'page',
      kind: 'list',
      mode: 'browse',
      name: input.entityKey,
      entityKey: input.entityKey,
      entityName: input.entityName || entity?.name || null,
      invocation: {
        ...(input.entityName || entity?.name
          ? { entityName: input.entityName || entity?.name }
          : {}),
        purpose: 'view',
        ...(callerReference(input.parent) ? { caller: callerReference(input.parent) } : {}),
      },
      presentation: {
        title: input.pluralName || input.entityKey,
        ...(input.icon ? { icon: input.icon } : {}),
        layout: 'entity-list',
      },
      facts:
        input.facts && typeof input.facts === 'object' && !Array.isArray(input.facts)
          ? input.facts
          : null,
      list: {
        entries: Array.isArray(input.entries) ? input.entries : [],
        originalEntries: Array.isArray(input.originalEntries)
          ? input.originalEntries
          : Array.isArray(input.entries)
            ? input.entries
            : [],
      },
      resources:
        input.resources && typeof input.resources === 'object' && !Array.isArray(input.resources)
          ? input.resources
          : null,
    });
  };

  const entityContextFor = (entityKey) => {
    const registry = ctx.entities;
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return null;
    return Object.values(registry).find((candidate) => candidate?.key === entityKey) || null;
  };

  /*
   * Canonical entry field state is client-authored from metadata + record facts.
   * The server bootstrap deliberately carries no pre-evaluated field UX state.
   * Dynamic metadata is interpreted after CTX startup by the browser policy and
   * metadata-form runtimes.
   */
  const entryFields = (entityKey, current, original, mode, referenceData = {}) => {
    const entity = entityContextFor(entityKey);
    const definitions = entity?.metadata?.fieldDefinition || {};
    const overrides = entity?.uiMetadata?.record?.fieldOverrides || {};
    const currentValues = current && typeof current === 'object' ? current : {};
    const originalValues = original && typeof original === 'object' ? original : currentValues;
    return Object.fromEntries(
      Object.values(definitions)
        .filter((field) => field && typeof field === 'object' && field.sensitive !== true)
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        .map((field) => {
          const key = field.key;
          const override = overrides[key] || {};
          const staticVisible = typeof override.visible === 'boolean' ? override.visible : true;
          const staticEditable = typeof override.editable === 'boolean' ? override.editable : true;
          const editable = mode !== 'view' && field.readOnly !== true && staticEditable;
          const value = currentValues[key] ?? null;
          const contextualOptions = Array.isArray(referenceData?.[key]) ? referenceData[key] : null;
          let options;
          if (field.type === 'reference') {
            options = contextualOptions || [];
          } else if (field.type === 'enum' || (field.optionItems?.length ?? 0) > 0) {
            const richItems =
              field.type === 'enum'
                ? field.enumItems || field.optionItems || []
                : field.optionItems || [];
            options = contextualOptions?.length
              ? contextualOptions.map((item) => {
                  const optionValue = item?.value;
                  const canonical = richItems.find((candidate) => candidate?.value === optionValue);
                  return { ...(canonical || {}), ...item, value: optionValue };
                })
              : (field.enumValues || richItems.map((item) => item?.value)).map((optionValue) => ({
                  ...(richItems.find((item) => item?.value === optionValue) || {
                    value: optionValue,
                    label: String(optionValue),
                  }),
                  value: optionValue,
                }));
          }
          const option = Array.isArray(options)
            ? (options.find((candidate) =>
                Object.is(candidate?.id ?? candidate?.value ?? null, value),
              ) ?? null)
            : undefined;
          return [
            key,
            {
              originalValue: originalValues[key] ?? null,
              value,
              ...(Array.isArray(options) ? { option, options } : {}),
              valid: true,
              validationIssues: [],
              ux: {
                visible: staticVisible,
                enabled: editable,
                readonly: !editable,
                required: field.required === true,
              },
            },
          ];
        }),
    );
  };

  const fromBootstrap = () => {
    if (!bootstrap || typeof bootstrap !== 'object' || Array.isArray(bootstrap))
      return staticPage();

    switch (bootstrap.purpose) {
      case 'browse-entity-list':
        return listSurface(bootstrap);

      case 'open-account-entry':
      case 'open-entity-entry': {
        const root = listSurface({
          entityKey: bootstrap.entityKey,
          pluralName: bootstrap.pluralName,
          icon: bootstrap.icon,
          entries: bootstrap.parentEntries,
          originalEntries: bootstrap.parentEntries,
        });
        let parent = root;

        if (bootstrap.owner && typeof bootstrap.owner === 'object') {
          const owner = surface({
            id: `sysbo-owner-${bootstrap.entityKey}-${safeName(bootstrap.owner.name || 'hierarchy')}`,
            parent,
            host: 'page',
            kind: 'hierarchy',
            mode: 'manage',
            name: bootstrap.owner.name || 'hierarchy',
            entityKey: bootstrap.entityKey,
            entityName: bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name || null,
            invocation: {
              ...(bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name
                ? {
                    entityName: bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name,
                  }
                : {}),
              purpose: 'view',
              caller: callerReference(parent),
            },
            presentation: { layout: 'entity-hierarchy' },
            list: {
              entries: Array.isArray(bootstrap.owner.entries) ? bootstrap.owner.entries : [],
              originalEntries: Array.isArray(bootstrap.owner.entries)
                ? bootstrap.owner.entries
                : [],
            },
          });
          link(parent, owner);
          parent = owner;
        }

        const mode = bootstrap.isNew ? 'create' : bootstrap.readOnly ? 'view' : 'edit';
        const child = surface({
          id: `sysbo-entry-${bootstrap.entityKey}-${bootstrap.recordId || 'new'}`,
          parent,
          host: bootstrap.popup ? 'popup' : 'page',
          kind: 'entry',
          mode,
          name: 'entry',
          entityKey: bootstrap.entityKey,
          entityName: bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name || null,
          recordId: bootstrap.recordId || null,
          invocation: {
            ...(bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name
              ? { entityName: bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name }
              : {}),
            purpose: mode === 'create' ? 'create' : 'view',
            caller: callerReference(parent),
            behavior: { recoverable: bootstrap.recoverable !== false },
            ...(() => {
              const rules = canonicalEntryRules(bootstrap.defaults, bootstrap.uiOverrides);
              return Object.keys(rules).length ? { rules } : {};
            })(),
          },
          presentation: {
            title: bootstrap.title || bootstrap.entityName || bootstrap.entityKey,
            ...(bootstrap.icon ? { icon: bootstrap.icon } : {}),
            ...(bootstrap.uiView ? { uiView: { ...bootstrap.uiView } } : {}),
            layout: 'entity-entry',
          },
          navigation: bootstrap.navigation,
          // entry.current and entry.original are projection containers only. ctx-runtime
          // installs their per-field read-only getter mirrors from canonical fields state.
          entry: { original: {}, current: {} },
          facts:
            bootstrap.entry?.facts && typeof bootstrap.entry.facts === 'object'
              ? bootstrap.entry.facts
              : null,
          resources:
            bootstrap.resources && typeof bootstrap.resources === 'object'
              ? bootstrap.resources
              : null,
          supportsUserChanges: mode !== 'view',
          fields: entryFields(
            bootstrap.entityKey,
            bootstrap.entry?.current,
            bootstrap.entry?.original,
            mode,
            bootstrap.resources?.referenceData,
          ),
        });
        link(parent, child);
        return root;
      }

      case 'manage-entity-hierarchy': {
        const root = listSurface({
          entityKey: bootstrap.entityKey,
          pluralName: bootstrap.pluralName,
          icon: bootstrap.icon,
          entries: bootstrap.parentEntries,
          originalEntries: bootstrap.parentEntries,
        });
        const child = surface({
          id: `hierarchy-${bootstrap.entityKey}`,
          parent: root,
          host: 'page',
          kind: 'hierarchy',
          mode: bootstrap.create ? 'create' : 'edit',
          name: bootstrap.workspaceName || 'hierarchy',
          entityKey: bootstrap.entityKey,
          entityName: bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name || null,
          recordId: bootstrap.focusedMemberId || null,
          invocation: {
            ...(bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name
              ? { entityName: bootstrap.entityName || entityContextFor(bootstrap.entityKey)?.name }
              : {}),
            purpose: bootstrap.create ? 'create' : 'view',
            caller: callerReference(root),
          },
          presentation: {
            title: bootstrap.title || 'Hierarchy',
            icon: 'diagram-3',
            layout: 'hierarchy-workspace',
          },
          supportsUserChanges: true,
          list: {
            entries: Array.isArray(bootstrap.entries) ? bootstrap.entries : [],
            originalEntries: Array.isArray(bootstrap.originalEntries)
              ? bootstrap.originalEntries
              : [],
          },
          resources:
            bootstrap.resources && typeof bootstrap.resources === 'object'
              ? bootstrap.resources
              : null,
        });
        link(root, child);
        return root;
      }

      default:
        return staticPage();
    }
  };

  ctx.ui = { level: fromBootstrap() };
  ctxElement.textContent = JSON.stringify(ctx).replace(/</g, '\\u003c');

  /**
   * Open one browser-owned UI surface under the current (or explicit) UI level.
   * `host` is an orthogonal mounting choice: popup and embedded callers use the
   * same opener, topology and lifecycle. Routed page roots are materialized by
   * bootstrap through the same `surface()` model rather than a parallel child opener.
   * Embedded children deliberately leave their parent active.
   */
  const uiLevelAt = (path) => {
    const runtime = window.ManatOS?.ctx;
    const level = path ? runtime?.get?.(path) : null;
    return level && typeof level === 'object' ? { level, path } : null;
  };

  const uiLeaf = () => {
    const runtime = window.ManatOS?.ctx;
    let level = runtime?.value?.ui?.level;
    if (!level) return null;
    let path = 'ctx.ui.level';
    while (level?.level) {
      level = level.level;
      path += '.level';
    }
    return { level, path };
  };

  const openSurface = ({
    parentPath = null,
    host = 'popup',
    kind = 'custom',
    mode = 'view',
    name = kind,
    entityKey = null,
    entityName = null,
    recordId = null,
    invocation = {},
    presentation = {},
    state: statePatch = {},
    entry = null,
    resources = null,
    supportsUserChanges = false,
    source = 'ui-host',
  } = {}) => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime?.replace) return null;
    const parent = parentPath ? uiLevelAt(parentPath) : uiLeaf();
    if (!parent?.level?.control) return null;
    if (!['popup', 'embedded'].includes(host)) {
      throw new Error(`Unsupported browser child surface host: ${host}`);
    }

    const normalizedName = safeName(name, kind || host);
    const childPath = `${parent.path}.level`;
    if (runtime.get?.(childPath) !== undefined) {
      throw new Error(`UI level already owns a child surface: ${parent.path}`);
    }

    const child = surface({
      id: `${host}-${kind}-${normalizedName}-${Date.now()}`,
      parent: parent.level,
      host,
      kind: String(kind || 'custom'),
      mode: String(mode || 'view'),
      name: normalizedName,
      entityKey,
      entityName,
      recordId,
      invocation,
      presentation,
      entry,
      resources,
      supportsUserChanges,
      fields:
        kind === 'entry' && entityKey
          ? entryFields(
              entityKey,
              entry?.current,
              entry?.original ?? entry?.current,
              mode,
              resources?.referenceData,
            )
          : null,
    });
    child.control.state = {
      ...child.control.state,
      ...statePatch,
      active: true,
      lifecycle: 'active',
    };

    if (host !== 'embedded') {
      runtime.replace(
        `${parent.path}.control.state`,
        { ...parent.level.control.state, lifecycle: 'deactivating', active: false },
        { source, action: 'deactivate-parent-surface', triggerPath: childPath },
      );
    }
    runtime.replace(childPath, child, {
      source,
      action: `open-${host}-surface`,
      triggerPath: childPath,
    });
    return Object.freeze({ id: child.control.id, host, path: childPath, parentPath: parent.path });
  };

  /**
   * Hydrate a browser-opened entry child from the same factual bootstrap envelope
   * used by a routed entry page. Rendering remains server-owned; CTX topology and
   * canonical field state remain browser-owned.
   */
  const hydrateEntrySurface = (handle, entryBootstrap) => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime?.replace || !handle?.path) return false;
    const current = runtime.get?.(handle.path);
    if (current?.control?.kind !== 'entry') return false;
    const input = entryBootstrap && typeof entryBootstrap === 'object' ? entryBootstrap : null;
    if (!input?.entityKey) return false;

    const mode = input.isNew ? 'create' : input.readOnly ? 'view' : 'edit';
    if (mode !== current.control.mode) return false;
    const entityName = input.entityName || entityContextFor(input.entityKey)?.name || null;
    const rules = canonicalEntryRules(input.defaults, input.uiOverrides);
    const invocation = {
      ...(current.control.invocation || {}),
      ...(entityName ? { entityName } : {}),
      behavior: { recoverable: input.recoverable !== false },
      ...(Object.keys(rules).length ? { rules } : {}),
    };
    const presentation = {
      ...(current.control.presentation || {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.icon ? { icon: input.icon } : {}),
      ...(input.uiView ? { uiView: { ...input.uiView } } : {}),
      layout: 'entity-entry',
    };
    const control = {
      ...current.control,
      mode,
      entityKey: input.entityKey,
      ...(entityName ? { entityName } : {}),
      ...(input.recordId ? { recordId: input.recordId } : {}),
      invocation,
      presentation,
      facts:
        input.entry?.facts && typeof input.entry.facts === 'object' ? { ...input.entry.facts } : {},
      supportsUserChanges: mode !== 'view',
      state: {
        ...(current.control.state || state(input.navigation)),
        navigation: {
          activeTabId: input.navigation?.activeTabId ?? null,
          activeInternalTabIds: { ...(input.navigation?.activeInternalTabIds || {}) },
        },
      },
    };
    const resources = input.resources && typeof input.resources === 'object' ? input.resources : {};
    const fields = entryFields(
      input.entityKey,
      input.entry?.current,
      input.entry?.original,
      mode,
      resources.referenceData,
    );
    runtime.replace(
      handle.path,
      {
        ...current,
        control,
        entry: { original: {}, current: {} },
        ...(Object.keys(resources).length ? { resources } : {}),
        fields,
      },
      { source: 'ui-host', action: 'hydrate-entry-surface', triggerPath: handle.path },
    );
    return true;
  };

  const updateChildSurface = (handle, patch, options = {}) => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime?.replace || !handle?.path) return false;
    const current = runtime.get?.(handle.path);
    if (!current || typeof current !== 'object') return false;
    runtime.replace(
      handle.path,
      { ...current, ...patch },
      {
        source: options.source || 'ui-host',
        action: options.action || 'update-child-surface',
        triggerPath: handle.path,
      },
    );
    return true;
  };

  const announceSurfaceDisposing = (path, source = 'ui-host') => {
    if (!path) return;
    window.dispatchEvent(
      new CustomEvent('manatos:ui-level-disposing', {
        detail: Object.freeze({ path: String(path), source: String(source || 'ui-host') }),
      }),
    );
  };

  const closeSurface = (handle, source = 'ui-host') => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime?.delete || !handle?.path || runtime.get?.(handle.path) === undefined) return false;
    // Surface-owned browser runtimes must retire their subscriptions while their
    // lexical CTX scope still exists. This prevents the disposal mutations below
    // from re-entering evaluators whose owner is already being destroyed.
    announceSurfaceDisposing(handle.path, source);
    userInputBlockers.delete(String(handle.path));
    if (runtime.replace) {
      runtime.replace(`${handle.path}.control.state.lifecycle`, 'closing', { source });
      runtime.replace(`${handle.path}.control.state.active`, false, { source });
      runtime.replace(`${handle.path}.control.state.lifecycle`, 'closed', { source });
      runtime.replace(`${handle.path}.control.state.lifecycle`, 'disposed', { source });
    }
    runtime.delete(handle.path, {
      source,
      action: `close-${handle.host || 'child'}-surface`,
      triggerPath: handle.path,
    });
    if (handle.host !== 'embedded' && handle.parentPath) {
      const parentState = runtime.get?.(`${handle.parentPath}.control.state`);
      if (parentState && typeof parentState === 'object') {
        runtime.replace(
          `${handle.parentPath}.control.state`,
          { ...parentState, lifecycle: 'active', active: true },
          { source, action: 'reactivate-parent-surface', triggerPath: handle.parentPath },
        );
      }
    }
    return true;
  };

  /*
   * One user-input readiness authority for every UI surface. Callers acquire
   * named blockers while initialization/long operations are active; CTX exposes
   * only the aggregate userInputReady flag. Buttons, X chrome and keyboard
   * dismissal consume that same fact rather than maintaining parallel tests.
   */
  const userInputBlockers = new Map();
  const surfaceTargetPath = (target = null) => {
    if (typeof target === 'string') return target;
    if (target?.path) return String(target.path);
    return uiLeaf()?.path || null;
  };
  const publishUserInputReady = (path) => {
    const runtime = window.ManatOS?.ctx;
    const surface = path ? runtime?.get?.(path) : null;
    if (!surface?.control?.state || !runtime?.replace) return false;
    const ready = (userInputBlockers.get(path)?.size || 0) === 0;
    if (surface.control.state.userInputReady !== ready) {
      runtime.replace(`${path}.control.state.userInputReady`, ready, {
        source: 'user-input-readiness',
        action: ready ? 'input-ready' : 'input-blocked',
      });
    }
    window.dispatchEvent(
      new CustomEvent('manatos:user-input-readiness-changed', {
        detail: Object.freeze({ path, ready }),
      }),
    );
    return ready;
  };
  const setUserInputBlocked = (target, owner, blocked = true) => {
    const path = surfaceTargetPath(target);
    const key = String(owner || '').trim();
    if (!path || !key) return () => {};
    let blockers = userInputBlockers.get(path);
    if (!blockers) {
      blockers = new Map();
      userInputBlockers.set(path, blockers);
    }
    if (blocked) blockers.set(key, true);
    else blockers.delete(key);
    if (!blockers.size) userInputBlockers.delete(path);
    publishUserInputReady(path);
    let released = !blocked;
    return () => {
      if (released) return;
      released = true;
      const current = userInputBlockers.get(path);
      current?.delete(key);
      if (current && !current.size) userInputBlockers.delete(path);
      publishUserInputReady(path);
    };
  };
  const isUserInputReady = (target = null) => {
    const path = surfaceTargetPath(target);
    if (!path) return false;
    const state = window.ManatOS?.ctx?.get?.(`${path}.control.state`);
    return Boolean(state && state.active !== false && state.userInputReady !== false);
  };

  const recoveryAdapters = new Map();

  const registerRecoveryAdapter = (path, adapter) => {
    if (!path || !adapter || typeof adapter !== 'object') return () => {};
    recoveryAdapters.set(String(path), adapter);
    return () => recoveryAdapters.delete(String(path));
  };

  const recoveryAdapter = (path) => recoveryAdapters.get(String(path || '')) || null;

  const currentUserChangePath = () => {
    const runtime = window.ManatOS?.ctx;
    let node = runtime?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    let candidate = node?.control?.supportsUserChanges === true ? path : null;
    while (node?.level) {
      node = node.level;
      path += '.level';
      if (node?.control?.supportsUserChanges === true) candidate = path;
    }
    return candidate;
  };

  /** Return the deepest active CTX UI surface matching the requested kind.
   * Nested component/hierarchy levels must not hide their owning entry surface. */
  const surfacePath = (kind) => {
    const wanted = String(kind || '').trim();
    if (!wanted) return null;
    let node = window.ManatOS?.ctx?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    let match = null;
    while (node) {
      if (node?.control?.kind === wanted) match = path;
      node = node.level;
      path += '.level';
    }
    return match;
  };

  const isDirty = (path) =>
    Boolean(path) && window.ManatOS?.ctx?.get?.(`${path}.control.state.dirty`) === true;

  const isRecoverable = (path) => {
    const control = path ? window.ManatOS?.ctx?.get?.(`${path}.control`) : null;
    return (
      Boolean(control) &&
      control.supportsUserChanges === true &&
      control.invocation?.behavior?.recoverable !== false
    );
  };

  const recoverableChanges = (path) => {
    if (!isRecoverable(path)) return null;
    return recoveryAdapter(path)?.getUserChanges?.() ?? null;
  };

  // Browser UI levels have one explicit deepest-first disposal path. Outage
  // recovery uses this before replacing the workspace so no stale public CTX
  // surfaces survive while the local unavailable page is displayed.
  window.ManatOS ||= {};
  window.ManatOS.uiHost = Object.freeze({
    openSurface,
    hydrateEntrySurface,
    updateChildSurface,
    closeSurface,
    registerRecoveryAdapter,
    currentUserChangePath,
    surfacePath,
    setUserInputBlocked,
    isUserInputReady,
    isDirty,
    isRecoverable,
    recoverableChanges,
    shouldConfirmCancellation(path = currentUserChangePath()) {
      return isDirty(path) && recoverableChanges(path) != null;
    },
    cancellationPresentation(path = currentUserChangePath()) {
      return recoveryAdapter(path)?.cancellationPresentation?.() ?? null;
    },
    async discardUserChanges(path = currentUserChangePath()) {
      return (await recoveryAdapter(path)?.discardUserChanges?.()) ?? true;
    },
    canSaveUserChanges(path = currentUserChangePath()) {
      return typeof recoveryAdapter(path)?.saveUserChanges === 'function';
    },
    async saveUserChanges(path = currentUserChangePath()) {
      return (await recoveryAdapter(path)?.saveUserChanges?.()) === true;
    },
    getUserChanges(path) {
      return recoveryAdapter(path)?.getUserChanges?.() ?? null;
    },
    async applyUserChanges(path, changes) {
      return (await recoveryAdapter(path)?.applyUserChanges?.(changes)) ?? false;
    },
    async verifyUserChanges(path, changes) {
      return (await recoveryAdapter(path)?.verifyUserChanges?.(changes)) ?? false;
    },
    async prepareGentleClose(path) {
      return (await recoveryAdapter(path)?.prepareGentleClose?.()) ?? true;
    },
    disposeAll(source = 'ui-host') {
      const runtime = window.ManatOS?.ctx;
      if (!runtime?.value?.ui?.level || !runtime?.replace) return;
      const paths = [];
      let node = runtime.value.ui.level;
      let path = 'ctx.ui.level';
      while (node) {
        paths.push(path);
        node = node.level;
        path += '.level';
      }
      for (const levelPath of paths.reverse()) {
        announceSurfaceDisposing(levelPath, source);
        runtime.replace(`${levelPath}.control.state.lifecycle`, 'closing', { source });
        runtime.replace(`${levelPath}.control.state.active`, false, { source });
        runtime.replace(`${levelPath}.control.state.lifecycle`, 'closed', { source });
        runtime.replace(`${levelPath}.control.state.lifecycle`, 'disposed', { source });
      }
      runtime.replace('ctx.ui.level', null, { source, triggerPath: 'ctx.ui.level' });
    },
  });
})();
