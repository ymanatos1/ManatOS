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
        ...(entityKey ? { entityKey } : {}),
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
            ...(() => {
              const rules = canonicalEntryRules(bootstrap.defaults, bootstrap.uiOverrides);
              return Object.keys(rules).length ? { rules } : {};
            })(),
          },
          presentation: {
            title: bootstrap.title || bootstrap.entityName || bootstrap.entityKey,
            ...(bootstrap.icon ? { icon: bootstrap.icon } : {}),
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

  const recoveryAdapters = new Map();

  const registerRecoveryAdapter = (path, adapter) => {
    if (!path || !adapter || typeof adapter !== 'object') return () => {};
    recoveryAdapters.set(String(path), adapter);
    return () => recoveryAdapters.delete(String(path));
  };

  const recoveryAdapter = (path) => recoveryAdapters.get(String(path || '')) || null;

  // Browser UI levels have one explicit deepest-first disposal path. Outage
  // recovery uses this before replacing the workspace so no stale public CTX
  // surfaces survive while the local unavailable page is displayed.
  window.ManatOS ||= {};
  window.ManatOS.uiHost = Object.freeze({
    registerRecoveryAdapter,
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
        runtime.replace(`${levelPath}.control.state.lifecycle`, 'closing', { source });
        runtime.replace(`${levelPath}.control.state.active`, false, { source });
        runtime.replace(`${levelPath}.control.state.lifecycle`, 'closed', { source });
        runtime.replace(`${levelPath}.control.state.lifecycle`, 'disposed', { source });
      }
      runtime.replace('ctx.ui.level', null, { source, triggerPath: 'ctx.ui.level' });
    },
  });
})();
