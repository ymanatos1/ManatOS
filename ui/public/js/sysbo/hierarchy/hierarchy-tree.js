(() => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  if (!runtime?.resolve) return;

  const components = [...document.querySelectorAll('[data-metadata-component="hierarchy-tree"]')];
  if (!components.length) return;

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

  const entityMetadata = (entityKey) => {
    const entities = runtime.value?.entities;
    if (!entities || typeof entities !== 'object') return null;
    return (
      Object.values(entities).find((candidate) => candidate?.key === entityKey)?.metadata ?? null
    );
  };

  const iconMapFor = (component, options) => {
    const typeField = String(options.typeField || '');
    if (!typeField) return new Map();
    const metadata = entityMetadata(component.dataset.entityKey || '');
    const items = metadata?.fieldDefinition?.[typeField]?.enumItems;
    return new Map(
      Array.isArray(items) ? items.map((item) => [String(item.value), item.icon || 'circle']) : [],
    );
  };

  const leafPagePath = () => {
    if (!runtime?.value?.page) return null;
    let node = runtime.value.page;
    let path = 'ctx.page';
    while (node?.page) {
      node = node.page;
      path += '.page';
    }
    return path;
  };

  const resolvedDependencyPaths = (component) => {
    const options = optionsFor(component);
    const scopePath = leafPagePath() ?? undefined;
    const dataSource = String(options.dataSource || 'entries');
    const currentSource = String(options.currentSource || 'entry');
    const focusSource = String(options.focusSource || '');
    return [dataSource, currentSource, focusSource]
      .filter(Boolean)
      .map((path) => runtime.resolvePath?.(path, scopePath))
      .filter((path) => typeof path === 'string' && path);
  };

  const pathsOverlap = (left, right) => {
    if (left === right) return true;
    const childOf = (candidate, parent) =>
      candidate.startsWith(`${parent}.`) || candidate.startsWith(`${parent}[`);
    return childOf(left, right) || childOf(right, left);
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
    const dataSource = String(options.dataSource || 'entries');
    const currentSource = String(options.currentSource || 'entry');
    const focusSource = String(options.focusSource || '');
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

    const list = runtime.resolve(dataSource);
    const current = runtime.resolve(currentSource);
    const editingId = workspaceMode ? String(component.dataset.hierarchyEditingId || '') : '';
    const rows = projectedRows(list, current, idField).filter(
      (row) => !editingId || String(row?.[idField] ?? '') !== editingId,
    );
    const currentIsRecord =
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      Object.prototype.hasOwnProperty.call(current, idField);
    const focusedValue = focusSource ? runtime.resolve(focusSource) : null;
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

    if (!rows.length || rootId == null || rootId === '') {
      empty.hidden = false;
      empty.querySelector('[data-hierarchy-empty-add]')?.addEventListener('click', () => {
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
    const resolveEntry = (row) =>
      entryResolver?.resolve
        ? entryResolver.resolve(entryRepresentation, row, {
            metadata,
            entityIcon,
            fallbackName: row?.[labelField] ?? '',
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
    const typeItems =
      runtimeTypeField && Array.isArray(metadata?.fieldDefinition?.[runtimeTypeField]?.enumItems)
        ? metadata.fieldDefinition[runtimeTypeField].enumItems
        : [];
    const typeItemByValue = new Map(typeItems.map((item) => [String(item.value), item]));
    const canHaveParentTrait = String(options.canHaveParentTrait || '');
    const containerTrait = String(options.containerTrait || '');

    /**
     * Validate a drag target before the browser is allowed to perform a drop.
     * The visualizer owns only interaction semantics here: all eligibility comes
     * from canonical enum traits and the metadata-declared parent relationship.
     */
    const validateDrop = (sourceId, targetId) => {
      const source = byId.get(String(sourceId || ''));
      const target = byId.get(String(targetId || ''));
      if (!source || !target || String(sourceId) === String(targetId))
        return { valid: false, reason: 'Invalid hierarchy target.' };
      if (String(source?.[parentField] ?? '') === String(targetId)) {
        return {
          valid: false,
          reason: `${resolveEntry(source).name || 'This entry'} is already a child of ${resolveEntry(target).name || 'this entry'}.`,
        };
      }

      const sourceType = String(resolveEntry(source).typeValue ?? '');
      const sourceOption = typeItemByValue.get(sourceType) || null;
      if (canHaveParentTrait && sourceOption?.[canHaveParentTrait] !== true)
        return { valid: false };

      const targetType = String(resolveEntry(target).typeValue ?? '');
      const targetOption = typeItemByValue.get(targetType) || null;
      if (containerTrait && targetOption?.[containerTrait] !== true) return { valid: false };

      // A source cannot be reparented below itself or any of its descendants.
      let cursor = target;
      const visited = new Set();
      while (cursor) {
        const cursorId = String(cursor?.[idField] ?? '');
        if (!cursorId || visited.has(cursorId)) break;
        if (cursorId === String(sourceId)) return { valid: false };
        visited.add(cursorId);
        const parentId = cursor?.[parentField];
        if (parentId == null || String(parentId) === '') break;
        cursor = byId.get(String(parentId));
      }
      return { valid: true };
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
      // recordQuick is an overlay owned by the workspace. Opening it must not
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
      const persistedEntry = !id.startsWith('draft:');
      if (persistedEntry) tooltipParts.push('Persisted entry');
      const tooltip = tooltipParts.join(' · ');
      const childId = `hierarchy-children-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const expanded = !state.collapsed.has(id);
      const isAncestorOf = (possibleAncestorId, descendantId) => {
        let cursor = byId.get(String(descendantId || ''));
        const visited = new Set();
        while (cursor) {
          const cursorId = String(cursor?.[idField] ?? '');
          if (!cursorId || visited.has(cursorId)) break;
          if (cursorId === String(possibleAncestorId)) return true;
          visited.add(cursorId);
          const nextParentId = cursor?.[parentField];
          if (nextParentId == null || String(nextParentId) === '') break;
          cursor = byId.get(String(nextParentId));
        }
        return false;
      };
      const relationCandidateLegal = (candidate, relation) => {
        const candidateId = String(candidate?.[idField] ?? '');
        if (!candidateId || candidateId === id) return false;
        const candidateRepresentation = resolveEntry(candidate);
        const candidateType = String(candidateRepresentation.typeValue ?? '');
        const candidateOption = typeItemByValue.get(candidateType) || null;
        const candidateCanHaveParent =
          !canHaveParentTrait || candidateOption?.[canHaveParentTrait] === true;
        const candidateCanContain = !containerTrait || candidateOption?.[containerTrait] === true;
        const currentCanHaveParent = !canHaveParentTrait || typeItem?.[canHaveParentTrait] === true;

        if (relation === 'parent') {
          if (String(row?.[parentField] ?? '') === candidateId) return false;
          if (!currentCanHaveParent || !candidateCanContain) return false;
          return !isAncestorOf(id, candidateId);
        }
        if (relation === 'child') {
          if (String(candidate?.[parentField] ?? '') === id) return false;
          if (!canAddChild || !candidateCanHaveParent) return false;
          return !isAncestorOf(candidateId, id);
        }
        const nextParentId = row[parentField];
        if (nextParentId != null && String(nextParentId) !== '' && !candidateCanHaveParent)
          return false;
        if (String(candidate?.[parentField] ?? '') === String(nextParentId ?? '')) return false;
        return (
          nextParentId == null ||
          String(nextParentId) === '' ||
          !isAncestorOf(candidateId, String(nextParentId))
        );
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
          <button type="button" class="dropdown-item" data-hierarchy-add-relation="sibling" data-hierarchy-command="add-sibling" data-hierarchy-member-id="${esc(id)}"><i class="bi bi-arrow-left-right me-2" aria-hidden="true"></i>Add sibling</button>
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

      return `
        <li class="metadata-hierarchy-node${isCurrent ? ' is-current' : ''}" data-hierarchy-node-id="${esc(id)}" data-hierarchy-node-label="${esc(label)}">
          <div class="metadata-hierarchy-node-row">
            ${childRows.length ? `<button class="metadata-hierarchy-toggle" type="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(childId)}" title="Collapse/expand"><i class="bi bi-chevron-${expanded ? 'down' : 'right'}" aria-hidden="true"></i></button>` : '<span class="metadata-hierarchy-toggle-spacer" aria-hidden="true"></span>'}
            <span class="metadata-hierarchy-node-shell">
              ${showNodeCommands ? `<button type="button" class="metadata-hierarchy-node-command metadata-hierarchy-node-delete btn btn-danger btn-sm" data-hierarchy-remove-toggle title="Node actions" aria-label="Node actions for ${esc(label)}" aria-expanded="false"><i class="bi bi-x-lg" aria-hidden="true"></i></button><span class="metadata-hierarchy-node-remove-menu" data-hierarchy-remove-menu data-hierarchy-menu-for="${esc(id)}" hidden><button type="button" class="dropdown-item text-danger" data-hierarchy-command="delete" data-hierarchy-member-id="${esc(id)}"><i class="bi bi-trash me-2" aria-hidden="true"></i>Remove</button><hr class="dropdown-divider"><button type="button" class="dropdown-item" data-hierarchy-command="clear-parent" data-hierarchy-member-id="${esc(id)}"${hasParent ? '' : ' disabled aria-disabled="true"'}><i class="bi bi-diagram-2 me-2" aria-hidden="true"></i>Clear parent (detach)</button></span>${canAddParent ? '<button type="button" class="metadata-hierarchy-node-command metadata-hierarchy-node-parent btn btn-primary btn-sm" data-hierarchy-add-toggle data-hierarchy-add-relation="parent" title="Add parent" aria-label="Add parent" aria-expanded="false"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>' : ''}` : ''}
              ${workspaceMode ? `<button type="button" class="metadata-hierarchy-node-link metadata-hierarchy-node-workspace" data-hierarchy-open-member draggable="true" title="${esc(tooltip)}">` : `<span class="metadata-hierarchy-node-link metadata-hierarchy-node-informational" title="${esc(tooltip)}">`}
                ${iconMode === 'composed' && entityIcon && typeIcon ? `<span class="metadata-hierarchy-node-icons" aria-hidden="true" style="--entry-entity-scale:${Number(entryIcon.entityScale || 0.72)};--entry-type-scale:${Number(entryIcon.typeScale || 1.15)}"><i class="bi bi-${esc(entityIcon)} metadata-hierarchy-node-entity-icon"></i><i class="bi bi-${esc(typeIcon)} metadata-hierarchy-node-type-icon"></i></span>` : iconMode === 'type' && typeIcon ? `<i class="bi bi-${esc(typeIcon)}" aria-hidden="true"></i>` : `<i class="bi bi-${esc(entityIcon || typeIcon || 'circle')}" aria-hidden="true"></i>`}
                <span>${esc(label)}</span>
                ${workspaceMode && persistedEntry ? '<span class="metadata-hierarchy-node-persistence" title="This entry already exists in application storage/database." aria-label="This entry already exists in application storage/database."><i class="bi bi-database-check" aria-hidden="true"></i></span>' : ''}
              ${workspaceMode ? '</button>' : '</span>'}
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
        button.addEventListener('click', (event) => {
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
        });
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

  scheduleRedraw();
})();
