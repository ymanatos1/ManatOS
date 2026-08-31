(() => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  if (!runtime?.resolve) return;

  const components = [...document.querySelectorAll('[data-metadata-component="hierarchy-tree"]')];
  if (!components.length) return;

  const componentState = new WeakMap();

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

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
    return Object.values(entities).find((candidate) => candidate?.key === entityKey)?.metadata ?? null;
  };

  const iconMapFor = (component, options) => {
    const typeField = String(options.typeField || '');
    if (!typeField) return new Map();
    const metadata = entityMetadata(component.dataset.entityKey || '');
    const items = metadata?.fieldDefinition?.[typeField]?.enumItems;
    return new Map(Array.isArray(items) ? items.map((item) => [String(item.value), item.icon || 'circle']) : []);
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
    const dataSource = String(options.dataSource || 'dataList');
    const currentSource = String(options.currentSource || 'dataCurrent');
    return [dataSource, currentSource]
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
   * Project the live entry record over its matching list row before building the
   * visualization. `dataList` intentionally remains the parent list-page
   * snapshot; unsaved child-page edits belong only to `dataCurrent`. Any
   * metadata-driven visualization that receives both sources must therefore
   * render the current row from `dataCurrent`, without mutating the parent list.
   */
  const projectedRows = (list, current, idField) => {
    const sourceRows = Array.isArray(list)
      ? list.filter((row) => row && typeof row === 'object')
      : [];
    if (!current || typeof current !== 'object' || !idField) return sourceRows.map((row) => ({ ...row }));

    const currentId = current[idField];
    if (currentId == null || currentId === '') return sourceRows.map((row) => ({ ...row }));

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
    const dataSource = String(options.dataSource || 'dataList');
    const currentSource = String(options.currentSource || 'dataCurrent');
    const idField = String(options.idField || '');
    const parentField = String(options.parentField || '');
    const rootField = String(options.rootField || '');
    const labelField = String(options.labelField || '');
    const typeField = String(options.typeField || '');

    if (!idField || !parentField || !rootField || !labelField) return;

    const list = runtime.resolve(dataSource);
    const current = runtime.resolve(currentSource);
    const rows = projectedRows(list, current, idField);
    const currentId = current && typeof current === 'object' ? current[idField] : null;
    const currentRoot = current && typeof current === 'object' ? current[rootField] : null;
    const rootId = currentRoot ?? currentId;

    component.replaceChildren();

    if (state.modes.length > 1) {
      const toolbar = document.createElement('div');
      toolbar.className = 'metadata-hierarchy-toolbar d-flex justify-content-start mb-2';
      toolbar.setAttribute('role', 'group');
      toolbar.setAttribute('aria-label', 'Hierarchy visualization');
      toolbar.innerHTML = `
        <div class="btn-group btn-group-sm" role="group" aria-label="Hierarchy visualization mode">
          ${state.modes.map((mode) => `
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
          `).join('')}
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
    empty.className = 'text-secondary small py-3';
    empty.dataset.hierarchyTreeEmpty = '';
    empty.textContent = 'No hierarchy is available for the current record.';
    component.append(content, empty);

    if (!rows.length || rootId == null || rootId === '') {
      empty.hidden = false;
      return;
    }

    const byId = new Map(rows.map((row) => [String(row[idField]), row]));
    const root = byId.get(String(rootId));
    if (!root) {
      empty.hidden = false;
      return;
    }

    const children = new Map();
    for (const row of rows) {
      const parent = row[parentField];
      if (parent == null || parent === '') continue;
      const key = String(parent);
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(row);
    }
    for (const siblings of children.values()) {
      siblings.sort((left, right) => String(left[labelField] ?? '').localeCompare(String(right[labelField] ?? ''), undefined, { sensitivity: 'base' }));
    }

    const icons = iconMapFor(component, options);
    const entityKey = component.dataset.entityKey || '';
    const seen = new Set();

    const renderNode = (row) => {
      const id = String(row[idField] ?? '');
      if (!id || seen.has(id)) return '';
      seen.add(id);
      const childRows = children.get(id) || [];
      const typeValue = typeField ? String(row[typeField] ?? '') : '';
      const icon = icons.get(typeValue) || 'circle';
      const label = String(row[labelField] ?? id);
      const isCurrent = currentId != null && String(currentId) === id;
      const parentRow = row[parentField] == null ? null : byId.get(String(row[parentField]));
      const tooltipParts = [label];
      if (typeValue) tooltipParts.push(typeValue);
      if (parentRow) tooltipParts.push(`Parent: ${String(parentRow[labelField] ?? parentRow[idField] ?? '')}`);
      tooltipParts.push(`Id: ${id}`);
      const tooltip = tooltipParts.join(' · ');
      const childId = `hierarchy-children-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const expanded = !state.collapsed.has(id);

      return `
        <li class="metadata-hierarchy-node${isCurrent ? ' is-current' : ''}" data-hierarchy-node-id="${esc(id)}">
          <div class="metadata-hierarchy-node-row">
            ${childRows.length ? `<button class="metadata-hierarchy-toggle" type="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(childId)}" title="Collapse/expand"><i class="bi bi-chevron-${expanded ? 'down' : 'right'}" aria-hidden="true"></i></button>` : '<span class="metadata-hierarchy-toggle-spacer" aria-hidden="true"></span>'}
            <a class="metadata-hierarchy-node-link" href="/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(id)}" title="${esc(tooltip)}">
              <i class="bi bi-${esc(icon)}" aria-hidden="true"></i>
              <span>${esc(label)}</span>
            </a>
          </div>
          ${childRows.length ? `<ul class="metadata-hierarchy-children" id="${esc(childId)}"${expanded ? '' : ' hidden'}>${childRows.map(renderNode).join('')}</ul>` : ''}
        </li>`;
    };

    content.innerHTML = `<ul class="metadata-hierarchy-root">${renderNode(root)}</ul>`;
    empty.hidden = true;

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
        if (icon instanceof HTMLElement) icon.className = `bi bi-chevron-${expanded ? 'right' : 'down'}`;
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
      return dependencies.some((dependency) => changedPaths.some((changed) => pathsOverlap(dependency, changed)));
    });
    if (affected.length) scheduleRedraw(affected);
  });

  document.addEventListener('shown.bs.tab', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const selector = target.getAttribute('data-bs-target');
    if (!selector) return;
    const pane = document.querySelector(selector);
    const targets = pane ? [...pane.querySelectorAll('[data-metadata-component="hierarchy-tree"]')] : [];
    if (targets.length) scheduleRedraw(targets);
  });

  scheduleRedraw();
})();
