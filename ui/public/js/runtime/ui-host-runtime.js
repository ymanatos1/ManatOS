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
    recordId = null,
    invocation = {},
    presentation = {},
    navigation = null,
    entry = null,
    list = null,
    facts = null,
    resources = null,
    fields = null,
  }) => {
    const normalizedName = safeName(name, kind || 'page');
    const path = parent
      ? `${parent.path}/${host}:${normalizedName}`
      : `/ui/${host}:${normalizedName}`;
    return {
      id,
      host,
      kind,
      mode,
      name: normalizedName,
      path,
      scope: 'sys',
      ...(entityKey ? { entityKey } : {}),
      ...(recordId ? { recordId } : {}),
      invocation: { ...invocation },
      presentation: { kind, ...presentation },
      state: state(navigation),
      ...(facts && Object.keys(facts).length ? { facts } : {}),
      ...(resources && Object.keys(resources).length ? { resources } : {}),
      ...(entry ? { entry } : {}),
      ...(list ? { list } : {}),
      ...(fields && Object.keys(fields).length ? { fields } : {}),
    };
  };

  const link = (parent, child) => {
    parent.state.active = false;
    parent.level = child;
    return child;
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
      invocation: { purpose: 'show-page', parameters: { path: location.pathname } },
      presentation: name === 'home' ? { title: 'Home' } : {},
    });
  };

  const listSurface = (input) =>
    surface({
      id: `sysbo-list-${input.entityKey}`,
      host: 'page',
      kind: 'list',
      mode: 'browse',
      name: input.entityKey,
      entityKey: input.entityKey,
      invocation: {
        purpose: 'browse-entity-list',
        ...(input.query ? { parameters: { ...input.query } } : {}),
      },
      presentation: {
        title: input.pluralName || input.entityKey,
        ...(input.icon ? { icon: input.icon } : {}),
        layout: 'entity-list',
      },
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
  const entryFields = (entityKey, current, original, mode) => {
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
          return [
            key,
            {
              originalValue: originalValues[key] ?? null,
              value: currentValues[key] ?? null,
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
            invocation: { purpose: 'manage-entity-hierarchy' },
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
          recordId: bootstrap.recordId || null,
          invocation: {
            purpose: bootstrap.popup ? 'open-entity-entry-popup' : 'open-entity-entry-page',
            ...(bootstrap.defaults ? { defaults: bootstrap.defaults } : {}),
            ...(bootstrap.uiOverrides ? { uiOverrides: bootstrap.uiOverrides } : {}),
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
          fields: entryFields(
            bootstrap.entityKey,
            bootstrap.entry?.current,
            bootstrap.entry?.original,
            mode,
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
          recordId: bootstrap.focusedMemberId || null,
          invocation: {
            purpose: bootstrap.create ? 'create-hierarchy' : 'edit-hierarchy',
            ...(bootstrap.focusedMemberId ? { sourceRecordId: bootstrap.focusedMemberId } : {}),
          },
          presentation: {
            title: bootstrap.title || 'Hierarchy',
            icon: 'diagram-3',
            layout: 'hierarchy-workspace',
          },
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
})();
