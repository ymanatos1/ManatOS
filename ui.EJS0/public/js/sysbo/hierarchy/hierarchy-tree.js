(async () => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  if (!runtime?.resolve) return;

  const components = [...document.querySelectorAll('[data-metadata-component="hierarchy-tree"]')];
  if (!components.length) return;

  const reactivePolicy = await import('/shared-runtime/policies/reactive-runtime-policy.js');
  const pathsOverlap = reactivePolicy.reactivePathsOverlap;

  const componentState = new WeakMap();

  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char],
    );

  const optionsFor = (component) => {
    try {
      const parsed = JSON.parse(component.dataset.metadataComponentOptions || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const stateFor = (component, options) => {
    let state = componentState.get(component);
    if (state) return state;

    const declaredModes = String(options.viewModes || 'tree')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value === 'tree' || value === 'chart');
    const modes = declaredModes.length ? [...new Set(declaredModes)] : ['tree'];
    const requestedDefault = String(options.defaultView || modes[0]);

    state = {
      modes,
      mode: modes.includes(requestedDefault) ? requestedDefault : modes[0],
      collapsed: new Set(),
    };
    componentState.set(component, state);
    return state;
  };

  const entityMetadata = (entityKey) => runtime.entity?.(entityKey)?.metadata ?? null;

  const iconMapFor = (component, options) => {
    const typeField = String(options.typeField || '');
    if (!typeField) return new Map();
    const metadata = entityMetadata(component.dataset.entityKey || '');
    const items = window.ManatOS?.enumItemsForField?.(metadata?.fieldDefinition?.[typeField]) || [];
    return new Map(
      Array.isArray(items) ? items.map((item) => [String(item.value), item.icon || 'circle']) : [],
    );
  };

  const leafPagePath = () => {
    let node = runtime?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  const componentScopePath = (component) =>
    component.dataset.ctxScopePath || leafPagePath() || undefined;

  /**
   * Resolve one metadata-declared source from the owning V2 UI level.
   *
   * Component source metadata is expressed relative to the UiLevel data model
   * (`entry.*`, `list.*`, `resources.*`). CTX stores that model canonically
   * below `#level.data`. Keep that projection rule here, once, rather than
   * leaking physical `data.` prefixes into entity/component metadata.
   */
  const sourceCandidates = (path) => {
    const source = String(path || '').trim();
    if (!source) return [];
    const semanticRoot = source.split(/[.[\]]/, 1)[0];
    return ['entry', 'list', 'resources'].includes(semanticRoot) ? [`data.${source}`] : [source];
  };

  const resolveSource = (component, path) => {
    const scopePath = componentScopePath(component);
    for (const candidate of sourceCandidates(path, scopePath)) {
      const resolved = runtime.resolve(candidate, scopePath);
      if (resolved !== undefined) return resolved;
    }
    return undefined;
  };

  const resolveSourcePath = (component, path) => {
    const scopePath = componentScopePath(component);
    for (const candidate of sourceCandidates(path, scopePath)) {
      const resolved = runtime.resolvePath?.(candidate, scopePath);
      if (typeof resolved === 'string' && resolved) return resolved;
    }
    return undefined;
  };

  const resolvedDependencyPaths = (component) => {
    const options = optionsFor(component);
    const dataSource = String(options.dataSource || 'list.entries');
    const currentSource = String(options.currentSource || 'entry.current');
    const originalSource = String(options.originalSource || '');
    const focusSource = String(options.focusSource || '');
    const originalMemberSource = String(options.originalMemberSource || '');
    const recycleSource = String(options.recycleSource || '');
    const transactionSource = String(options.transactionSource || '');
    return [
      dataSource,
      currentSource,
      originalSource,
      focusSource,
      originalMemberSource,
      recycleSource,
      transactionSource,
    ]
      .filter(Boolean)
      .map((path) => resolveSourcePath(component, path))
      .filter((path) => typeof path === 'string' && path);
  };

  /**
   * Convert either an ordered list snapshot or an ID-keyed workspace snapshot
   * into rows. Keyed maps are used by transactional hierarchy workspaces where
   * array position has no semantic meaning.
   */
  const collectionRows = (value, idField) => {
    if (Array.isArray(value)) {
      return value.filter((row) => row && typeof row === 'object').map((row) => ({ ...row }));
    }
    if (
      !value ||
      typeof value !== 'object' ||
      !idField ||
      Object.prototype.hasOwnProperty.call(value, idField)
    ) {
      return null;
    }
    const rows = Object.values(value)
      .filter(
        (row) =>
          row &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          row[idField] != null &&
          String(row[idField]) !== '',
      )
      .map((row) => ({ ...row }));
    return rows.length || Object.keys(value).length === 0 ? rows : null;
  };

  /**
   * Project live state over the hierarchy source. Entry pages provide one
   * entry record over parent entries; hierarchy workspaces provide the
   * complete ID-keyed entry graph. Both forms are metadata-driven.
   */
  const projectedRows = (list, current, idField) => {
    const currentRows = collectionRows(current, idField);
    if (currentRows) return currentRows;

    const sourceRows = collectionRows(list, idField) || [];
    if (!current || typeof current !== 'object' || !idField) return sourceRows;

    const currentId = current[idField];
    if (currentId == null || currentId === '') return sourceRows;

    let found = false;
    const rows = sourceRows.map((row) => {
      if (String(row[idField]) !== String(currentId)) return { ...row };
      found = true;
      return { ...row, ...current };
    });
    if (!found) rows.push({ ...current });
    return rows;
  };

  const buildTree = (component) => {
    const options = optionsFor(component);
    const state = stateFor(component, options);
    const dataSource = String(options.dataSource || 'list.entries');
    const currentSource = String(options.currentSource || 'entry.current');
    const originalSource = String(options.originalSource || '');
    const focusSource = String(options.focusSource || '');
    const originalMemberSource = String(options.originalMemberSource || '');
    const recycleSource = String(options.recycleSource || '');
    const transactionSource = String(options.transactionSource || '');
    const idField = String(options.idField || '');
    const parentField = String(options.parentField || '');
    const rootField = String(options.rootField || '');
    const labelField = String(options.labelField || '');
    const typeField = String(options.typeField || '');
    const entryRepresentation =
      options.entryRepresentation && typeof options.entryRepresentation === 'object'
        ? options.entryRepresentation
        : {};
    const workspaceMode = String(options.interactionMode || '') === 'workspace';

    if (!idField || !parentField) return;

    const list = resolveSource(component, dataSource);
    const current = resolveSource(component, currentSource);
    const originals = originalSource
      ? collectionRows(resolveSource(component, originalSource), idField) || []
      : [];
    const listPath = resolveSourcePath(component, dataSource);
    const currentPath = resolveSourcePath(component, currentSource);
    const editingId = workspaceMode ? String(component.dataset.hierarchyEditingId || '') : '';
    const rows = projectedRows(list, current, idField).filter(
      (row) => !editingId || String(row?.[idField] ?? '') !== editingId,
    );
    const currentIsRecord =
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      Object.prototype.hasOwnProperty.call(current, idField);
    const focusedValue = focusSource ? resolveSource(component, focusSource) : null;
    const originalMemberId = originalMemberSource
      ? String(resolveSource(component, originalMemberSource) ?? '')
      : '';
    const recycleRows =
      workspaceMode && recycleSource
        ? collectionRows(resolveSource(component, recycleSource), idField) || []
        : [];
    const workspaceTransaction =
      workspaceMode && transactionSource ? resolveSource(component, transactionSource) : null;
    const flattenMutations = (snapshot) => {
      const result = [];
      const visit = (mutation) => {
        if (!mutation || typeof mutation !== 'object') return;
        result.push(mutation);
        if (Array.isArray(mutation.children)) mutation.children.forEach(visit);
      };
      if (Array.isArray(snapshot?.mutations)) snapshot.mutations.forEach(visit);
      return result;
    };
    const externalMutations = flattenMutations(workspaceTransaction).filter(
      (mutation) => String(mutation.entityKey || '') !== String(component.dataset.entityKey || ''),
    );
    const currentId = focusedValue ?? (currentIsRecord ? current[idField] : null);
    const byIdForFocus = new Map(rows.map((row) => [String(row[idField]), row]));
    const focusedRow = currentId == null ? null : byIdForFocus.get(String(currentId));
    const currentRoot = rootField
      ? (focusedRow?.[rootField] ?? (currentIsRecord ? current[rootField] : null))
      : null;
    const rootId =
      currentRoot ??
      currentId ??
      rows.find((row) => row[parentField] == null || row[parentField] === '')?.[idField];

    component.replaceChildren();

    if (state.modes.length > 1) {
      const toolbar = document.createElement('div');
      toolbar.className = 'metadata-hierarchy-toolbar d-flex justify-content-start mb-2';
      toolbar.setAttribute('role', 'group');
      toolbar.setAttribute('aria-label', 'Hierarchy visualization');
      toolbar.innerHTML = `
        <div class="btn-group btn-group-sm" role="group" aria-label="Hierarchy visualization mode">
          ${state.modes
            .map(
              (mode) => `
            <button
              type="button"
              class="btn ${state.mode === mode ? 'btn-primary' : 'btn-outline-secondary'}"
              data-hierarchy-view-mode="${esc(mode)}"
              aria-pressed="${state.mode === mode ? 'true' : 'false'}"
              title="${mode === 'chart' ? 'Chart' : 'Tree'}"
              aria-label="${mode === 'chart' ? 'Chart' : 'Tree'}"
            >
              <i class="bi bi-${mode === 'chart' ? 'diagram-3' : 'list-nested'}" aria-hidden="true"></i>
            </button>
          `,
            )
            .join('')}
        </div>`;
      toolbar.querySelectorAll('[data-hierarchy-view-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          const nextMode = button.dataset.hierarchyViewMode;
          if (!nextMode || !state.modes.includes(nextMode) || state.mode === nextMode) return;
          state.mode = nextMode;
          buildTree(component);
        });
      });
      component.append(toolbar);
    }

    const content = document.createElement('div');
    content.className = `metadata-hierarchy-tree metadata-hierarchy-view-${state.mode}`;
    content.dataset.hierarchyTreeContent = '';
    const empty = document.createElement('div');
    empty.className = 'metadata-hierarchy-empty text-secondary small py-3';
    empty.dataset.hierarchyTreeEmpty = '';
    if (workspaceMode) {
      const emptyAddLabel = String(options.emptyAddLabel || 'Add entry');
      const emptyAddTitle = String(options.emptyAddTitle || emptyAddLabel);
      empty.innerHTML = `
        <button type="button" class="metadata-hierarchy-empty-add btn btn-primary" data-hierarchy-empty-add title="${esc(emptyAddTitle)}" aria-label="${esc(emptyAddTitle)}">
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
        </button>
        <div class="metadata-hierarchy-empty-add-caption">${esc(emptyAddLabel)}</div>`;
    } else {
      empty.textContent = 'No hierarchy is available for the current record.';
    }
    component.append(content, empty);

    const entryStateFor = (row) => {
      const project = window.ManatOS?.organizationHierarchyEntryState;
      return typeof project === 'function'
        ? project(row, originals, idField)
        : { persisted: false, changed: false };
    };
    const entryStateIndicator = (row) => {
      const entryState = entryStateFor(row);
      if (!entryState.persisted) return '';
      return `<span class="metadata-hierarchy-node-state" data-hierarchy-entry-state><span class="metadata-hierarchy-node-persistence" title="This entry already exists in application storage/database." aria-label="This entry already exists in application storage/database."><i class="bi bi-database-check" aria-hidden="true"></i></span>${entryState.changed ? '<span class="metadata-hierarchy-node-changed text-primary" title="This existing entry has unsaved changes." aria-label="This existing entry has unsaved changes."><i class="bi bi-pencil-square" aria-hidden="true"></i></span>' : ''}</span>`;
    };

    const closeContainerInteractions = (exceptPanel = null, exceptMenu = null) => {
      component
        .querySelectorAll('[data-hierarchy-external-panel], [data-hierarchy-recycle-panel]')
        .forEach((panel) => {
          if (panel !== exceptPanel) panel.hidden = true;
        });
      component
        .querySelectorAll('[data-hierarchy-external-menu], [data-hierarchy-recycle-menu]')
        .forEach((menu) => {
          if (menu !== exceptMenu) menu.hidden = true;
        });
      component
        .querySelectorAll(
          '[data-hierarchy-external-toggle], [data-hierarchy-recycle-toggle], [data-hierarchy-external-entry], [data-hierarchy-recycle-entry]',
        )
        .forEach((button) => {
          const ownsExcept =
            button.parentElement?.contains(exceptPanel) ||
            button.parentElement?.contains(exceptMenu);
          button.setAttribute('aria-expanded', String(Boolean(ownsExcept)));
        });
      // Preserve the selected interaction explicitly. This makes the controller
      // idempotent even when another close path ran earlier in the same click turn.
      if (exceptPanel instanceof HTMLElement) exceptPanel.hidden = false;
      if (exceptMenu instanceof HTMLElement) exceptMenu.hidden = false;
    };
    const bindContainerEntryMenu = (button, menuSelector) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const menu = button.parentElement?.querySelector(menuSelector);
        if (!(menu instanceof HTMLElement)) return;
        const opening = menu.hidden;
        const panel = button.closest(
          '[data-hierarchy-external-panel], [data-hierarchy-recycle-panel]',
        );
        closeContainerInteractions(
          opening && panel instanceof HTMLElement ? panel : null,
          opening ? menu : null,
        );
        if (!opening) menu.hidden = true;
        button.setAttribute('aria-expanded', String(opening));
      });
    };

    if (component.dataset.containerDismissRegistered !== 'true') {
      component.dataset.containerDismissRegistered = 'true';
      document.addEventListener('click', (event) => {
        if (!component.isConnected) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest?.('[data-hierarchy-external-group], [data-hierarchy-recycle-bin]'))
          return;
        closeContainerInteractions();
      });
    }

    // External-entry chrome is another projection of canonical workspaceTransaction.
    // It owns no User/entity state: grouping is derived by entityKey on every render.
    if (workspaceMode && externalMutations.length) {
      const external = document.createElement('section');
      external.className = `metadata-hierarchy-external metadata-hierarchy-external-${state.mode}`;
      external.dataset.hierarchyExternalEntities = '';
      const groups = new Map();
      for (const mutation of externalMutations) {
        const key = String(mutation.entityKey || '');
        if (!key) continue;
        const items = groups.get(key) || [];
        items.push(mutation);
        groups.set(key, items);
      }
      const entityContextFor = (key) => runtime.entity?.(key) || null;
      const mutationDescriptor = (mutation) => {
        const record = mutation.current || mutation.original || {};
        const key = String(mutation.entityKey || '');
        const context = entityContextFor(key);
        const primaryField = String(context?.metadata?.primaryField || 'name');
        const fallback = String(
          record?.fullName ||
            record?.[primaryField] ||
            record?.name ||
            mutation.identity ||
            '(entry)',
        );
        return (
          window.ManatOS?.semanticChangePresentation?.entryDescriptor?.(key, record, 'id', {
            ownerWorkspaceState: true,
          }) || { label: fallback, icons: [], ownerWorkspaceState: true }
        );
      };
      external.innerHTML = [...groups.entries()]
        .map(([key, mutations]) => {
          const context = entityContextFor(key);
          const label = String(context?.metadata?.pluralLabel || context?.metadata?.label || key);
          const icon = String(context?.icon || context?.metadata?.icon || 'box').replace(
            /^bi-/,
            '',
          );
          const items = mutations
            .map((mutation) => {
              const persisted = mutation.identityKind === 'persistent';
              const descriptor = mutationDescriptor(mutation);
              const name = String(descriptor.label || mutation.identity || '(entry)');
              return `<div class="metadata-hierarchy-external-item" data-hierarchy-external-item="${esc(mutation.mutationId)}">
                <button type="button" class="btn btn-sm btn-light border metadata-hierarchy-external-entry${descriptor.ownerWorkspaceState === true ? ' fst-italic' : ''}" data-hierarchy-external-entry aria-expanded="false">
                  <i class="bi bi-${esc(icon)} me-1" aria-hidden="true"></i>${esc(name)}
                </button>
                <span class="metadata-hierarchy-external-menu shadow-sm border rounded bg-body" data-hierarchy-external-menu hidden>
                  <button type="button" class="dropdown-item" data-hierarchy-command="edit-external-entry" data-hierarchy-external-entity="${esc(key)}" data-hierarchy-external-identity="${esc(mutation.identity)}" data-hierarchy-external-identity-kind="${esc(mutation.identityKind)}"><i class="bi bi-pencil me-2" aria-hidden="true"></i>Edit</button>
                  <button type="button" class="dropdown-item text-danger" data-hierarchy-command="remove-external-entry" data-hierarchy-external-mutation="${esc(mutation.mutationId)}" data-hierarchy-external-entity="${esc(key)}" data-hierarchy-external-identity="${esc(mutation.identity)}"${persisted ? ' disabled aria-disabled="true" title="Existing external entries cannot be deleted from the Organization workspace."' : ''}><i class="bi bi-trash me-2" aria-hidden="true"></i>${persisted ? 'Delete' : 'Remove'}</button>
                </span>
              </div>`;
            })
            .join('');
          return `<div class="metadata-hierarchy-external-group" data-hierarchy-external-group="${esc(key)}">
            <button type="button" class="btn btn-sm btn-outline-secondary position-relative metadata-hierarchy-external-toggle" data-hierarchy-external-toggle aria-expanded="false"><i class="bi bi-${esc(icon)} me-1" aria-hidden="true"></i>${esc(label)} <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-secondary">${mutations.length}</span></button>
            <div class="metadata-hierarchy-external-panel border rounded shadow-sm bg-body p-2" data-hierarchy-external-panel hidden>${items}</div>
          </div>`;
        })
        .join('');
      component.append(external);
      external.querySelectorAll('[data-hierarchy-external-toggle]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const panel = button.parentElement?.querySelector('[data-hierarchy-external-panel]');
          if (!(panel instanceof HTMLElement)) return;
          const opening = panel.hidden;
          closeContainerInteractions(opening ? panel : null);
          panel.hidden = !opening;
          button.setAttribute('aria-expanded', String(opening));
        });
      });
      external
        .querySelectorAll('[data-hierarchy-external-entry]')
        .forEach((button) => bindContainerEntryMenu(button, '[data-hierarchy-external-menu]'));
      external.querySelectorAll('[data-hierarchy-command]').forEach((button) => {
        button.addEventListener('click', (event) => {
          if (button.disabled) return;
          event.preventDefault();
          event.stopPropagation();
          closeContainerInteractions();
          component.dispatchEvent(
            new CustomEvent('manatos:hierarchy-command', {
              bubbles: true,
              detail: {
                command: button.dataset.hierarchyCommand,
                entityKey: button.dataset.hierarchyExternalEntity || null,
                identity: button.dataset.hierarchyExternalIdentity || null,
                identityKind: button.dataset.hierarchyExternalIdentityKind || null,
                mutationId: button.dataset.hierarchyExternalMutation || null,
              },
            }),
          );
        });
      });
    }

    // Recycle-bin chrome is a projection of canonical workspace state. It owns no
    // deletion semantics: restore commands return to the typed Organization surface.
    if (workspaceMode && recycleRows.length) {
      const recycle = document.createElement('section');
      recycle.className = `metadata-hierarchy-recycle metadata-hierarchy-recycle-${state.mode}`;
      recycle.dataset.hierarchyRecycleBin = '';
      const items = recycleRows
        .map((row) => {
          const id = String(row?.[idField] ?? '');
          const label = String((row?.[labelField] ?? row?.name ?? id) || '(entry)');
          return `<div class="metadata-hierarchy-recycle-item" data-hierarchy-recycle-item="${esc(id)}">
            <button type="button" class="btn btn-sm btn-light border metadata-hierarchy-recycle-entry" data-hierarchy-recycle-entry aria-expanded="false">
              <i class="bi bi-person-dash me-1 text-danger" aria-hidden="true"></i>${esc(label)}${entryStateIndicator(row)}
            </button>
            <span class="metadata-hierarchy-recycle-menu shadow-sm border rounded bg-body" data-hierarchy-recycle-menu hidden>
              <button type="button" class="dropdown-item" data-hierarchy-command="restore-recycled" data-hierarchy-member-id="${esc(id)}">
                <i class="bi bi-arrow-counterclockwise me-2" aria-hidden="true"></i>Undo delete
              </button>
            </span>
          </div>`;
        })
        .join('');
      if (state.mode === 'chart') {
        recycle.innerHTML = `<button type="button" class="btn btn-sm btn-outline-danger position-relative metadata-hierarchy-recycle-toggle" data-hierarchy-recycle-toggle aria-expanded="false" title="Removed members">
          <i class="bi bi-trash3" aria-hidden="true"></i>
          <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">${recycleRows.length}</span>
        </button>
        <div class="metadata-hierarchy-recycle-panel border rounded shadow-sm bg-body p-2" data-hierarchy-recycle-panel hidden>
          <div class="small fw-semibold mb-2"><i class="bi bi-trash3 me-1" aria-hidden="true"></i>Recycle bin</div>${items}
        </div>`;
      } else {
        recycle.innerHTML = `<div class="metadata-hierarchy-recycle-root">
          <div class="fw-semibold small mb-1"><i class="bi bi-trash3 me-1 text-danger" aria-hidden="true"></i>Recycle Bin <span class="badge text-bg-secondary">${recycleRows.length}</span></div>
          <div class="metadata-hierarchy-recycle-items">${items}</div>
        </div>`;
      }
      component.append(recycle);

      recycle
        .querySelector('[data-hierarchy-recycle-toggle]')
        ?.addEventListener('click', (event) => {
          event.preventDefault();
          const panel = recycle.querySelector('[data-hierarchy-recycle-panel]');
          if (!(panel instanceof HTMLElement)) return;
          const opening = panel.hidden;
          closeContainerInteractions(opening ? panel : null);
          panel.hidden = !opening;
          event.currentTarget?.setAttribute?.('aria-expanded', String(opening));
        });
      recycle
        .querySelectorAll('[data-hierarchy-recycle-entry]')
        .forEach((button) => bindContainerEntryMenu(button, '[data-hierarchy-recycle-menu]'));
      recycle.querySelectorAll('[data-hierarchy-command="restore-recycled"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const panel = recycle.querySelector('[data-hierarchy-recycle-panel]');
          if (panel instanceof HTMLElement) panel.hidden = true;
          component.dispatchEvent(
            new CustomEvent('manatos:hierarchy-command', {
              bubbles: true,
              detail: {
                command: 'restore-recycled',
                memberId: button.dataset.hierarchyMemberId || null,
              },
            }),
          );
        });
      });
    }

    if (!rows.length || rootId == null || rootId === '') {
      empty.hidden = false;
      empty.querySelector('[data-hierarchy-empty-add]')?.addEventListener('click', (event) => {
        event.preventDefault();
        component.dispatchEvent(
          new CustomEvent('manatos:hierarchy-command', {
            bubbles: true,
            detail: { command: 'add-first' },
          }),
        );
      });
      return;
    }

    const byId = new Map(rows.map((row) => [String(row[idField]), row]));
    const roots = workspaceMode
      ? rows.filter(
          (row) =>
            row[parentField] == null ||
            String(row[parentField]) === '' ||
            !byId.has(String(row[parentField])),
        )
      : [byId.get(String(rootId))].filter(Boolean);
    if (!roots.length) {
      empty.hidden = false;
      return;
    }

    const metadata = entityMetadata(component.dataset.entityKey || '');
    const entityIcon = String(options.entityIcon || '').replace(/^bi-/, '');
    const entryResolver = window.ManatOS?.entryRepresentation;
    const entryOwnerPath = (row) => {
      if (!row || typeof row !== 'object') return null;
      const rowId = row?.[idField];
      if (
        currentIsRecord &&
        currentPath &&
        String(current?.[idField] ?? '') === String(rowId ?? '')
      ) {
        return currentPath;
      }
      if (!listPath) return null;
      if (Array.isArray(list)) {
        const index = list.findIndex(
          (candidate) =>
            candidate &&
            typeof candidate === 'object' &&
            String(candidate?.[idField] ?? '') === String(rowId ?? ''),
        );
        return index >= 0 ? `${listPath}[${index}]` : null;
      }
      if (list && typeof list === 'object') {
        const key = Object.keys(list).find(
          (candidateKey) =>
            list[candidateKey] &&
            typeof list[candidateKey] === 'object' &&
            String(list[candidateKey]?.[idField] ?? '') === String(rowId ?? ''),
        );
        return key ? `${listPath}[${JSON.stringify(key)}]` : null;
      }
      return null;
    };
    const resolveEntry = (row) =>
      entryResolver?.resolve
        ? entryResolver.resolve(entryRepresentation, row, {
            metadata,
            entityIcon,
            fallbackName: row?.[labelField] ?? '',
            ownerPath: entryOwnerPath(row),
          })
        : {
            name: String(row?.[labelField] ?? ''),
            typeValue: typeField ? row?.[typeField] : null,
            typeIcon: null,
            typeField,
            icons: entityIcon ? [entityIcon] : [],
            iconConfig: entryRepresentation.icon || {},
          };

    const children = new Map();
    for (const row of rows) {
      const parent = row[parentField];
      if (parent == null || parent === '') continue;
      const key = String(parent);
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(row);
    }
    for (const siblings of children.values()) {
      siblings.sort((left, right) =>
        resolveEntry(left).name.localeCompare(resolveEntry(right).name, undefined, {
          sensitivity: 'base',
        }),
      );
    }

    const icons = iconMapFor(component, options);
    const sampleRepresentation = rows.length ? resolveEntry(rows[0]) : null;
    const runtimeTypeField = String(sampleRepresentation?.typeField || typeField || '');
    const typeItems = runtimeTypeField
      ? window.ManatOS?.enumItemsForField?.(metadata?.fieldDefinition?.[runtimeTypeField]) || []
      : [];
    const typeItemByValue = new Map(typeItems.map((item) => [String(item.value), item]));
    const canHaveParentTrait = String(options.canHaveParentTrait || '');
    const containerTrait = String(options.containerTrait || '');

    const relationshipEligibility = window.ManatOS?.hierarchyRelationshipEligibility;
    const relationshipOptions = {
      identityField: idField,
      parentField,
      typeField: runtimeTypeField || undefined,
      containerTrait: containerTrait || undefined,
      canHaveParentTrait: canHaveParentTrait || undefined,
      rootEligibleTrait: String(options.rootEligibleTrait || '') || undefined,
      standAloneEligibleTrait: String(options.standAloneEligibleTrait || '') || undefined,
      typeOptions: typeItems,
      resolveName: (row) => resolveEntry(row).name || '',
    };

    /** Validate drag/drop through the canonical typed relationship policy. */
    const validateDrop = (sourceId, targetId) => {
      const source = byId.get(String(sourceId || ''));
      const target = byId.get(String(targetId || ''));
      if (typeof relationshipEligibility !== 'function')
        return { valid: false, reason: 'Hierarchy relationship policy is unavailable.' };
      const result = relationshipEligibility(relationshipOptions, rows, source, target, 'parent');
      return { valid: result.eligible, reason: result.reason || '' };
    };

    const entryIcon =
      entryRepresentation.icon && typeof entryRepresentation.icon === 'object'
        ? entryRepresentation.icon
        : {};
    const iconMode = String(entryIcon.mode || (runtimeTypeField ? 'composed' : 'entity'));
    const seen = new Set();

    const renderNode = (row) => {
      const id = String(row[idField] ?? '');
      if (!id || seen.has(id)) return '';
      seen.add(id);
      const childRows = children.get(id) || [];
      const representation = resolveEntry(row);
      const typeValue = String(representation.typeValue ?? '');
      const typeItemForRow = typeItemByValue.get(typeValue) || null;
      const typeIcon = String(
        representation.typeIcon || typeItemForRow?.icon || icons.get(typeValue) || '',
      ).replace(/^bi-/, '');
      const rawLabel = String(representation.name || '').trim();
      const label = rawLabel || '(New)';
      const hasNodeValue = rawLabel.length > 0;
      const isCurrent = currentId != null && String(currentId) === id;
      // The quick-entry popup is owned by the workspace. Opening it must not
      // change the committed tree model or suppress/reflow any existing node.
      const showNodeCommands = workspaceMode && hasNodeValue;
      const hasParent = row[parentField] != null && String(row[parentField]) !== '';
      const typeItem = typeItemForRow;
      const canAddParent =
        showNodeCommands &&
        !hasParent &&
        (!canHaveParentTrait || typeItem?.[canHaveParentTrait] === true);
      const canAddChild =
        showNodeCommands && (!containerTrait || typeItem?.[containerTrait] === true);
      const parentRow = hasParent ? byId.get(String(row[parentField])) : null;
      const tooltipParts = [label];
      if (typeValue) tooltipParts.push(typeValue);
      if (parentRow)
        tooltipParts.push(
          `Parent: ${resolveEntry(parentRow).name || String(parentRow?.[idField] ?? '')}`,
        );
      tooltipParts.push(`Id: ${id}`);
      const entryState = entryStateFor(row);
      const persistedEntry = entryState.persisted;
      if (persistedEntry) tooltipParts.push('Persisted entry');
      const tooltip = tooltipParts.join(' · ');
      const childId = `hierarchy-children-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const expanded = !state.collapsed.has(id);
      const relationCandidateLegal = (candidate, relation) => {
        if (typeof relationshipEligibility !== 'function') return false;
        return relationshipEligibility(relationshipOptions, rows, row, candidate, relation)
          .eligible;
      };
      const existingNodeChoices =
        rows
          .filter((candidate) => String(candidate?.[idField] ?? '') !== id)
          .map((candidate) => {
            const candidateId = String(candidate?.[idField] ?? '');
            const candidateRepresentation = resolveEntry(candidate);
            const candidateName = String(candidateRepresentation.name || candidateId);
            const candidateTypeValue = String(candidateRepresentation.typeValue ?? '');
            const candidateTypeItem = typeItemByValue.get(candidateTypeValue) || null;
            const candidateTypeIcon = String(
              candidateRepresentation.typeIcon ||
                candidateTypeItem?.icon ||
                icons.get(candidateTypeValue) ||
                '',
            ).replace(/^bi-/, '');
            const candidateIconHtml =
              iconMode === 'composed' && entityIcon && candidateTypeIcon
                ? `<span class="metadata-entry-icons me-2" aria-hidden="true"><i class="bi bi-${esc(entityIcon)} metadata-entry-icon metadata-entry-icon-0"></i><i class="bi bi-${esc(candidateTypeIcon)} metadata-entry-icon metadata-entry-icon-1"></i></span>`
                : `<i class="bi bi-${esc(candidateTypeIcon || entityIcon || 'circle')} me-2" aria-hidden="true"></i>`;
            return `<button type="button" class="dropdown-item d-flex align-items-center" data-hierarchy-existing-node data-hierarchy-command="use-existing-sibling" data-hierarchy-member-id="${esc(id)}" data-hierarchy-candidate-id="${esc(candidateId)}" data-legal-parent="${relationCandidateLegal(candidate, 'parent')}" data-legal-sibling="${relationCandidateLegal(candidate, 'sibling')}" data-legal-child="${relationCandidateLegal(candidate, 'child')}">${candidateIconHtml}<span class="text-truncate">${esc(candidateName)}</span></button>`;
          })
          .join('') +
        '<span class="dropdown-item-text text-secondary small" data-hierarchy-no-existing-node hidden>No eligible nodes</span>';
      const addMenu = showNodeCommands
        ? `
        <span class="metadata-hierarchy-node-remove-menu metadata-hierarchy-node-add-menu" data-hierarchy-add-menu data-hierarchy-menu-for="${esc(id)}" hidden>
          ${canAddParent ? `<button type="button" class="dropdown-item" data-hierarchy-add-relation="parent" data-hierarchy-command="add-parent" data-hierarchy-member-id="${esc(id)}"><i class="bi bi-arrow-up me-2" aria-hidden="true"></i>Add parent</button>` : ''}
          ${hasParent ? `<button type="button" class="dropdown-item" data-hierarchy-add-relation="sibling" data-hierarchy-command="add-sibling" data-hierarchy-member-id="${esc(id)}"><i class="bi bi-arrow-left-right me-2" aria-hidden="true"></i>Add sibling</button>` : ''}
          ${canAddChild ? `<button type="button" class="dropdown-item" data-hierarchy-add-relation="child" data-hierarchy-command="add-child" data-hierarchy-member-id="${esc(id)}"><i class="bi bi-arrow-down me-2" aria-hidden="true"></i>Add child</button>` : ''}
          <hr class="dropdown-divider metadata-hierarchy-add-primary-divider">
          <span class="metadata-hierarchy-existing-node-submenu">
            <button type="button" class="dropdown-item d-flex align-items-center" data-hierarchy-existing-node-toggle><i class="bi bi-diagram-3 me-2" aria-hidden="true"></i>Add existing node<i class="bi bi-chevron-right ms-auto" aria-hidden="true"></i></button>
            <span class="metadata-hierarchy-existing-node-menu">${existingNodeChoices}</span>
          </span>
          <hr class="dropdown-divider">
          <button type="button" class="dropdown-item" data-hierarchy-command="choose-existing-entry" data-hierarchy-member-id="${esc(id)}"><i class="bi bi-database me-2" aria-hidden="true"></i>Add existing entry…</button>
        </span>`
        : '';

      const layoutToken = id.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'member';
      const layoutBase = `hierarchy-member-${layoutToken}`;
      return `
        <li class="metadata-hierarchy-node${isCurrent ? ' is-current' : ''}" data-hierarchy-node-id="${esc(id)}" data-hierarchy-node-label="${esc(label)}" data-v2-layout-component-instance="${esc(layoutBase)}">
          <div class="metadata-hierarchy-node-row">
            ${childRows.length ? `<button class="metadata-hierarchy-toggle" type="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(childId)}" title="Collapse/expand"><i class="bi bi-chevron-${expanded ? 'down' : 'right'}" aria-hidden="true"></i></button>` : '<span class="metadata-hierarchy-toggle-spacer" aria-hidden="true"></span>'}
            <span class="metadata-hierarchy-node-shell">
              ${showNodeCommands ? `<button type="button" class="metadata-hierarchy-node-command metadata-hierarchy-node-delete btn btn-danger btn-sm" data-hierarchy-remove-toggle title="Node actions" aria-label="Node actions for ${esc(label)}" aria-expanded="false"><i class="bi bi-x-lg" aria-hidden="true"></i></button><span class="metadata-hierarchy-node-remove-menu" data-hierarchy-remove-menu data-hierarchy-menu-for="${esc(id)}" hidden><button type="button" class="dropdown-item text-danger" data-hierarchy-command="delete" data-hierarchy-member-id="${esc(id)}"${originalMemberId && id === originalMemberId ? ' disabled aria-disabled="true" title="The original Organization member cannot be removed."' : ''}><i class="bi bi-trash me-2" aria-hidden="true"></i>Remove</button><hr class="dropdown-divider"><button type="button" class="dropdown-item" data-hierarchy-command="clear-parent" data-hierarchy-member-id="${esc(id)}"${hasParent ? '' : ' disabled aria-disabled="true"'}><i class="bi bi-diagram-2 me-2" aria-hidden="true"></i>Clear parent (detach)</button></span>${canAddParent ? '<button type="button" class="metadata-hierarchy-node-command metadata-hierarchy-node-parent btn btn-primary btn-sm" data-hierarchy-add-toggle data-hierarchy-add-relation="parent" title="Add parent" aria-label="Add parent" aria-expanded="false"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>' : ''}` : ''}
              ${workspaceMode ? `<button type="button" class="metadata-hierarchy-node-link metadata-hierarchy-node-workspace" data-hierarchy-open-member draggable="true" title="${esc(tooltip)}">` : `<button type="button" class="metadata-hierarchy-node-link metadata-hierarchy-node-informational" data-hierarchy-view-member title="${esc(tooltip)}">`}
                ${iconMode === 'composed' && entityIcon && typeIcon ? `<span class="metadata-hierarchy-node-icons" aria-hidden="true" style="--entry-entity-scale:${Number(entryIcon.entityScale || 0.72)};--entry-type-scale:${Number(entryIcon.typeScale || 1.15)}"><i class="bi bi-${esc(entityIcon)} metadata-hierarchy-node-entity-icon"></i><i class="bi bi-${esc(typeIcon)} metadata-hierarchy-node-type-icon"></i></span>` : iconMode === 'type' && typeIcon ? `<i class="bi bi-${esc(typeIcon)}" aria-hidden="true"></i>` : `<i class="bi bi-${esc(entityIcon || typeIcon || 'circle')}" aria-hidden="true"></i>`}
                <span>${esc(label)}</span>
                ${workspaceMode ? entryStateIndicator(row) : ''}
              ${workspaceMode ? '</button>' : '</button>'}
              ${showNodeCommands ? `<button type="button" class="metadata-hierarchy-node-command metadata-hierarchy-node-sibling btn btn-primary btn-sm" data-hierarchy-add-toggle data-hierarchy-add-relation="sibling" title="Add sibling" aria-label="Add sibling" aria-expanded="false"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>${canAddChild ? '<button type="button" class="metadata-hierarchy-node-command metadata-hierarchy-node-child btn btn-primary btn-sm" data-hierarchy-add-toggle data-hierarchy-add-relation="child" title="Add child" aria-label="Add child" aria-expanded="false"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>' : ''}${addMenu}` : ''}
            </span>
          </div>
          ${childRows.length ? `<ul class="metadata-hierarchy-children" id="${esc(childId)}"${expanded ? '' : ' hidden'}>${childRows.map(renderNode).join('')}</ul>` : ''}
        </li>`;
    };

    document.body
      .querySelectorAll('[data-hierarchy-portal="true"]')
      .forEach((menu) => menu.remove());
    content.innerHTML = `<ul class="metadata-hierarchy-root">${roots.map(renderNode).join('')}</ul>`;
    empty.hidden = true;

    if (workspaceMode) {
      const closeNodeMenus = () => {
        document
          .querySelectorAll('[data-hierarchy-remove-menu], [data-hierarchy-add-menu]')
          .forEach((candidate) => {
            candidate.hidden = true;
          });
        content
          .querySelectorAll('[data-hierarchy-remove-toggle], [data-hierarchy-add-toggle]')
          .forEach((candidate) => candidate.setAttribute('aria-expanded', 'false'));
      };

      const positionNodeMenu = (button, menu) => {
        if (!(button instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
        if (menu.parentElement !== document.body) {
          menu.dataset.hierarchyPortal = 'true';
          menu.dataset.manatosTransientUi = 'menu';
          document.body.appendChild(menu);
        }
        menu.hidden = false;
        menu.style.position = 'fixed';
        const anchor = button.getBoundingClientRect();
        const width = Math.max(168, menu.getBoundingClientRect().width || 168);
        const height = Math.max(72, menu.getBoundingClientRect().height || 72);
        const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left));
        const preferredTop = anchor.bottom + 5;
        const top =
          preferredTop + height <= window.innerHeight - 8
            ? preferredTop
            : Math.max(8, anchor.top - height - 5);
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
      };

      content.querySelectorAll('[data-hierarchy-remove-toggle]').forEach((button) => {
        const shell = button.closest('.metadata-hierarchy-node-shell');
        const menu = shell?.querySelector('[data-hierarchy-remove-menu]');
        if (!(menu instanceof HTMLElement)) return;
        menu.addEventListener('click', (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const willOpen = menu.hidden;
          closeNodeMenus();
          if (willOpen) {
            positionNodeMenu(button, menu);
            button.setAttribute('aria-expanded', 'true');
            setTimeout(() => document.addEventListener('click', closeNodeMenus, { once: true }), 0);
          }
        });
      });

      content.querySelectorAll('[data-hierarchy-add-toggle]').forEach((button) => {
        const shell = button.closest('.metadata-hierarchy-node-shell');
        const menu = shell?.querySelector('[data-hierarchy-add-menu]');
        if (!(menu instanceof HTMLElement)) return;
        menu.addEventListener('click', (event) => event.stopPropagation());
        const openExistingMenu = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const willOpen = menu.hidden;
          closeNodeMenus();
          if (willOpen) {
            const relation = button.dataset.hierarchyAddRelation || 'sibling';
            menu.dataset.hierarchyActiveRelation = relation;
            menu.querySelectorAll('[data-hierarchy-add-relation]').forEach((item) => {
              item.hidden = item.dataset.hierarchyAddRelation !== relation;
            });
            let eligibleExistingNodes = 0;
            menu.querySelectorAll('[data-hierarchy-existing-node]').forEach((item) => {
              item.dataset.hierarchyCommand = `use-existing-${relation}`;
              const legal =
                item.dataset[`legal${relation.charAt(0).toUpperCase()}${relation.slice(1)}`] ===
                'true';
              item.hidden = !legal;
              if (legal) eligibleExistingNodes += 1;
            });
            const noExistingNodes = menu.querySelector('[data-hierarchy-no-existing-node]');
            if (noExistingNodes instanceof HTMLElement)
              noExistingNodes.hidden = eligibleExistingNodes > 0;
            const existingEntry = menu.querySelector(
              '[data-hierarchy-command="choose-existing-entry"]',
            );
            if (existingEntry instanceof HTMLElement)
              existingEntry.dataset.hierarchyRelation = relation;
            positionNodeMenu(button, menu);
            button.setAttribute('aria-expanded', 'true');
            setTimeout(() => document.addEventListener('click', closeNodeMenus, { once: true }), 0);
          }
        };
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeNodeMenus();
          const node = button.closest('[data-hierarchy-node-id]');
          component.dispatchEvent(
            new CustomEvent('manatos:hierarchy-command', {
              bubbles: true,
              detail: {
                command: `add-${button.dataset.hierarchyAddRelation || 'sibling'}`,
                memberId: node?.dataset?.hierarchyNodeId || null,
              },
            }),
          );
        });
        // Existing-node/entry placement remains a separate explicit secondary action.
        // Context-menu on the same relation affordance opens those choices without
        // intercepting the primary create-new action.
        button.addEventListener('contextmenu', openExistingMenu);
      });

      content.querySelectorAll('[data-hierarchy-command]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button instanceof HTMLButtonElement && button.disabled) return;
          const node = button.closest('[data-hierarchy-node-id]');
          const memberId =
            button.dataset.hierarchyMemberId || node?.dataset?.hierarchyNodeId || null;
          closeNodeMenus();
          component.dispatchEvent(
            new CustomEvent('manatos:hierarchy-command', {
              bubbles: true,
              detail: {
                command: button.dataset.hierarchyCommand,
                memberId,
                candidateId: button.dataset.hierarchyCandidateId || null,
                relation: button.dataset.hierarchyRelation || null,
              },
            }),
          );
        });
      });
    }

    if (!workspaceMode) {
      content.querySelectorAll('[data-hierarchy-view-member]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const node = button.closest('[data-hierarchy-node-id]');
          const memberId = node?.dataset?.hierarchyNodeId || '';
          const entityKey = component.dataset.entityKey || '';
          const entryOpening = window.ManatOS?.entryOpening;
          /*
           * Hosted entry documents delegate ManatOS.popup.entry.open() to their
           * owning window. Therefore the same generic node action works for a
           * page or any nested popup level; no entity or nesting-depth branch is
           * needed here.
           */
          if (!memberId || memberId.startsWith('draft:') || !entityKey || !entryOpening?.open)
            return;
          entryOpening.open({
            host: 'popup',
            target: { entityKey, recordId: memberId },
            title: node?.dataset?.hierarchyNodeLabel || 'View entry',
            mode: 'view',
            purpose: 'view',
            presentation: { layout: 'entry' },
          });
        });
      });
    }

    if (workspaceMode) {
      let draggedId = null;
      let dragWasActive = false;
      const clearDropTargets = () =>
        content.querySelectorAll('.is-drop-target, .is-drop-invalid').forEach((node) => {
          node.classList.remove('is-drop-target', 'is-drop-invalid');
          node.querySelector('[data-hierarchy-open-member]')?.removeAttribute('data-drop-hint');
        });

      content.querySelectorAll('[data-hierarchy-open-member]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          // HTML drag/drop can emit a click when the pointer is released. Do not
          // open the full record editor after a successful/attempted node move.
          if (dragWasActive) {
            dragWasActive = false;
            return;
          }
          const node = button.closest('[data-hierarchy-node-id]');
          component.dispatchEvent(
            new CustomEvent('manatos:hierarchy-command', {
              bubbles: true,
              detail: { command: 'open', memberId: node?.dataset?.hierarchyNodeId || null },
            }),
          );
        });

        button.addEventListener('dragstart', (event) => {
          const node = button.closest('[data-hierarchy-node-id]');
          draggedId = node?.dataset?.hierarchyNodeId || null;
          if (!draggedId || !event.dataTransfer) {
            event.preventDefault();
            return;
          }
          dragWasActive = true;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', draggedId);
          node?.classList.add('is-dragging');
        });

        button.addEventListener('dragend', () => {
          draggedId = null;
          clearDropTargets();
          content
            .querySelectorAll('.is-dragging')
            .forEach((node) => node.classList.remove('is-dragging'));
          // Keep the click suppression through this event turn only.
          setTimeout(() => {
            dragWasActive = false;
          }, 0);
        });

        button.addEventListener('dragover', (event) => {
          const node = button.closest('[data-hierarchy-node-id]');
          const targetId = node?.dataset?.hierarchyNodeId || null;
          if (!draggedId || !targetId || draggedId === targetId) return;
          clearDropTargets();
          const targetButton = node?.querySelector('[data-hierarchy-open-member]');
          const targetLabel = node?.dataset?.hierarchyNodeLabel || 'target';
          const validation = validateDrop(draggedId, targetId);
          if (!validation.valid) {
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
            node?.classList.add('is-drop-invalid');
            if (targetButton instanceof HTMLElement)
              targetButton.dataset.dropHint =
                validation.reason || `Cannot make child of ${targetLabel}`;
            return;
          }
          // preventDefault is intentionally valid-target-only. Invalid targets
          // therefore cannot produce a browser drop event or hierarchy command.
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          node?.classList.add('is-drop-target');
          if (targetButton instanceof HTMLElement)
            targetButton.dataset.dropHint = `Make child of ${targetLabel}`;
        });

        button.addEventListener('dragleave', (event) => {
          const node = button.closest('[data-hierarchy-node-id]');
          if (!(node instanceof HTMLElement)) return;
          const related = event.relatedTarget;
          if (!(related instanceof Node) || !node.contains(related))
            node.classList.remove('is-drop-target');
        });

        button.addEventListener('drop', (event) => {
          const node = button.closest('[data-hierarchy-node-id]');
          const targetId = node?.dataset?.hierarchyNodeId || null;
          const sourceId = draggedId || event.dataTransfer?.getData('text/plain') || null;
          clearDropTargets();
          if (!sourceId || !targetId || !validateDrop(sourceId, targetId).valid) return;
          event.preventDefault();
          event.stopPropagation();
          component.dispatchEvent(
            new CustomEvent('manatos:hierarchy-command', {
              bubbles: true,
              detail: { command: 'move', memberId: sourceId, targetId },
            }),
          );
        });
      });
    }

    content.querySelectorAll('.metadata-hierarchy-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const node = button.closest('[data-hierarchy-node-id]');
        const id = node?.dataset?.hierarchyNodeId;
        const childrenElement = document.getElementById(button.getAttribute('aria-controls') || '');
        if (!id || !(childrenElement instanceof HTMLElement)) return;
        const expanded = button.getAttribute('aria-expanded') !== 'false';
        button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        childrenElement.hidden = expanded;
        if (expanded) state.collapsed.add(id);
        else state.collapsed.delete(id);
        const icon = button.querySelector('i');
        if (icon instanceof HTMLElement)
          icon.className = `bi bi-chevron-${expanded ? 'right' : 'down'}`;
      });
    });
  };

  let scheduled = false;
  const scheduledComponents = new Set();
  const scheduleRedraw = (targets = components) => {
    targets.forEach((component) => scheduledComponents.add(component));
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const targetsToDraw = [...scheduledComponents];
      scheduledComponents.clear();
      targetsToDraw.forEach(buildTree);
    });
  };

  // CTX is the sole live data source. Subscribe each component to the resolved
  // CTX resources declared by metadata; unrelated page events do not redraw it.
  runtime.trackSubscriber?.('*', { kind: 'hierarchy', label: 'Hierarchy tree' });
  window.addEventListener(runtime.eventName || 'manatos:ctx-change', (event) => {
    const changedPaths = [
      event?.detail?.path,
      ...(Array.isArray(event?.detail?.relatedPaths) ? event.detail.relatedPaths : []),
    ].filter((path) => typeof path === 'string' && path);
    if (!changedPaths.length) return;

    const affected = components.filter((component) => {
      const dependencies = resolvedDependencyPaths(component);
      return dependencies.some((dependency) =>
        changedPaths.some((changed) => pathsOverlap(dependency, changed)),
      );
    });
    if (affected.length) scheduleRedraw(affected);
  });

  document.addEventListener('shown.bs.tab', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const selector = target.getAttribute('data-bs-target');
    if (!selector) return;
    const pane = document.querySelector(selector);
    const targets = pane
      ? [...pane.querySelectorAll('[data-metadata-component="hierarchy-tree"]')]
      : [];
    if (targets.length) scheduleRedraw(targets);
  });

  const entryRepresentationResolver = window.ManatOS?.entryRepresentation;
  if (entryRepresentationResolver?.prepare) {
    await Promise.all(
      components.map((component) =>
        entryRepresentationResolver.prepare(optionsFor(component).entryRepresentation || {}),
      ),
    );
  }

  scheduleRedraw();
})();
