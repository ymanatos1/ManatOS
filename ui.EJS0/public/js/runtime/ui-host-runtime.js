(() => {
  'use strict';

  /*
   * Browser-owned V2 UI host.
   *
   * Bootstrap projection materializes the routed page tree once, before the typed
   * runtime adopts it. After bootstrap, UiRuntime is the sole topology/lifecycle
   * authority; this compatibility facade may mutate semantic data inside a live
   * surface, but must never create, replace or remove a nested `level` edge.
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

  const enumItemsForField = (field) => {
    if (!field || typeof field !== 'object') return [];
    if (field.enum) {
      const definition = Object.values(ctx.enums || {}).find(
        (candidate) => candidate?.key === field.enum || candidate?.name === field.enum,
      );
      if (definition?.values && typeof definition.values === 'object') {
        return Object.values(definition.values);
      }
    }
    return Array.isArray(field.enumItems) ? field.enumItems : [];
  };
  window.ManatOS = window.ManatOS || {};
  window.ManatOS.enumItemsForField = enumItemsForField;

  const bootstrapElement = document.getElementById('manatosUiBootstrap');
  let bootstrap = null;
  try {
    bootstrap = JSON.parse(bootstrapElement?.textContent || 'null');
  } catch {
    bootstrap = null;
  }

  const state = (navigation = null) => ({
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
    collections = null,
    fields = null,
    selection = null,
    row = null,
    supportsUserChanges = false,
    persistence = null,
  }) => {
    const normalizedName = safeName(name, kind || 'page');
    const normalizedEntry =
      entry && typeof entry === 'object'
        ? {
            ...entry,
            original: entry.original && typeof entry.original === 'object' ? entry.original : {},
            current: entry.current && typeof entry.current === 'object' ? entry.current : {},
          }
        : null;
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
        facts: facts && typeof facts === 'object' ? { ...facts } : {},
        supportsUserChanges: supportsUserChanges === true,
        ...(persistence && typeof persistence === 'object'
          ? { persistence: structuredClone(persistence) }
          : {}),
        ...(entityKey ? { entityKey: String(entityKey) } : {}),
        ...(entityName ? { entityName } : {}),
        ...(recordId ? { recordId } : {}),
      },
      state: state(navigation),
      data: {
        ...(resources && Object.keys(resources).length ? { resources } : {}),
        ...(collections && Object.keys(collections).length
          ? { collections: structuredClone(collections) }
          : {}),
        ...(selection ? { selection } : {}),
        ...(row ? { row } : {}),
        ...(normalizedEntry ? { entry: normalizedEntry } : {}),
        ...(list ? { list } : {}),
        ...(fields && Object.keys(fields).length ? { fields } : {}),
      },
    };
  };

  const link = (parent, child) => {
    // Bootstrap owns projection only. Typed UiRuntime establishes lifecycle after
    // adopting the complete chain; this helper must not author lifecycle state.
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
        ...(input.presentationDefinition ? { definition: input.presentationDefinition } : {}),
      },
      facts:
        input.facts && typeof input.facts === 'object' && !Array.isArray(input.facts)
          ? input.facts
          : null,
      list:
        input.list && typeof input.list === 'object' && !Array.isArray(input.list)
          ? structuredClone(input.list)
          : {
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
          : input.list?.resources && typeof input.list.resources === 'object'
            ? structuredClone(input.list.resources)
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
                ? enumItemsForField(field).length
                  ? enumItemsForField(field)
                  : field.optionItems || []
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

  const bootstrapEntrySurface = (parent = null) => {
    const mode = bootstrap.isNew ? 'create' : bootstrap.readOnly ? 'view' : 'edit';
    return surface({
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
        ...(parent ? { caller: callerReference(parent) } : {}),
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
        actionsVisible: bootstrap.showEntryActions !== false,
      },
      navigation: bootstrap.navigation,
      // entry.current and entry.original are projection containers only. ctx-runtime
      // installs their per-field read-only getter mirrors from canonical fields state.
      entry: {
        original:
          bootstrap.entry?.original && typeof bootstrap.entry.original === 'object'
            ? structuredClone(bootstrap.entry.original)
            : {},
        current:
          bootstrap.entry?.current && typeof bootstrap.entry.current === 'object'
            ? structuredClone(bootstrap.entry.current)
            : {},
      },
      facts:
        bootstrap.entry?.facts && typeof bootstrap.entry.facts === 'object'
          ? bootstrap.entry.facts
          : null,
      resources:
        bootstrap.resources && typeof bootstrap.resources === 'object' ? bootstrap.resources : null,
      collections:
        bootstrap.collections && typeof bootstrap.collections === 'object'
          ? bootstrap.collections
          : null,
      supportsUserChanges: mode !== 'view',
      persistence:
        bootstrap.owner && typeof bootstrap.owner === 'object'
          ? {
              kind: 'return-to-caller',
              owner: {
                kind: 'hierarchy',
                name: bootstrap.owner.name || 'hierarchy',
                uiLevelPath: 'ctx.ui.level.level',
              },
              ultimateBoundary: {
                kind: 'aggregate',
                ownerUiLevelPath: 'ctx.ui.level.level',
              },
            }
          : { kind: 'repository' },
      fields: entryFields(
        bootstrap.entityKey,
        bootstrap.entry?.current,
        bootstrap.entry?.original,
        mode,
        bootstrap.resources?.referenceData,
      ),
    });
  };

  const fromBootstrap = () => {
    if (!bootstrap || typeof bootstrap !== 'object' || Array.isArray(bootstrap))
      return staticPage();

    switch (bootstrap.purpose) {
      case 'browse-entity-list':
        return listSurface(bootstrap);

      case 'open-account-entry':
        return bootstrapEntrySurface();

      case 'open-entity-entry': {
        const root = listSurface({
          entityKey: bootstrap.entityKey,
          pluralName: bootstrap.pluralName,
          icon: bootstrap.icon,
          entries: bootstrap.parentEntries,
          originalEntries: bootstrap.parentEntries,
          presentationDefinition: bootstrap.parentPresentationDefinition,
        });
        let parent = root;

        if (bootstrap.owner && typeof bootstrap.owner === 'object') {
          const owner = surface({
            id: `sysbo-owner-${bootstrap.entityKey}-${safeName(bootstrap.owner.name || 'hierarchy')}`,
            parent,
            host: 'page',
            kind: 'hierarchy',
            mode: bootstrap.owner.mode || 'edit',
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
              ...(bootstrap.owner.recoveryUrl ? { recoveryUrl: bootstrap.owner.recoveryUrl } : {}),
            },
            presentation: { layout: 'entity-hierarchy' },
            supportsUserChanges: true,
            persistence: { kind: 'aggregate' },
            list: {
              entries: Array.isArray(bootstrap.owner.entries) ? bootstrap.owner.entries : [],
              originalEntries: Array.isArray(bootstrap.owner.originalEntries)
                ? bootstrap.owner.originalEntries
                : [],
            },
            resources: {
              workspaceTransaction:
                bootstrap.owner.workspaceTransaction &&
                typeof bootstrap.owner.workspaceTransaction === 'object'
                  ? bootstrap.owner.workspaceTransaction
                  : { version: 1, mutations: [] },
              workspace: {
                ...(bootstrap.owner.fields && typeof bootstrap.owner.fields === 'object'
                  ? structuredClone(bootstrap.owner.fields)
                  : {}),
                identityField: bootstrap.owner.identityField || 'id',
                recycleBin: Array.isArray(bootstrap.owner.recycleBin)
                  ? bootstrap.owner.recycleBin
                  : [],
              },
            },
          });
          link(parent, owner);
          parent = owner;
        }

        const child = bootstrapEntrySurface(parent);
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
          presentationDefinition: bootstrap.parentPresentationDefinition,
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
            breadcrumbItems: Array.isArray(bootstrap.breadcrumbItems)
              ? bootstrap.breadcrumbItems.map((item) => ({ ...item }))
              : [],
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
   * `host` is an orthogonal mounting choice: page, popup and embedded callers use
   * the same opener, topology and lifecycle. Routed page roots are materialized by
   * bootstrap through the same `surface()` model; nested page children can therefore
   * use this canonical opener once their page presenter is production-connected.
   * Embedded children deliberately leave their parent active.
   */
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

  const openSurface = (request = {}) => {
    const typedHost = window.ManatOS?.uiHostV2;
    if (!typedHost?.openSurface) {
      // The compatibility script is parsed before the browser TypeScript bundle,
      // but interactive child surfaces are not valid until that typed runtime is
      // installed. Semantic child construction therefore has one authority.
      return null;
    }
    return typedHost.openSurface(request);
  };

  /**
   * Compatibility facade only. Typed browser runtime owns semantic entry hydration.
   */
  const hydrateEntrySurface = (handle, entryBootstrap) =>
    window.ManatOS?.uiHostV2?.hydrateEntrySurface?.(handle, entryBootstrap) ?? false;

  const surfaceResult = (handle, outcome = 'closed', detail = {}) => {
    const typedHost = window.ManatOS?.uiHostV2;
    if (!typedHost?.surfaceResult) {
      throw new Error('Typed UI runtime is required to create a surface result.');
    }
    return typedHost.surfaceResult(handle, outcome, detail);
  };

  const updateChildSurface = (handle, patch, options = {}) => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime?.replace || !handle?.path) return false;
    const current = runtime.get?.(handle.path);
    if (!current || typeof current !== 'object') return false;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
    // Compatibility callers may update semantic contents, but runtime-owned
    // topology, lifecycle and structural identity are immutable through this facade.
    if (Object.prototype.hasOwnProperty.call(patch, 'level')) {
      throw new Error('Surface updates cannot mutate UiLevel topology.');
    }
    const statePatch = patch.state;
    if (
      statePatch &&
      typeof statePatch === 'object' &&
      !Array.isArray(statePatch) &&
      (Object.prototype.hasOwnProperty.call(statePatch, 'lifecycle') ||
        Object.prototype.hasOwnProperty.call(statePatch, 'active'))
    ) {
      throw new Error('Surface updates cannot mutate UiLevel lifecycle.');
    }
    const controlPatch = patch.control;
    if (controlPatch && typeof controlPatch === 'object' && !Array.isArray(controlPatch)) {
      const reservedIdentity = ['id', 'host', 'kind', 'name', 'path'];
      for (const key of reservedIdentity) {
        if (
          Object.prototype.hasOwnProperty.call(controlPatch, key) &&
          !Object.is(controlPatch[key], current.control?.[key])
        ) {
          throw new Error(`Surface updates cannot mutate UiLevel identity: ${key}.`);
        }
      }
    }
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

  const closeSurface = async (handle, source = 'ui-host', decision = null) => {
    const runtime = window.ManatOS?.ctx;
    if (!runtime?.delete || !handle?.path || runtime.get?.(handle.path) === undefined) return false;
    const typedHost = window.ManatOS?.uiHostV2;
    if (!typedHost?.close) {
      throw new Error('Typed UI runtime is required to close a browser UI surface.');
    }
    const status = await typedHost.close({
      id: handle.id,
      source,
      ...(decision ? { decision } : {}),
    });
    if (status === 'decision-required') {
      window.dispatchEvent(
        new CustomEvent('manatos:ui-close-decision-required', {
          detail: Object.freeze({ handle, source }),
        }),
      );
      return false;
    }
    if (status !== 'closed') return false;
    // Typed UiRuntime announces disposal after the close decision succeeds but
    // before canonical CTX removal, so lifecycle subscribers can release safely.
    userInputBlockers.delete(String(handle.path));
    return true;
  };

  const closePath = async (path, source = 'ui-host', decision = null) => {
    const control = path ? window.ManatOS?.ctx?.get?.(`${path}.control`) : null;
    const id = control?.id ? String(control.id) : '';
    if (!id) return false;
    return closeSurface({ id, path: String(path) }, source, decision);
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
    if (!surface?.state || !runtime?.replace) return false;
    const ready = (userInputBlockers.get(path)?.size || 0) === 0;
    if (surface.state.userInputReady !== ready) {
      runtime.replace(`${path}.state.userInputReady`, ready, {
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
    const state = window.ManatOS?.ctx?.get?.(`${path}.state`);
    return Boolean(state && state.active !== false && state.userInputReady !== false);
  };

  const recoveryAdapters = new Map();

  const registerRecoveryAdapter = (path, adapter) => {
    if (!path || !adapter || typeof adapter !== 'object') return () => {};
    recoveryAdapters.set(String(path), adapter);
    return () => recoveryAdapters.delete(String(path));
  };

  const recoveryAdapter = (path) => recoveryAdapters.get(String(path || '')) || null;

  // Navigation closes the actual deepest live UiLevel first, even when that
  // surface is clean. Dirty-state ownership is a separate concern handled by
  // currentUserChangePath() and the typed close authority.
  const currentSurfacePath = () => uiLeaf()?.path || null;

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
    Boolean(path) && window.ManatOS?.ctx?.get?.(`${path}.state.dirty`) === true;

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
  const setListLoading = (loading) => {
    const runtime = window.ManatOS?.ctx;
    const level = runtime?.value?.ui?.level;
    if (!runtime?.replace || level?.control?.kind !== 'list') return false;
    runtime.replace('ctx.ui.level.data.list.loading', Boolean(loading), {
      source: 'entity-list-navigation',
    });
    runtime.replace('ctx.ui.level.state.loading', Boolean(loading), {
      source: 'entity-list-navigation',
    });
    return true;
  };

  const syncListSurface = (nextList) => {
    const runtime = window.ManatOS?.ctx;
    const level = runtime?.value?.ui?.level;
    if (!runtime?.replace || level?.control?.kind !== 'list') return false;
    if (!nextList || typeof nextList !== 'object' || Array.isArray(nextList)) return false;

    runtime.replace('ctx.ui.level.data.list', structuredClone(nextList), {
      source: 'entity-list-navigation',
      triggerPath: 'ctx.ui.level.data.list',
    });
    runtime.replace('ctx.ui.level.state.loading', Boolean(nextList.loading), {
      source: 'entity-list-navigation',
    });
    // control.facts is immutable invocation/control context. AJAX paging, sorting
    // and filtering refresh only the list's semantic data snapshot; they must not
    // rewrite the UiLevel control contract.
    return true;
  };

  window.ManatOS ||= {};
  window.ManatOS.uiHost = Object.freeze({
    setListLoading,
    syncListSurface,
    openSurface,
    hydrateEntrySurface,
    surfaceResult,
    updateChildSurface,
    closeSurface,
    closePath,
    registerRecoveryAdapter,
    currentSurfacePath,
    currentUserChangePath,
    surfacePath,
    setUserInputBlocked,
    isUserInputReady,
    isDirty,
    isRecoverable,
    recoverableChanges,
    recoveryUrl(path) {
      const value = recoveryAdapter(path)?.recoveryUrl?.();
      return typeof value === 'string' && value ? value : null;
    },
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
      const adapter = recoveryAdapter(path);
      if (typeof adapter?.saveUserChanges !== 'function') return false;
      return typeof adapter.canSaveUserChanges === 'function'
        ? adapter.canSaveUserChanges() === true
        : true;
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
    async disposeAll(source = 'ui-host', options = {}) {
      const runtime = window.ManatOS?.ctx;
      if (!runtime?.value?.ui?.level || !runtime?.replace) return false;
      const typedHost = window.ManatOS?.uiHostV2;
      if (!typedHost?.disposeAll) {
        throw new Error('Typed UI runtime is required to dispose the browser UI tree.');
      }
      const closed = await typedHost.disposeAll({
        source,
        ...(options?.decision === 'discard' ? { decision: 'discard' } : {}),
      });
      if (closed !== true) return false;
      userInputBlockers.clear();
      return true;
    },
  });
})();
