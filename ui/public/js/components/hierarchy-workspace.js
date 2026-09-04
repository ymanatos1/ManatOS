(() => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  const workspace = document.querySelector('[data-metadata-hierarchy-workspace]');
  if (!runtime || !(workspace instanceof HTMLElement)) return;

  const component = workspace.querySelector('[data-metadata-component="hierarchy-tree"]');
  const quickHost = workspace.querySelector('[data-hierarchy-record-quick-host]');
  const quick = quickHost?.querySelector('[data-record-quick]');
  if (!(component instanceof HTMLElement) || !(quickHost instanceof HTMLElement) || !(quick instanceof HTMLElement)) return;

  const quickSave = quick.querySelector('[data-record-quick-commit]');
  const quickState = quick.querySelector('[data-record-quick-state]');

  const leafPagePath = () => {
    let node = runtime.value?.page;
    if (!node) return null;
    let path = 'ctx.page';
    while (node?.page) { node = node.page; path += '.page'; }
    return path;
  };
  const pagePath = leafPagePath();
  if (!pagePath) return;

  const page = runtime.resolve(pagePath);
  const idField = String(page?.fields?.identityField?.value ?? page?.identityField ?? 'id');
  const parentField = String(page?.fields?.parentField?.value ?? page?.parentField ?? '');
  const componentOptions = (() => {
    try {
      const parsed = JSON.parse(component.dataset.metadataComponentOptions || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  })();
  const entryRepresentation = componentOptions.entryRepresentation && typeof componentOptions.entryRepresentation === 'object' ? componentOptions.entryRepresentation : {};
  const entryNameField = String(entryRepresentation.name?.field || (entryRepresentation.name?.expression && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryRepresentation.name.expression) ? entryRepresentation.name.expression : '') || componentOptions.labelField || 'name');
  const labelField = entryNameField;
  const entityLabel = String(componentOptions.entityLabel || 'entry');
  const rootField = String(page?.fields?.rootField?.value ?? page?.rootField ?? componentOptions.rootField ?? '');
  const entityKey = String(component.dataset.entityKey || '');
  const entityContext = (() => {
    const registry = runtime.value?.entities;
    if (!registry || typeof registry !== 'object') return null;
    return Object.values(registry).find((candidate) => candidate?.key === entityKey) || null;
  })();
  const entityMetadata = entityContext?.metadata && typeof entityContext.metadata === 'object' ? entityContext.metadata : null;
  const entityUiMetadata = entityContext?.uiMetadata && typeof entityContext.uiMetadata === 'object' ? entityContext.uiMetadata : null;
  if (!parentField) return;

  const entryResolver = window.ManatOS?.entryRepresentation;
  const resolveEntryName = (row) => {
    if (!row) return '';
    if (entryResolver?.resolve) {
      return entryResolver.resolve(entryRepresentation, row, {
        metadata: entityMetadata,
        entityIcon: componentOptions.entityIcon,
        fallbackName: row?.[labelField] ?? '',
      }).name;
    }
    return String(row?.[labelField] ?? '');
  };

  let draft = null;
  let savedDraftSignature = null;
  let savedDraftAt = null;
  let quickBaseline = null;
  const memberCount = workspace.querySelector('[data-hierarchy-member-count]');
  const incompleteIndicator = workspace.querySelector('[data-hierarchy-incomplete]');
  const hierarchyName = workspace.querySelector('[data-hierarchy-name]');
  const hierarchyClose = workspace.querySelector('[data-hierarchy-close]');
  const hierarchyEditExit = workspace.querySelector('[data-hierarchy-edit-exit]');
  const hierarchyCommit = workspace.querySelector('[data-hierarchy-commit]');
  const hierarchyDraftStatus = workspace.querySelector('[data-hierarchy-draft-status]');
  const hierarchySaveDraft = workspace.querySelector('[data-hierarchy-save-draft]');
  const hierarchyClearAll = workspace.querySelector('[data-hierarchy-clear-all]');
  const typeField = String(page?.fields?.typeField?.value ?? page?.typeField ?? componentOptions.typeField ?? '');
  const containerTrait = String(page?.fields?.containerTrait?.value ?? page?.containerTrait ?? componentOptions.containerTrait ?? '');
  const canHaveParentTrait = String(page?.fields?.canHaveParentTrait?.value ?? page?.canHaveParentTrait ?? componentOptions.canHaveParentTrait ?? '');
  const rootEligibleTrait = String(page?.fields?.rootEligibleTrait?.value ?? page?.rootEligibleTrait ?? componentOptions.rootEligibleTrait ?? '');
  const standAloneEligibleTrait = String(page?.fields?.standAloneEligibleTrait?.value ?? page?.standAloneEligibleTrait ?? componentOptions.standAloneEligibleTrait ?? '');

  const entries = () => {
    const value = runtime.resolve(`${pagePath}.entries`);
    return Array.isArray(value) ? value : [];
  };

  /*
   * The hierarchy owns the parent relationship. A declared root field is a
   * calculated projection of that relationship, never a second user-authored
   * relationship. Recalculate it over the in-memory graph after every graph
   * mutation so draft members expose the same complete record shape that a
   * nested owner-aware record editor will later consume.
   */
  const withCalculatedHierarchy = (rows) => {
    const cloned = rows.map((row) => ({ ...row }));
    if (!rootField) return cloned;
    const byId = new Map(cloned.map((row) => [String(row?.[idField] ?? ''), row]));

    const rootFor = (row) => {
      const directParent = row?.[parentField];
      if (directParent == null || String(directParent) === '') return null;
      let cursorId = String(directParent);
      const visited = new Set([String(row?.[idField] ?? '')]);
      while (cursorId) {
        if (visited.has(cursorId)) return null;
        visited.add(cursorId);
        const cursor = byId.get(cursorId);
        if (!cursor) return cursorId;
        const parent = cursor[parentField];
        if (parent == null || String(parent) === '') return String(cursor[idField] ?? cursorId);
        cursorId = String(parent);
      }
      return null;
    };

    return cloned.map((row) => ({ ...row, [rootField]: rootFor(row) }));
  };

  const replaceEntries = (next, action) => runtime.replace(`${pagePath}.entries`, withCalculatedHierarchy(next), {
    source: 'hierarchy-workspace', action, triggerPath: `${pagePath}.entries`,
  });

  const fieldEmptyValue = (field) => {
    if (!field || typeof field !== 'object') return null;
    if (field.type === 'boolean') return false;
    if (field.type === 'string' || field.type === 'email' || field.type === 'version') return '';
    return null;
  };

  const staticDefault = (key, field) => {
    const quickOverride = entityUiMetadata?.recordQuick?.fieldOverrides?.[key];
    const recordOverride = entityUiMetadata?.record?.fieldOverrides?.[key];
    const hasQuickDefault = quickOverride && Object.prototype.hasOwnProperty.call(quickOverride, 'createDefaultValue');
    const candidate = hasQuickDefault ? quickOverride.createDefaultValue : recordOverride?.createDefaultValue;
    if (candidate === null || ['string', 'number', 'boolean'].includes(typeof candidate)) return candidate;
    return fieldEmptyValue(field);
  };

  const completeDraftRecord = (draftId) => {
    const result = {};
    const definitions = entityMetadata?.fieldDefinition && typeof entityMetadata.fieldDefinition === 'object'
      ? entityMetadata.fieldDefinition
      : {};
    for (const [key, field] of Object.entries(definitions)) {
      if (!field || typeof field !== 'object' || field.sensitive === true) continue;
      result[key] = key === idField ? draftId : staticDefault(key, field);
    }
    result[idField] = draftId;
    return result;
  };
  const makeDraftId = () => `draft:${crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const find = (id) => entries().find((row) => String(row?.[idField]) === String(id));

  const hierarchyCompletion = (rows) => {
    if (!rows.length) return { complete: false, reason: 'The hierarchy has no members yet.' };
    const byId = new Map(rows.map((row) => [String(row?.[idField] ?? ''), row]));
    const roots = rows.filter((row) => {
      const parent = row?.[parentField];
      return parent == null || String(parent) === '' || !byId.has(String(parent));
    });
    if (roots.length !== 1) {
      return {
        complete: false,
        reason: roots.length ? 'The hierarchy has more than one root candidate.' : 'The hierarchy has no root candidate.',
      };
    }
    if (!typeField || !rootEligibleTrait || !standAloneEligibleTrait) return { complete: true, reason: null };
    const type = roots[0]?.[typeField];
    const field = entityMetadata?.fieldDefinition?.[typeField];
    const option = Array.isArray(field?.enumItems) ? field.enumItems.find((candidate) => candidate?.value === type) : null;
    const complete = option?.[rootEligibleTrait] === true || (rows.length === 1 && option?.[standAloneEligibleTrait] === true);
    return {
      complete,
      reason: complete ? null : rows.length === 1
        ? 'This member type is not eligible to finalize a standalone hierarchy.'
        : 'This hierarchy needs an eligible root member type before it is finalized.',
    };
  };

  const originalEntries = () => {
    const value = runtime.resolve(`${pagePath}.entriesOriginal`);
    return Array.isArray(value) ? value : [];
  };

  const replaceOriginalEntries = (next, action) => {
    runtime.replace(`${pagePath}.entriesOriginal`, next.map((entry) => ({ ...entry })), {
      source: 'hierarchy-workspace', action, triggerPath: `${pagePath}.entriesOriginal`,
    });
  };

  const ensureOriginalSnapshot = (candidate) => {
    const candidateId = candidate?.[idField] ?? candidate?.id ?? candidate?.value;
    if (candidateId == null || String(candidateId) === '' || String(candidateId).startsWith('draft:')) return;
    if (originalEntries().some((entry) => String(entry?.[idField] ?? '') === String(candidateId))) return;
    replaceOriginalEntries([...originalEntries(), { ...candidate, [idField]: candidateId }], 'add-existing-original');
  };

  const removeOriginalSnapshot = (memberId) => {
    if (!memberId || String(memberId).startsWith('draft:')) return;
    replaceOriginalEntries(
      originalEntries().filter((entry) => String(entry?.[idField] ?? '') !== String(memberId)),
      'remove-existing-original',
    );
  };

  const normalizedRows = (rows) => rows
    .map((row) => ({ ...row }))
    .sort((left, right) => String(left?.[idField] ?? '').localeCompare(String(right?.[idField] ?? '')));

  const workspaceDirty = (rows = entries()) =>
    JSON.stringify(normalizedRows(rows)) !== JSON.stringify(normalizedRows(originalEntries()));

  const setRuntimeValue = (path, value, action) => {
    if (runtime.resolve(path) === value) return;
    runtime.replace(path, value, { source: 'hierarchy-workspace', action, triggerPath: path });
  };

  const workspaceDraftSignature = (rows = entries()) => JSON.stringify(
    rows.map((row) => ({ ...row })),
  );

  const refreshDraftStatus = (rows) => {
    if (!(hierarchyDraftStatus instanceof HTMLElement)) return;
    if (!draftSupported) {
      hierarchyDraftStatus.hidden = true;
      hierarchyDraftStatus.textContent = '';
      if (hierarchySaveDraft instanceof HTMLButtonElement) hierarchySaveDraft.hidden = true;
      return;
    }
    if (!savedDraftSignature) {
      hierarchyDraftStatus.hidden = true;
      hierarchyDraftStatus.textContent = '';
      hierarchyDraftStatus.className = 'small text-secondary';
      if (hierarchySaveDraft instanceof HTMLButtonElement) hierarchySaveDraft.hidden = true;
      return;
    }
    const changedSinceDraft = workspaceDraftSignature(rows) !== savedDraftSignature;
    // Close persists the current draft, so a passive "Draft saved" message adds
    // no state information. Surface only the meaningful warning: the open
    // workspace has diverged from its last persisted/restored draft snapshot.
    hierarchyDraftStatus.hidden = !changedSinceDraft;
    hierarchyDraftStatus.textContent = changedSinceDraft ? 'Unsaved changes since draft' : '';
    hierarchyDraftStatus.className = 'small text-warning-emphasis';
    if (hierarchySaveDraft instanceof HTMLButtonElement) {
      hierarchySaveDraft.hidden = !changedSinceDraft;
      hierarchySaveDraft.disabled = Boolean(draft);
    }
    setRuntimeValue(`${pagePath}.fields.draftStatus.value`, changedSinceDraft ? 'modified-after-draft' : 'saved', 'hierarchy-draft-status');
    setRuntimeValue(`${pagePath}.state.draftDirty`, changedSinceDraft, 'hierarchy-draft-dirty');
  };

  const refreshWorkspaceSummary = () => {
    const rows = entries();
    const state = hierarchyCompletion(rows);
    const dirty = workspaceDirty(rows);
    const byId = new Map(rows.map((row) => [String(row?.[idField] ?? ''), row]));
    const roots = rows.filter((row) => {
      const parent = row?.[parentField];
      return parent == null || String(parent) === '' || !byId.has(String(parent));
    });

    if (memberCount instanceof HTMLElement) memberCount.textContent = `${rows.length} ${rows.length === 1 ? 'member' : 'members'}`;
    if (incompleteIndicator instanceof HTMLElement) {
      incompleteIndicator.hidden = state.complete;
      incompleteIndicator.title = state.reason || '';
    }
    if (hierarchyName instanceof HTMLElement) {
      const rootLabel = roots.length === 1 ? String(resolveEntryName(roots[0]) || '').trim() : '';
      const hierarchyLabel = String(workspace.dataset.hierarchyLabel || 'Hierarchy').toLowerCase();
      const emptyLabel = String(workspace.dataset.hierarchyEmptyName || `New ${hierarchyLabel}`);
      hierarchyName.textContent = rootLabel ? `${rootLabel} ${hierarchyLabel}` : emptyLabel;
    }
    const matchesSavedDraft = Boolean(savedDraftSignature) && workspaceDraftSignature(rows) === savedDraftSignature;
    if (hierarchyClose instanceof HTMLButtonElement) {
      hierarchyClose.disabled = Boolean(draft);
      hierarchyClose.title = draft
        ? 'Finish or cancel the current inline edit first.'
        : matchesSavedDraft
          ? 'Close this workspace; the saved draft already matches it.'
          : rows.length
            ? 'Save the current workspace draft in this browser and close.'
            : 'Close this workspace.';
    }
    if (hierarchyEditExit instanceof HTMLButtonElement) {
      hierarchyEditExit.textContent = dirty ? 'Cancel' : 'Close';
      hierarchyEditExit.title = dirty ? 'Discard the current organization changes and close.' : 'Close this organization.';
      hierarchyEditExit.disabled = Boolean(draft);
    }
    if (hierarchyCommit instanceof HTMLButtonElement) {
      hierarchyCommit.disabled = !state.complete || !dirty || Boolean(draft);
      hierarchyCommit.title = draft
        ? 'Finish or cancel the current inline edit first.'
        : !state.complete
          ? (state.reason || 'Complete the hierarchy before committing.')
          : !dirty
            ? 'No changes to commit.'
            : 'Commit all organization members and relationships atomically.';
    }
    if (hierarchyClearAll instanceof HTMLButtonElement) {
      hierarchyClearAll.disabled = !rows.length || Boolean(draft);
      hierarchyClearAll.title = draft
        ? 'Finish or cancel the current inline edit first.'
        : rows.length
          ? 'Clear this working organization and its saved Create Organization draft.'
          : 'The Create Organization workspace is already empty.';
    }

    refreshDraftStatus(rows);
    setRuntimeValue(`${pagePath}.fields.hierarchyStatus.value`, state.complete ? 'complete' : 'incomplete', 'hierarchy-status');
    setRuntimeValue(`${pagePath}.fields.finalizable.value`, state.complete, 'hierarchy-finalizable');
    setRuntimeValue(`${pagePath}.state.valid`, state.complete, 'hierarchy-valid');
    setRuntimeValue(`${pagePath}.state.dirty`, dirty, 'hierarchy-dirty');
    setRuntimeValue(`${pagePath}.state.internalEditing`, Boolean(draft), 'hierarchy-internal-editing');
    setRuntimeValue(`${pagePath}.state.internalEditorCount`, draft ? 1 : 0, 'hierarchy-internal-editor-count');
  };

  const clearQuick = () => {
    quick.querySelectorAll('[name]').forEach((control) => {
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = control.defaultChecked;
      } else if (control instanceof HTMLSelectElement) {
        const defaultIndex = [...control.options].findIndex((option) => option.defaultSelected);
        control.selectedIndex = defaultIndex >= 0 ? defaultIndex : 0;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.value = control.defaultValue || '';
      }
    });
  };

  const quickValues = () => {
    const result = {};
    quick.querySelectorAll('[name]').forEach((control) => {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      result[control.name] = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control.value;
    });
    return result;
  };

  const quickIsComplete = () => [...quick.querySelectorAll('[name]')]
    .filter((control) => control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
    .every((control) => control.disabled || typeof control.checkValidity !== 'function' || control.checkValidity());

  const quickIsDirty = () => {
    if (!quickBaseline) return false;
    return JSON.stringify(quickValues()) !== JSON.stringify(quickBaseline);
  };

  const refreshQuickState = () => {
    const dirty = quickIsDirty();
    const complete = quickIsComplete();
    if (quickSave instanceof HTMLButtonElement) quickSave.disabled = !(draft && dirty && complete);
    if (quickState instanceof HTMLElement) {
      quickState.textContent = !dirty ? 'No changes' : complete ? 'Ready' : 'Complete required fields';
      quickState.classList.toggle('text-warning-emphasis', dirty && !complete);
      quickState.classList.toggle('text-secondary', !dirty || complete);
    }
  };

  const provisionalHost = document.createElement('div');
  provisionalHost.className = 'metadata-hierarchy-provisional';
  provisionalHost.hidden = true;
  // Keep the quick editor outside hierarchy-tree's redraw-owned DOM. The tree
  // freely rebuilds its content from CTX; an overlay owned by the workspace must
  // survive those redraws while a draft record is being edited.
  workspace.append(provisionalHost);

  const provisionalFallbackLabel = () => {
    if (!draft) return `(New ${entityLabel})`;
    const target = draft.targetId ? find(draft.targetId) : null;
    const targetLabel = String(resolveEntryName(target) || '').trim();
    if (!targetLabel) return `(New ${entityLabel})`;
    if (draft.command === 'add-child') return `(New ${targetLabel} child)`;
    if (draft.command === 'add-sibling') return `(New ${targetLabel} sibling)`;
    if (draft.command === 'add-parent') return `(New ${targetLabel} parent)`;
    return `(New ${entityLabel})`;
  };

  const provisionalLabel = () => {
    if (!draft) return provisionalFallbackLabel();
    const preview = { ...draft.row, ...quickValues() };
    const value = String(resolveEntryName(preview) || '').trim();
    return value || provisionalFallbackLabel();
  };

  const refreshProvisionalLabel = () => {
    const label = provisionalHost.querySelector('[data-hierarchy-provisional-label]');
    if (label instanceof HTMLElement) label.textContent = provisionalLabel();
  };

  const positionQuick = () => {
    if (!draft) return;
    const content = component.querySelector('[data-hierarchy-tree-content]');
    if (!(content instanceof HTMLElement)) return;
    if (provisionalHost.parentElement !== workspace) workspace.append(provisionalHost);

    const target = draft.targetId
      ? component.querySelector(`[data-hierarchy-node-id="${CSS.escape(draft.targetId)}"] .metadata-hierarchy-node-row`)
      : null;
    const workspaceRect = workspace.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const targetRect = target instanceof HTMLElement ? target.getBoundingClientRect() : null;
    const left = targetRect
      ? targetRect.left - workspaceRect.left + targetRect.width / 2
      : contentRect.left - workspaceRect.left + contentRect.width / 2;
    const top = targetRect
      ? targetRect.bottom - workspaceRect.top + 12
      : contentRect.top - workspaceRect.top + Math.max(28, contentRect.height / 2 - 40);

    provisionalHost.style.left = `${Math.max(16, left)}px`;
    provisionalHost.style.top = `${Math.max(16, top)}px`;
    const firstShow = provisionalHost.hidden || quickHost.hidden;
    if (!provisionalHost.querySelector('[data-hierarchy-provisional-label]')) {
      const labelNode = document.createElement('div');
      labelNode.className = 'metadata-hierarchy-provisional-node';
      labelNode.innerHTML = '<span data-hierarchy-provisional-label></span>';
      provisionalHost.replaceChildren(labelNode);
    }
    refreshProvisionalLabel();
    if (quickHost.parentElement !== provisionalHost) provisionalHost.append(quickHost);
    provisionalHost.hidden = false;
    quickHost.hidden = false;
    if (firstShow) {
      requestAnimationFrame(() => {
        quick.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus();
        refreshQuickState();
      });
    }
  };

  const beginQuick = (command, memberId = null) => {
    if (draft) return;
    const current = memberId ? find(memberId) : null;
    if (command === 'add-child' && current && containerTrait) {
      const option = enumOptionFor(current);
      if (option?.[containerTrait] !== true) return;
    }
    const id = makeDraftId();
    const row = { ...completeDraftRecord(id), [idField]: id, [parentField]: null, ...(rootField ? { [rootField]: null } : {}) };
    if (entityMetadata?.fieldDefinition?.[labelField]) row[labelField] = '';
    if (command === 'add-child' && current) row[parentField] = current[idField];
    if (command === 'add-sibling' && current) row[parentField] = current[parentField] ?? null;
    if (command === 'add-parent' && current) row[parentField] = current[parentField] ?? null;

    draft = {
      id,
      command,
      targetId: current ? String(current[idField]) : null,
      row,
    };
    // The owner collection owns every working record, including the provisional
    // one. Keep it in entries[] immediately, but tell the visualizer to exclude
    // that editing id from layout until Quick Save commits it. This preserves a
    // complete owner CTX without moving any existing nodes during inline edit.
    component.dataset.hierarchyEditingId = id;
    replaceEntries([...entries().map((entry) => ({ ...entry })), row], 'begin-quick');
    clearQuick();
    quickBaseline = quickValues();
    workspace.classList.add('is-quick-editing');
    refreshWorkspaceSummary();
    refreshQuickState();
    requestAnimationFrame(positionQuick);
  };

  const finishQuickUi = () => {
    draft = null;
    quickBaseline = null;
    delete component.dataset.hierarchyEditingId;
    provisionalHost.hidden = true;
    provisionalHost.replaceChildren();
    quickHost.hidden = true;
    workspace.append(quickHost);
    workspace.classList.remove('is-quick-editing');
    refreshQuickState();
    refreshWorkspaceSummary();
  };

  const cancelQuick = () => {
    if (!draft) return;
    const cancelledId = draft.id;
    finishQuickUi();
    replaceEntries(
      entries().filter((entry) => String(entry?.[idField] ?? '') !== String(cancelledId)).map((entry) => ({ ...entry })),
      'cancel-quick',
    );
  };

  const saveQuick = () => {
    if (!draft || !quickIsDirty() || !quickIsComplete()) {
      refreshQuickState();
      return;
    }
    const values = quickValues();
    const active = draft;
    const id = active.id;
    let next = entries().map((entry) => String(entry?.[idField] ?? '') === String(id)
      ? { ...active.row, ...entry, ...values, [idField]: id }
      : { ...entry });
    if (active.command === 'add-parent' && active.targetId) {
      next = next.map((entry) => String(entry[idField]) === active.targetId
        ? { ...entry, [parentField]: id }
        : entry);
    }
    finishQuickUi();
    replaceEntries(next, 'save-quick');
  };

  const removeNode = (memberId) => {
    if (draft || !memberId) return;
    const row = find(memberId);
    if (!row) return;
    if (entries().some((candidate) => String(candidate?.[parentField] ?? '') === String(memberId))) {
      window.alert('Move or remove this member’s children before removing the member.');
      return;
    }
    replaceEntries(entries().filter((entry) => String(entry[idField]) !== String(memberId)).map((entry) => ({ ...entry })), 'remove-member');
    removeOriginalSnapshot(memberId);
  };

  const enumOptionFor = (row) => {
    if (!typeField || !row) return null;
    const field = entityMetadata?.fieldDefinition?.[typeField];
    return Array.isArray(field?.enumItems)
      ? field.enumItems.find((candidate) => candidate?.value === row?.[typeField]) ?? null
      : null;
  };

  /**
   * Detach one member from its current parent without deleting either record.
   * The organization may become temporarily incomplete (multiple roots); the
   * workspace validity calculation then keeps aggregate Save disabled until the
   * structure is finalizable again.
   */
  const clearParent = (memberId) => {
    if (draft || !memberId) return;
    const row = find(memberId);
    if (!row || row?.[parentField] == null || String(row[parentField]) === '') return;
    replaceEntries(entries().map((entry) => String(entry?.[idField] ?? '') === String(memberId)
      ? { ...entry, [parentField]: null }
      : { ...entry }), 'clear-parent');
  };

  /**
   * Reparent one working member by dropping it on another hierarchy member.
   * The operation is entirely owner-context based: it changes parentField in
   * entries[], lets calculated hierarchy fields refresh, and never persists.
   */
  const moveNode = (memberId, targetId) => {
    if (draft || !memberId || !targetId || String(memberId) === String(targetId)) return;
    const moving = find(memberId);
    const target = find(targetId);
    if (!moving || !target) return;
    // A direct-parent drop is a no-op and must be rejected by the mutation path
    // as well as by the visual drag target validator.
    if (String(moving?.[parentField] ?? '') === String(targetId)) return;

    const movingOption = enumOptionFor(moving);
    if (canHaveParentTrait && movingOption?.[canHaveParentTrait] !== true) return;

    const targetOption = enumOptionFor(target);
    if (containerTrait && targetOption?.[containerTrait] !== true) return;

    // Reject cycles: a member cannot be dropped onto one of its descendants.
    let cursor = target;
    const visited = new Set();
    while (cursor) {
      const cursorId = String(cursor?.[idField] ?? '');
      if (!cursorId || visited.has(cursorId)) break;
      if (cursorId === String(memberId)) return;
      visited.add(cursorId);
      const parentId = cursor?.[parentField];
      if (parentId == null || String(parentId) === '') break;
      cursor = find(String(parentId));
    }

    replaceEntries(entries().map((entry) => String(entry?.[idField] ?? '') === String(memberId)
      ? { ...entry, [parentField]: target[idField] }
      : { ...entry }), 'move-member');
  };

  const allReferenceEntries = () => {
    const listPage = runtime.resolve('ctx.page');
    const referenceData = listPage?.fields?.referenceData?.value ?? listPage?.referenceData ?? {};
    const candidates = referenceData?.[parentField];
    if (!Array.isArray(candidates)) return [];

    /*
     * Relationship eligibility must always see the live workspace graph first.
     * Reference data is the persisted candidate catalogue, but a node already in
     * entries[] may have been re-parented during this still-uncommitted session.
     * Overlay its working value so submenu, selector and defensive mutation checks
     * all answer the same question against the same graph.
     */
    const workingById = new Map(entries().map((row) => [String(row?.[idField] ?? ''), row]));
    return candidates
      .filter((row) => row && typeof row === 'object')
      .map((row) => {
        const candidateId = String(row?.[idField] ?? row?.id ?? row?.value ?? '');
        const working = workingById.get(candidateId);
        return working ? { ...row, ...working } : row;
      });
  };

  /**
   * Older browser drafts may predate entriesOriginal[]. Recover persisted
   * baselines from the canonical reference rows already supplied by the owner
   * page. Unknown historical properties are ignored; user draft work wins over
   * strict version gating.
   */
  const hydrateMissingOriginalSnapshots = () => {
    const sourceById = new Map(allReferenceEntries().map((row) => [String(row?.[idField] ?? row?.id ?? row?.value ?? ''), row]));
    const originalsById = new Map(originalEntries().map((row) => [String(row?.[idField] ?? ''), row]));
    let changed = false;
    for (const row of entries()) {
      const id = String(row?.[idField] ?? '');
      if (!id || id.startsWith('draft:') || originalsById.has(id)) continue;
      const source = sourceById.get(id);
      if (!source) continue;
      originalsById.set(id, { ...source, [idField]: id });
      changed = true;
    }
    if (changed) replaceOriginalEntries([...originalsById.values()], 'hydrate-existing-originals');
  };

  const ensureWorkingEntry = (candidate) => {
    const candidateId = candidate?.[idField] ?? candidate?.id ?? candidate?.value;
    if (candidateId == null || String(candidateId) === '') return null;
    const existing = find(String(candidateId));
    if (existing) return existing;
    const row = { ...candidate, [idField]: candidateId };
    ensureOriginalSnapshot(row);
    replaceEntries([...entries().map((entry) => ({ ...entry })), row], 'add-existing-entry');
    return row;
  };

  /**
   * One relationship-eligibility contract for every hierarchy selection path.
   * Menu candidate lists, the existing-entry selector and commit/relation paths
   * all consume these canonical enum traits. UI filtering is convenience only;
   * mutation paths call the same rule again defensively.
   */
  const relationCandidateEligibility = (member, candidate, relation) => {
    if (!member || !candidate) return { eligible: false, reason: 'Missing hierarchy member.' };
    const memberId = String(member?.[idField] ?? '');
    const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
    if (!memberId || !candidateId || memberId === candidateId) return { eligible: false, reason: 'An entry cannot relate to itself.' };

    const optionFor = (row) => {
      if (!typeField || !row) return null;
      const field = entityMetadata?.fieldDefinition?.[typeField];
      return Array.isArray(field?.enumItems)
        ? field.enumItems.find((item) => String(item?.value ?? '') === String(row?.[typeField] ?? '')) ?? null
        : null;
    };
    const memberOption = optionFor(member);
    const candidateOption = optionFor(candidate);
    const memberCanHaveParent = !canHaveParentTrait || memberOption?.[canHaveParentTrait] === true;
    const candidateCanHaveParent = !canHaveParentTrait || candidateOption?.[canHaveParentTrait] === true;
    const memberCanContain = !containerTrait || memberOption?.[containerTrait] === true;
    const candidateCanContain = !containerTrait || candidateOption?.[containerTrait] === true;

    if (relation === 'parent') {
      if (String(member?.[parentField] ?? '') === candidateId) {
        return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} is already the parent of ${resolveEntryName(member) || 'this entry'}.` };
      }
      if (!memberCanHaveParent) return { eligible: false, reason: `${resolveEntryName(member) || 'This entry'} cannot have a parent.` };
      if (!candidateCanContain) return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} cannot contain children.` };
    } else if (relation === 'child') {
      if (String(candidate?.[parentField] ?? '') === memberId) {
        return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} is already a child of ${resolveEntryName(member) || 'this entry'}.` };
      }
      if (!memberCanContain) return { eligible: false, reason: `${resolveEntryName(member) || 'This entry'} cannot contain children.` };
      if (!candidateCanHaveParent) return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} cannot have a parent.` };
    } else {
      const nextParentId = member?.[parentField];
      if (String(candidate?.[parentField] ?? '') === String(nextParentId ?? '')) {
        return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} is already a sibling of ${resolveEntryName(member) || 'this entry'}.` };
      }
      if (nextParentId != null && String(nextParentId) !== '' && !candidateCanHaveParent) {
        return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} cannot have a parent.` };
      }
      if ((nextParentId == null || String(nextParentId) === '') && rootEligibleTrait) {
        const rootEligible = candidateOption?.[rootEligibleTrait] === true || candidateOption?.[standAloneEligibleTrait] === true;
        if (!rootEligible) return { eligible: false, reason: `${resolveEntryName(candidate) || 'The selected entry'} is not root-eligible.` };
      }
    }

    // Existing working nodes also require cycle protection. Database candidates
    // not yet in the graph cannot form a working-graph cycle at selection time.
    const candidateWorking = find(candidateId);
    if (candidateWorking) {
      const movingId = relation === 'parent' ? memberId : candidateId;
      const nextParentId = relation === 'parent' ? candidateId : relation === 'child' ? memberId : (member?.[parentField] ?? null);
      if (nextParentId != null && String(nextParentId) !== '') {
        let cursor = find(String(nextParentId));
        const visited = new Set();
        while (cursor) {
          const cursorId = String(cursor?.[idField] ?? '');
          if (!cursorId || visited.has(cursorId)) break;
          if (cursorId === movingId) return { eligible: false, reason: 'That relationship would create a hierarchy cycle.' };
          visited.add(cursorId);
          const parentId = cursor?.[parentField];
          if (parentId == null || String(parentId) === '') break;
          cursor = find(String(parentId));
        }
      }
    }
    return { eligible: true, reason: null };
  };

  const expressionLiteral = (value) => JSON.stringify(String(value ?? ''));

  /**
   * Build the canonical exclude-when-true predicate passed by this hierarchy
   * caller to every list-like candidate surface. Type-wide exclusions remain
   * translatable by a future RDBMS adapter, while graph-specific exclusions
   * (self/cycle/current-placement) are emitted as explicit ids.
   */
  const relationListExceptions = (member, relation, candidates = allReferenceEntries()) => {
    const field = entityMetadata?.fieldDefinition?.[typeField];
    const enumItems = Array.isArray(field?.enumItems) ? field.enumItems : [];
    const memberParent = member?.[parentField];
    const disallowedTypes = enumItems.filter((item) => {
      if (relation === 'parent') return containerTrait && item?.[containerTrait] !== true;
      if (relation === 'child') return canHaveParentTrait && item?.[canHaveParentTrait] !== true;
      if (memberParent != null && String(memberParent) !== '') return canHaveParentTrait && item?.[canHaveParentTrait] !== true;
      if (rootEligibleTrait) return item?.[rootEligibleTrait] !== true && item?.[standAloneEligibleTrait] !== true;
      return false;
    }).map((item) => String(item?.value ?? '')).filter(Boolean);

    const disallowedIds = candidates.filter((candidate) => {
      const type = String(candidate?.[typeField] ?? '');
      // Type-wide failures are represented separately, so explicit ids capture
      // only per-row graph/state exceptions such as self/cycle/same placement.
      if (disallowedTypes.includes(type)) return false;
      return !relationCandidateEligibility(member, candidate, relation).eligible;
    }).map((candidate) => String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '')).filter(Boolean);

    const clauses = [];
    if (disallowedIds.length) clauses.push(`${idField} IN [${disallowedIds.map(expressionLiteral).join(', ')}]`);
    if (typeField && disallowedTypes.length) clauses.push(`${typeField} IN [${disallowedTypes.map(expressionLiteral).join(', ')}]`);
    return clauses.join(' || ') || 'false';
  };

  const addDatabaseEntryForRelation = (candidate, memberId, relation) => {
    const member = find(memberId);
    const candidateId = candidate?.[idField] ?? candidate?.id ?? candidate?.value;
    if (!member || candidateId == null || String(candidateId) === '') return false;
    if (find(String(candidateId))) return false;
    const eligibility = relationCandidateEligibility(member, candidate, relation);
    if (!eligibility.eligible) { window.alert(eligibility.reason || 'That relationship is not allowed.'); return false; }

    const row = { ...candidate, [idField]: candidateId };
    ensureOriginalSnapshot(row);
    const currentParent = member[parentField] ?? null;
    const current = entries().map((entry) => ({ ...entry }));

    if (relation === 'parent') {
      row[parentField] = currentParent;
      replaceEntries([
        ...current.map((entry) => String(entry?.[idField] ?? '') === String(memberId)
          ? { ...entry, [parentField]: candidateId }
          : entry),
        row,
      ], 'add-existing-entry-parent');
    } else if (relation === 'child') {
      row[parentField] = memberId;
      replaceEntries([...current, row], 'add-existing-entry-child');
    } else {
      row[parentField] = currentParent;
      replaceEntries([...current, row], 'add-existing-entry-sibling');
    }
    return true;
  };

  const openExistingEntrySelector = (memberId, relation = 'sibling') => {
    const member = find(memberId);
    if (!member) return;
    const source = allReferenceEntries();
    if (!source.length) { window.alert('No existing entries are available for selection.'); return; }

    document.querySelector('[data-hierarchy-entry-selector]')?.remove();
    const template = workspace.querySelector('[data-hierarchy-entry-selector-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop metadata-hierarchy-entry-selector-backdrop';
    backdrop.dataset.hierarchyEntrySelector = '';
    const fragment = template.content.cloneNode(true);
    const panel = fragment.querySelector('.metadata-hierarchy-entry-selector');
    if (!(panel instanceof HTMLElement)) return;
    backdrop.append(fragment);
    document.body.append(backdrop);

    const listMetadata = entityUiMetadata?.list && typeof entityUiMetadata.list === 'object' ? entityUiMetadata.list : {};
    const fieldDefinitions = entityMetadata?.fieldDefinition && typeof entityMetadata.fieldDefinition === 'object' ? entityMetadata.fieldDefinition : {};
    const visibleFields = Array.isArray(listMetadata.visibleFields)
      ? listMetadata.visibleFields.filter((key) => fieldDefinitions[key])
      : [labelField].filter(Boolean);
    let pageSize = Number(panel.querySelector('[data-selector-page-size]')?.value) || Number(listMetadata.pageSize) || 10;
    let currentPage = 1;
    let selectedId = null;
    const relationLabel = relation === 'parent' ? 'parent' : relation === 'child' ? 'child' : 'sibling';
    const memberName = resolveEntryName(member) || String(memberId);
    const selectionPath = `${pagePath}.selections.existingEntry`;
    const developerToolsDock = document.getElementById('developerToolsDock');
    const developerToolsWasVisible = Boolean(developerToolsDock && !developerToolsDock.classList.contains('d-none'));
    const selectorCtxButton = panel.querySelector('[data-selector-ctx]');
    if (selectorCtxButton instanceof HTMLButtonElement && developerToolsWasVisible) {
      selectorCtxButton.classList.remove('d-none');
      selectorCtxButton.addEventListener('click', () => {
        developerToolsDock?.classList.add('is-popup-inspection');
        window.ManatOS?.shell?.setDeveloperToolTab?.('ctx', false);
        window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', {
          detail: { path: selectionPath, expand: true },
        }));
      });
    }

    const selectorTitle = panel.querySelector('[data-selector-title]');
    if (selectorTitle instanceof HTMLElement) selectorTitle.textContent = `Select ${entityLabel} to place as ${memberName} ${relationLabel}`;

    const setSelectionContext = (next, action = 'selector-state') => {
      const existingSelections = runtime.resolve(`${pagePath}.selections`);
      const selections = existingSelections && typeof existingSelections === 'object' && !Array.isArray(existingSelections)
        ? { ...existingSelections }
        : {};
      if (next == null) delete selections.existingEntry;
      else selections.existingEntry = next;
      runtime.replace(`${pagePath}.selections`, selections, {
        source: 'hierarchy-workspace', action, triggerPath: `${pagePath}.selections`,
      });
    };

    const displayValue = (candidate, key) => {
      if (key === labelField || key === entityMetadata?.primaryField) {
        const rep = entryResolver?.resolve
          ? entryResolver.resolve(entryRepresentation, candidate, { metadata: entityMetadata, entityIcon: componentOptions.entityIcon, fallbackName: candidate?.[key] ?? candidate?.label ?? '' })
          : null;
        return rep?.name || candidate?.[key] || candidate?.label || '';
      }
      const field = fieldDefinitions[key];
      const value = candidate?.[key];
      if (Array.isArray(field?.enumItems)) return field.enumItems.find((item) => String(item?.value) === String(value))?.label ?? value ?? '';
      if (field?.type === 'boolean') return value ? 'Yes' : 'No';
      const referenceCandidates = runtime.resolve('ctx.page')?.fields?.referenceData?.value?.[key] ?? runtime.resolve('ctx.page')?.referenceData?.[key];
      if (field?.type === 'reference' && Array.isArray(referenceCandidates)) {
        const ref = referenceCandidates.find((item) => String(item?.value ?? item?.id) === String(value));
        return ref?.label ?? ref?.name ?? value ?? '';
      }
      return value ?? '';
    };
    const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const displayCellHtml = (candidate, key) => {
      const field = fieldDefinitions[key];
      const value = candidate?.[key];
      if (key === labelField || key === entityMetadata?.primaryField) {
        const rep = entryResolver?.resolve
          ? entryResolver.resolve(entryRepresentation, candidate, { metadata: entityMetadata, entityIcon: componentOptions.entityIcon, fallbackName: candidate?.[key] ?? candidate?.label ?? '' })
          : null;
        const icons = Array.isArray(rep?.icons) ? rep.icons : [];
        const iconHtml = icons.length ? `<span class="metadata-entry-icons me-1" aria-hidden="true">${icons.map((icon, index) => `<i class="bi bi-${escHtml(icon)} metadata-entry-icon metadata-entry-icon-${index}"></i>`).join('')}</span>` : '';
        return `${iconHtml}${escHtml(rep?.name || displayValue(candidate, key))}`;
      }
      if (field?.type === 'reference') {
        const referenceCandidates = runtime.resolve('ctx.page')?.fields?.referenceData?.value?.[key] ?? runtime.resolve('ctx.page')?.referenceData?.[key];
        const ref = Array.isArray(referenceCandidates) ? referenceCandidates.find((item) => String(item?.value ?? item?.id) === String(value)) : null;
        const icon = ref?.__entryIcon ? `<i class="bi bi-${escHtml(ref.__entryIcon)} me-1" aria-hidden="true"></i>` : '';
        return `${icon}${escHtml(ref?.label ?? ref?.name ?? value ?? '')}`;
      }
      if (Array.isArray(field?.enumItems)) {
        const item = field.enumItems.find((option) => String(option?.value) === String(value));
        const icon = item?.icon ? `<i class="bi bi-${escHtml(item.icon)} me-1" aria-hidden="true"></i>` : '';
        return `${icon}${escHtml(item?.label ?? value ?? '')}`;
      }
      if (field?.type === 'boolean') {
        return `<span class="metadata-selector-boolean"><i class="bi ${value ? 'bi-check-circle' : 'bi-dash-circle'} me-1" aria-hidden="true"></i>${value ? 'Yes' : 'No'}</span>`;
      }
      return escHtml(displayValue(candidate, key));
    };

    const rowsHost = panel.querySelector('[data-selector-rows]');
    const search = panel.querySelector('[data-selector-filter]');
    const selectButton = panel.querySelector('[data-selector-select]');
    const note = panel.querySelector('[data-selector-context-note]');

    const fieldFilterValues = () => Object.fromEntries([...panel.querySelectorAll('[data-selector-field-filter]')].map((control) => [control.dataset.selectorFieldFilter, control.value]));
    const filteredRows = () => {
      const term = String(search?.value || '').trim().toLowerCase();
      const fieldFilters = [...panel.querySelectorAll('[data-selector-field-filter]')];
      return source.filter((candidate) => {
        const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
        if (!candidateId || candidateId === String(memberId)) return false;
        if (!relationCandidateEligibility(member, candidate, relation).eligible) return false;
        if (term) {
          const haystack = visibleFields.map((key) => displayValue(candidate, key)).join(' ').toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return fieldFilters.every((control) => {
          const key = control.dataset.selectorFieldFilter;
          const wanted = String(control.value || '').trim().toLowerCase();
          if (!wanted) return true;
          const actual = String(candidate?.[key] ?? '').trim().toLowerCase();
          return fieldDefinitions[key]?.type === 'boolean' ? actual === wanted : String(displayValue(candidate, key)).toLowerCase().includes(wanted);
        });
      });
    };

    const syncSelectionContext = (filtered = filteredRows()) => {
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      setSelectionContext({
        entityKey,
        kind: 'entity-selection',
        mode: 'select',
        operation: relation,
        sourceEntryId: String(memberId),
        sourceEntryName: memberName,
        entriesOriginal: source.map((row) => ({ ...row })),
        entries: source.map((row) => ({ ...row })),
        // Same list/query vocabulary as ctx.page: listExceptions is one
        // canonical exclude-when-true formula under filters, not a selector-only
        // object. API-backed lists can pass this exact source to storage.
        filters: { ...fieldFilterValues(), listExceptions: relationListExceptions(member, relation, source) },
        search: String(search?.value || ''),
        paging: { page: currentPage, pageSize, total: filtered.length, totalPages: pages },
        selectedId,
        state: { dirty: false, valid: Boolean(selectedId), internalEditing: false, internalEditorCount: 0, saving: false, deleting: false },
      });
    };

    const close = () => {
      developerToolsDock?.classList.remove('is-popup-inspection');
      setSelectionContext(null, 'close-entry-selector');
      backdrop.remove();
    };

    const updatePaging = (pages, total) => {
      const showPager = pages > 1;
      const summaryWrap = panel.querySelector('[data-selector-page-summary-wrap]');
      const paginationNav = panel.querySelector('[data-selector-pagination-nav]');
      if (summaryWrap instanceof HTMLElement) summaryWrap.hidden = !showPager;
      if (paginationNav instanceof HTMLElement) paginationNav.hidden = !showPager;
      const pageSizeWrap = panel.querySelector('[data-selector-page-size-wrap]');
      const pageSizes = [...panel.querySelectorAll('[data-selector-page-size] option')].map((option) => Number(option.value)).filter((value) => Number.isFinite(value) && value > 0);
      const minimumPageSize = pageSizes.length ? Math.min(...pageSizes) : pageSize;
      if (pageSizeWrap instanceof HTMLElement) pageSizeWrap.hidden = total < minimumPageSize;
      const firstItem = panel.querySelector('[data-selector-first-item]');
      const prevItem = panel.querySelector('[data-selector-prev-item]');
      const nextItem = panel.querySelector('[data-selector-next-item]');
      const lastItem = panel.querySelector('[data-selector-last-item]');
      firstItem?.classList.toggle('disabled', currentPage <= 1);
      prevItem?.classList.toggle('disabled', currentPage <= 1);
      nextItem?.classList.toggle('disabled', currentPage >= pages);
      lastItem?.classList.toggle('disabled', currentPage >= pages);
      const current = panel.querySelector('[data-selector-current-page]'); if (current) current.textContent = String(currentPage);
      const summary = panel.querySelector('[data-selector-page-summary]'); if (summary) summary.textContent = `Page ${currentPage} of ${pages}`;
    };

    const updateSelectionNote = () => {
      if (!(note instanceof HTMLElement)) return;
      if (!selectedId) { note.textContent = 'Select an entry to see what will happen.'; return; }
      const candidate = source.find((row) => String(row?.[idField] ?? row?.id ?? row?.value ?? '') === String(selectedId));
      const candidateName = candidate ? (resolveEntryName(candidate) || String(selectedId)) : String(selectedId);
      note.innerHTML = find(selectedId)
        ? `<i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>${escHtml(candidateName)} is already in this organization. Select will reposition its existing node as ${escHtml(memberName)} ${escHtml(relationLabel)}.`
        : `<i class="bi bi-database-check me-1" aria-hidden="true"></i>Select will add the existing database ${escHtml(entityLabel)} ${escHtml(candidateName)} as ${escHtml(memberName)} ${escHtml(relationLabel)}.`;
    };

    const render = () => {
      const filtered = filteredRows();
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      currentPage = Math.min(Math.max(1, currentPage), pages);
      const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      if (rowsHost) rowsHost.innerHTML = pageRows.map((candidate) => {
        const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
        const already = Boolean(find(candidateId));
        const rowClasses = [selectedId === candidateId ? 'table-primary' : '', already ? 'is-in-organization' : ''].filter(Boolean).join(' ');
        return `<tr tabindex="0" data-selector-row data-candidate-id="${candidateId.replaceAll('&','&amp;').replaceAll('"','&quot;')}" class="${rowClasses}" aria-description="${already ? 'Already in organization; selecting repositions its node' : 'Existing database entry'}">${visibleFields.map((key) => `<td>${displayCellHtml(candidate, key)}</td>`).join('')}</tr>`;
      }).join('') || `<tr><td colspan="${Math.max(1, visibleFields.length)}" class="empty-table-state"><i class="bi bi-search"></i><strong>No entries found</strong><span>No existing entries match the current filter. Change or clear the filters.</span></td></tr>`;
      const count = panel.querySelector('[data-selector-count]'); if (count) count.textContent = String(filtered.length);
      updatePaging(pages, filtered.length);
      refreshSelectionUi(filtered);
    };

    const refreshSelectionUi = (filtered = filteredRows()) => {
      rowsHost?.querySelectorAll('[data-selector-row]').forEach((candidateRow) => {
        candidateRow.classList.toggle('table-primary', candidateRow.dataset.candidateId === selectedId);
      });
      if (selectButton instanceof HTMLButtonElement) selectButton.disabled = !selectedId;
      updateSelectionNote();
      syncSelectionContext(filtered);
    };

    const selectRow = (row) => {
      selectedId = row?.dataset?.candidateId || null;
      // Do not rebuild tbody on a simple selection. Replacing the row after the
      // first click prevents browsers from delivering dblclick to the same DOM
      // node. Search/filter/paging still call render(); selection only updates
      // presentation and CTX state in place.
      refreshSelectionUi();
    };

    const commitSelection = () => {
      if (!selectedId) return;
      const candidate = source.find((row) => String(row?.[idField] ?? row?.id ?? row?.value ?? '') === String(selectedId));
      if (!candidate) return;
      const alreadyInOrganization = Boolean(find(selectedId));
      if (alreadyInOrganization) {
        relateExistingNode(`use-existing-${relation}`, memberId, selectedId, { confirm: false });
      } else {
        addDatabaseEntryForRelation(candidate, memberId, relation);
      }
      close();
    };

    panel.addEventListener('click', (event) => {
      const row = event.target instanceof Element ? event.target.closest('[data-selector-row]') : null;
      if (row instanceof HTMLElement) selectRow(row);
    });
    panel.addEventListener('dblclick', (event) => {
      const row = event.target instanceof Element ? event.target.closest('[data-selector-row]') : null;
      if (!(row instanceof HTMLElement)) return;
      selectRow(row);
      commitSelection();
    });
    panel.addEventListener('keydown', (event) => {
      const row = event.target instanceof Element ? event.target.closest('[data-selector-row]') : null;
      if (row instanceof HTMLElement && event.key === 'Enter') { event.preventDefault(); selectRow(row); commitSelection(); }
      else if (row instanceof HTMLElement && event.key === ' ') { event.preventDefault(); selectRow(row); }
    });
    panel.querySelector('[data-selector-close]')?.addEventListener('click', close);
    panel.querySelector('[data-selector-cancel]')?.addEventListener('click', close);
    // ManatOS popups never dismiss from an accidental backdrop click.
    search?.addEventListener('input', () => { currentPage = 1; render(); });
    panel.querySelector('[data-selector-filters-toggle]')?.addEventListener('click', (event) => {
      const filters = panel.querySelector('[data-selector-filters]');
      if (!(filters instanceof HTMLElement)) return;
      filters.hidden = !filters.hidden;
      event.currentTarget?.setAttribute?.('aria-expanded', String(!filters.hidden));
    });
    panel.querySelector('[data-selector-filter-apply]')?.addEventListener('click', () => { currentPage = 1; render(); });
    panel.querySelector('[data-selector-filter-clear]')?.addEventListener('click', () => {
      panel.querySelectorAll('[data-selector-field-filter]').forEach((control) => { control.value = ''; });
      currentPage = 1; render();
    });
    panel.querySelector('[data-selector-page-size]')?.addEventListener('change', (event) => { pageSize = Number(event.target.value) || 10; currentPage = 1; render(); });
    panel.querySelector('[data-selector-first]')?.addEventListener('click', () => { currentPage = 1; render(); });
    panel.querySelector('[data-selector-prev]')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); render(); });
    panel.querySelector('[data-selector-next]')?.addEventListener('click', () => { currentPage += 1; render(); });
    panel.querySelector('[data-selector-last]')?.addEventListener('click', () => { currentPage = Math.max(1, Math.ceil(filteredRows().length / pageSize)); render(); });
    selectButton?.addEventListener('click', commitSelection);

    render();
    search?.focus();
  };

  const relateExistingNode = (command, memberId, candidateId, options = {}) => {
    if (draft || !memberId || !candidateId || String(memberId) === String(candidateId)) return;
    const member = find(memberId);
    const candidate = find(candidateId);
    if (!member || !candidate) return;

    const memberName = resolveEntryName(member) || String(memberId);
    const candidateName = resolveEntryName(candidate) || String(candidateId);
    let movingId = candidateId;
    let nextParent = null;
    let message = '';
    if (command === 'use-existing-parent') {
      movingId = memberId;
      nextParent = candidateId;
      message = `Make ${candidateName} parent of ${memberName}?`;
    } else if (command === 'use-existing-child') {
      movingId = candidateId;
      nextParent = memberId;
      message = `Make ${candidateName} child of ${memberName}?`;
    } else if (command === 'use-existing-sibling') {
      movingId = candidateId;
      nextParent = member[parentField] ?? null;
      message = `Move ${candidateName} beside ${memberName} as its sibling?`;
    } else return;

    const eligibility = relationCandidateEligibility(member, candidate, command.replace('use-existing-', ''));
    if (!eligibility.eligible) { window.alert(eligibility.reason || 'That relationship is not allowed.'); return; }

    // Reuse the same graph safety semantics as drag/drop before asking the user.
    if (nextParent != null && String(nextParent) !== '') {
      let cursor = find(nextParent);
      const visited = new Set();
      while (cursor) {
        const cursorId = String(cursor?.[idField] ?? '');
        if (!cursorId || visited.has(cursorId)) break;
        if (cursorId === String(movingId)) { window.alert('That relationship would create a hierarchy cycle.'); return; }
        visited.add(cursorId);
        const parentId = cursor?.[parentField];
        if (parentId == null || String(parentId) === '') break;
        cursor = find(parentId);
      }
    }
    if (options.confirm !== false && !window.confirm(message)) return;
    replaceEntries(entries().map((entry) => String(entry?.[idField] ?? '') === String(movingId)
      ? { ...entry, [parentField]: nextParent }
      : { ...entry }), 'relate-existing-member');
  };

  const metaValue = (name, fallback) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || fallback;
  const userId = metaValue('manatos-user-id', 'anonymous');
  const hierarchyMode = String(page?.mode ?? 'create');
  const draftSupported = hierarchyMode === 'create';
  const focusedMemberId = String(page?.fields?.focusedMemberId?.value ?? page?.focusedMemberId ?? '') || '';
  const hierarchyRootIdentity = String(page?.fields?.hierarchyRootId?.value ?? page?.hierarchyRootId ?? '') || focusedMemberId;
  const draftStoragePrefix = 'manatos:hierarchy-draft:';
  /*
   * Drafts belong only to the aggregate Create Organization workflow. They are
   * browser/user scoped and deliberately survive navigation and ManatOS restarts.
   * Entry-specific Edit Organization workspaces operate directly on their loaded
   * baseline and never restore or persist a browser draft.
   */
  const draftIdentity = hierarchyMode === 'create' ? 'create' : `edit:${hierarchyRootIdentity || 'unknown'}`;
  const draftStorageKey = `${draftStoragePrefix}${userId}:${entityKey}:${draftIdentity}`;

  const compatibleDraftPayload = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.entries)) return null;
    // Be additive/tolerant: retain every recognizable record and ignore unknown
    // envelope properties. Do not reject useful user work merely because an
    // older implementation wrote another version marker.
    const recognizable = candidate.entries.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    if (!recognizable.length && candidate.entries.length) return null;
    return {
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : null,
      entries: recognizable,
      entriesOriginal: Array.isArray(candidate.entriesOriginal)
        ? candidate.entriesOriginal.filter((row) => row && typeof row === 'object' && !Array.isArray(row))
        : null,
    };
  };

  const storedDraftCandidates = () => {
    if (!draftSupported) return [];
    const candidates = [];
    try {
      const exact = localStorage.getItem(draftStorageKey);
      if (exact) candidates.push({ key: draftStorageKey, raw: exact });
      // Migration path for the previous boot-scoped key:
      // manatos:hierarchy-draft:<boot>:<user>:<entity>:<root/new>
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || key === draftStorageKey || !key.startsWith(draftStoragePrefix)) continue;
        const suffix = key.slice(draftStoragePrefix.length);
        // Only migrate historical *create* drafts here. An old edit-workspace
        // checkpoint must never become the next Create Organization workspace.
        const legacyCreateSuffix = `:${userId}:${entityKey}:new`;
        const stableCreateSuffix = `${userId}:${entityKey}:create`;
        if (!suffix.endsWith(legacyCreateSuffix) && suffix !== stableCreateSuffix) continue;
        candidates.push({ key, raw: localStorage.getItem(key) });
      }
    } catch { return []; }
    return candidates;
  };

  const saveWorkspaceDraft = () => {
    if (!draftSupported || draft) return false;
    if (!entries().length) {
      if (draftSupported) {
        try { localStorage.removeItem(draftStorageKey); } catch { /* ignore */ }
      }
      savedDraftSignature = null;
      savedDraftAt = null;
      refreshWorkspaceSummary();
      return true;
    }
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      entries: entries().map((row) => ({ ...row })),
      entriesOriginal: originalEntries().map((row) => ({ ...row })),
    };
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    } catch {
      if (hierarchyDraftStatus instanceof HTMLElement) {
        hierarchyDraftStatus.textContent = 'Draft could not be saved in this browser';
        hierarchyDraftStatus.hidden = false;
      }
      return false;
    }
    savedDraftSignature = workspaceDraftSignature(payload.entries);
    savedDraftAt = new Date(payload.savedAt);
    refreshWorkspaceSummary();
    return true;
  };

  const clearCreateWorkspaceDrafts = () => {
    if (!draftSupported) return;
    try {
      const legacyCreateSuffix = `:${userId}:${entityKey}:new`;
      const stableCreateSuffix = `${userId}:${entityKey}:create`;
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(draftStoragePrefix)) continue;
        const suffix = key.slice(draftStoragePrefix.length);
        if (key === draftStorageKey || suffix.endsWith(legacyCreateSuffix) || suffix === stableCreateSuffix) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch { /* Commit already succeeded; draft cleanup must never block navigation. */ }
  };

  const clearAllOperationSummary = () => {
    const current = entries();
    const newEntries = current.filter((row) => String(row?.[idField] ?? '').startsWith('draft:'));
    const persistedEntries = current.filter((row) => {
      const id = String(row?.[idField] ?? '');
      return id && !id.startsWith('draft:');
    });
    return {
      newEntries,
      persistedEntries,
      total: current.length,
      savedDraftPresent: Boolean(savedDraftSignature) || storedDraftCandidates().length > 0,
    };
  };

  const clearAllWorkspace = () => {
    if (!draftSupported || draft) return;
    clearCreateWorkspaceDrafts();
    savedDraftSignature = null;
    savedDraftAt = null;
    replaceOriginalEntries([], 'clear-all-originals');
    replaceEntries([], 'clear-all');
    refreshWorkspaceSummary();
  };

  const confirmClearAllWorkspace = () => {
    if (!draftSupported || draft || !entries().length) return;
    document.querySelector('[data-hierarchy-clear-all-confirm]')?.remove();
    const template = workspace.querySelector('[data-hierarchy-clear-all-confirm-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop metadata-hierarchy-entry-selector-backdrop';
    backdrop.dataset.hierarchyClearAllConfirm = '';
    const fragment = template.content.cloneNode(true);
    const panel = fragment.querySelector('.metadata-hierarchy-clear-confirm');
    if (!(panel instanceof HTMLElement)) return;

    const summary = clearAllOperationSummary();
    const summaryHost = panel.querySelector('[data-clear-all-summary]');
    if (summaryHost instanceof HTMLElement) {
      summaryHost.innerHTML = `
        <div class="row g-2">
          <div class="col-sm-4"><div class="border rounded p-2 h-100"><strong>${summary.newEntries.length}</strong><div class="small text-secondary">new entries to discard</div></div></div>
          <div class="col-sm-4"><div class="border rounded p-2 h-100"><strong>${summary.persistedEntries.length}</strong><div class="small text-secondary">persisted entries removed from this working organization</div></div></div>
          <div class="col-sm-4"><div class="border rounded p-2 h-100"><strong>${summary.savedDraftPresent ? 'Yes' : 'No'}</strong><div class="small text-secondary">saved Create Organization draft to clear</div></div></div>
        </div>
        <div class="small text-secondary mt-2">${summary.total} working members will be removed. Persisted entries remain unchanged in application storage/database.</div>`;
    }

    const detailsHost = panel.querySelector('[data-clear-all-details]');
    if (detailsHost instanceof HTMLElement) {
      detailsHost.innerHTML = [
        commitDetailSection('New entries to discard', summary.newEntries, 'No new entries.'),
        commitDetailSection('Persisted entries removed from the working organization', summary.persistedEntries, 'No persisted entries are currently included.'),
        `<section class="mb-3"><div class="fw-semibold mb-1">Saved Create Organization draft</div><div class="small text-secondary">${summary.savedDraftPresent ? 'The saved browser draft for this Create Organization workspace will be deleted.' : 'No saved browser draft currently exists.'}</div></section>`,
        '<div class="alert alert-info py-2 mb-0"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>No persisted Principal is deleted or modified in application storage/database by Clear all.</div>',
      ].join('');
    }

    panel.querySelectorAll('[data-clear-all-tab]').forEach((button) => button.addEventListener('click', () => {
      const tab = button.dataset.clearAllTab || 'summary';
      panel.querySelectorAll('[data-clear-all-tab]').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-selected', String(active));
      });
      panel.querySelectorAll('[data-clear-all-panel]').forEach((candidate) => { candidate.hidden = candidate.dataset.clearAllPanel !== tab; });
    }));

    const developerToolsDock = document.getElementById('developerToolsDock');
    const developerToolsWasVisible = Boolean(developerToolsDock && !developerToolsDock.classList.contains('d-none'));
    const ctxButton = panel.querySelector('[data-clear-all-confirm-ctx]');
    if (ctxButton instanceof HTMLButtonElement) {
      ctxButton.hidden = !developerToolsWasVisible;
      ctxButton.addEventListener('click', () => {
        developerToolsDock?.classList.add('is-popup-inspection');
        window.ManatOS?.shell?.setDeveloperToolTab?.('ctx', false);
        window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', { detail: { path: pagePath, expand: true } }));
      });
    }

    backdrop.append(fragment);
    document.body.append(backdrop);
    const cancel = () => { developerToolsDock?.classList.remove('is-popup-inspection'); backdrop.remove(); };
    panel.querySelectorAll('[data-clear-all-confirm-cancel]').forEach((button) => button.addEventListener('click', cancel));
    // Universal ManatOS popup rule: backdrop clicks never dismiss a popup.
    panel.querySelector('[data-clear-all-confirm-accept]')?.addEventListener('click', () => {
      cancel();
      clearAllWorkspace();
    });
    panel.querySelector('[data-clear-all-confirm-accept]')?.focus();
  };

  const restoreWorkspaceDraft = () => {
    if (!draftSupported) return false;
    let best = null;
    for (const candidate of storedDraftCandidates()) {
      if (!candidate.raw) continue;
      try {
        const payload = compatibleDraftPayload(JSON.parse(candidate.raw));
        if (!payload) continue;
        const time = payload.savedAt ? Date.parse(payload.savedAt) : 0;
        if (!best || time >= best.time) best = { ...candidate, payload, time };
      } catch { /* Ignore an unreadable historical draft; never block the page. */ }
    }
    if (!best) return false;

    const payload = best.payload;
    replaceEntries(payload.entries.map((row) => ({ ...row })), 'restore-workspace-draft');
    if (Array.isArray(payload.entriesOriginal)) {
      replaceOriginalEntries(payload.entriesOriginal.map((row) => ({ ...row })), 'restore-workspace-draft-original');
    }
    hydrateMissingOriginalSnapshots();
    savedDraftSignature = workspaceDraftSignature(payload.entries);
    savedDraftAt = payload.savedAt ? new Date(payload.savedAt) : null;

    // Migrate a recognized legacy draft to the stable key, but leave the old
    // copy untouched until a successful Commit clears the working draft.
    if (best.key !== draftStorageKey) {
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify({
          version: 1,
          savedAt: payload.savedAt || new Date().toISOString(),
          entries: payload.entries,
          entriesOriginal: payload.entriesOriginal || originalEntries(),
        }));
      } catch { /* Restoration itself already succeeded. */ }
    }
    return true;
  };

  const closeWorkspace = () => {
    if (draft) return;
    const rows = entries();
    const matchesSavedDraft = Boolean(savedDraftSignature) && workspaceDraftSignature(rows) === savedDraftSignature;
    const saved = matchesSavedDraft || saveWorkspaceDraft();
    if (!saved && rows.length) return;
    window.location.assign(workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`);
  };

  const exitEditWorkspace = () => {
    if (draft) return;
    window.location.assign(workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`);
  };

  const aggregateOperationSummary = () => {
    const current = entries();
    const original = originalEntries();
    const originalById = new Map(original.map((row) => [String(row?.[idField] ?? ''), row]));
    const currentIds = new Set(current.map((row) => String(row?.[idField] ?? '')).filter(Boolean));
    const created = [];
    const updated = [];
    const unchanged = [];
    for (const row of current) {
      const id = String(row?.[idField] ?? '');
      if (!id) continue;
      if (id.startsWith('draft:')) { created.push(row); continue; }
      const baseline = originalById.get(id);
      if (!baseline) { updated.push(row); continue; }
      (JSON.stringify({ ...row }) !== JSON.stringify({ ...baseline }) ? updated : unchanged).push(row);
    }
    const removed = original.filter((row) => {
      const id = String(row?.[idField] ?? '');
      return id && !currentIds.has(id);
    });
    return { created, updated, unchanged, removed, total: current.length };
  };

  const commitEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const commitDetailSection = (title, rows, emptyText) => {
    const items = rows.map((row) => `<li class="list-group-item d-flex justify-content-between align-items-center gap-3"><span>${commitEscape(resolveEntryName(row) || row?.[idField] || 'Entry')}</span><code class="small text-secondary">${commitEscape(row?.[idField] || '')}</code></li>`).join('');
    return `<section class="mb-3"><div class="fw-semibold mb-1">${commitEscape(title)} <span class="badge text-bg-secondary">${rows.length}</span></div>${items ? `<ul class="list-group list-group-flush border rounded">${items}</ul>` : `<div class="small text-secondary">${commitEscape(emptyText)}</div>`}</section>`;
  };

  const confirmCommitWorkspace = () => {
    if (!(hierarchyCommit instanceof HTMLButtonElement) || hierarchyCommit.disabled || draft) return;
    document.querySelector('[data-hierarchy-commit-confirm]')?.remove();
    const template = workspace.querySelector('[data-hierarchy-commit-confirm-template]');
    if (!(template instanceof HTMLTemplateElement)) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop metadata-hierarchy-entry-selector-backdrop';
    backdrop.dataset.hierarchyCommitConfirm = '';
    const fragment = template.content.cloneNode(true);
    const panel = fragment.querySelector('.metadata-hierarchy-commit-confirm');
    if (!(panel instanceof HTMLElement)) return;
    const summary = aggregateOperationSummary();
    const summaryHost = panel.querySelector('[data-commit-summary]');
    if (summaryHost instanceof HTMLElement) {
      summaryHost.innerHTML = `
        <div class="row g-2">
          <div class="col-sm-3"><div class="border rounded p-2 h-100"><strong>${summary.created.length}</strong><div class="small text-secondary">new entries to create</div></div></div>
          <div class="col-sm-3"><div class="border rounded p-2 h-100"><strong>${summary.updated.length}</strong><div class="small text-secondary">existing entries to update</div></div></div>
          <div class="col-sm-3"><div class="border rounded p-2 h-100"><strong>${summary.unchanged.length}</strong><div class="small text-secondary">existing entries unchanged</div></div></div>
          <div class="col-sm-3"><div class="border rounded p-2 h-100"><strong>${summary.removed.length}</strong><div class="small text-secondary">existing entries removed</div></div></div>
        </div>
        <div class="small text-secondary mt-2">${summary.total} members are represented in the final working organization.</div>`;
    }
    const detailsHost = panel.querySelector('[data-commit-details]');
    if (detailsHost instanceof HTMLElement) {
      detailsHost.innerHTML = [
        commitDetailSection('New entries to create', summary.created, 'No new entries.'),
        commitDetailSection('Existing entries to update', summary.updated, 'No existing entries will be changed.'),
        commitDetailSection('Existing entries unchanged', summary.unchanged, 'No unchanged existing entries.'),
        commitDetailSection('Existing entries removed from organization', summary.removed, 'No existing entries are removed.'),
      ].join('');
    }
    panel.querySelectorAll('[data-commit-tab]').forEach((button) => button.addEventListener('click', () => {
      const tab = button.dataset.commitTab || 'summary';
      panel.querySelectorAll('[data-commit-tab]').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-selected', String(active));
      });
      panel.querySelectorAll('[data-commit-panel]').forEach((candidate) => { candidate.hidden = candidate.dataset.commitPanel !== tab; });
    }));

    const developerToolsDock = document.getElementById('developerToolsDock');
    const developerToolsWasVisible = Boolean(developerToolsDock && !developerToolsDock.classList.contains('d-none'));
    const ctxButton = panel.querySelector('[data-commit-confirm-ctx]');
    if (ctxButton instanceof HTMLButtonElement) {
      ctxButton.hidden = !developerToolsWasVisible;
      ctxButton.addEventListener('click', () => {
        developerToolsDock?.classList.add('is-popup-inspection');
        window.ManatOS?.shell?.setDeveloperToolTab?.('ctx', false);
        window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', { detail: { path: pagePath, expand: true } }));
      });
    }

    backdrop.append(fragment);
    document.body.append(backdrop);
    const cancel = () => { developerToolsDock?.classList.remove('is-popup-inspection'); backdrop.remove(); };
    panel.querySelectorAll('[data-commit-confirm-cancel]').forEach((button) => button.addEventListener('click', cancel));
    // Universal ManatOS popup rule: backdrop clicks never dismiss a popup.
    panel.querySelector('[data-commit-confirm-accept]')?.addEventListener('click', () => {
      cancel();
      commitWorkspace();
    });
    panel.querySelector('[data-commit-confirm-accept]')?.focus();
  };

  const commitWorkspace = async () => {
    if (!(hierarchyCommit instanceof HTMLButtonElement) || hierarchyCommit.disabled || draft) return;
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    hierarchyCommit.disabled = true;
    hierarchyCommit.dataset.busy = 'true';
    try {
      const response = await fetch(`/bo/${encodeURIComponent(entityKey)}/hierarchy/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _csrf: csrf,
          identityField: idField,
          entries: entries(),
          entriesOriginal: originalEntries(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true) throw new Error(payload?.message || 'Organization commit failed.');
      // Persistence succeeded: clear every compatible Create Organization draft
      // before leaving so the next create workflow starts genuinely empty.
      clearCreateWorkspaceDrafts();
      savedDraftSignature = null;
      savedDraftAt = null;
      // Commit is the terminal action for both Create and Edit Organization.
      // Return to the owning entity list rather than reopening the committed graph.
      window.location.assign(workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`);
    } catch (error) {
      hierarchyCommit.disabled = false;
      window.alert(error instanceof Error ? error.message : 'Organization commit failed.');
    } finally {
      delete hierarchyCommit.dataset.busy;
    }
  };

  hierarchyClose?.addEventListener('click', closeWorkspace);
  hierarchyEditExit?.addEventListener('click', exitEditWorkspace);
  hierarchySaveDraft?.addEventListener('click', () => saveWorkspaceDraft());
  hierarchyClearAll?.addEventListener('click', confirmClearAllWorkspace);
  hierarchyCommit?.addEventListener('click', confirmCommitWorkspace);

  component.addEventListener('manatos:hierarchy-command', (event) => {
    const { command, memberId, candidateId, relation } = event.detail || {};
    if (command === 'delete') removeNode(memberId);
    else if (command === 'clear-parent') clearParent(memberId);
    else if (command === 'move') moveNode(memberId, event.detail?.targetId);
    else if (['add-first', 'add-child', 'add-sibling', 'add-parent'].includes(command)) beginQuick(command, memberId);
    else if (['use-existing-parent', 'use-existing-sibling', 'use-existing-child'].includes(command)) relateExistingNode(command, memberId, event.detail?.candidateId);
    else if (command === 'choose-existing-entry') openExistingEntrySelector(memberId, relation || 'sibling');
    else if (command === 'open' && typeof memberId === 'string') {
      /*
       * Owner-aware full record editing. The selected record and the complete
       * owner working set are posted to the UI route; the route renders the same
       * metadata-driven entry page without issuing an entity-record GET.
       */
      event.preventDefault?.();
      const row = find(memberId);
      if (!row) return;
      setRuntimeValue(`${pagePath}.fields.focusedMemberId.value`, memberId, 'focus-member');

      const fieldValues = {};
      const ownerFields = runtime.resolve(`${pagePath}.fields`);
      if (ownerFields && typeof ownerFields === 'object') {
        for (const [key, field] of Object.entries(ownerFields)) fieldValues[key] = field?.value;
      }
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const form = document.createElement('form');
      form.method = 'post';
      form.action = `/bo/${encodeURIComponent(entityKey)}/owned-entry/${encodeURIComponent(memberId)}`;
      form.hidden = true;
      const append = (name, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.append(input);
      };
      append('_csrf', csrf);
      append('_ownerEntries', JSON.stringify(entries()));
      append('_ownerEntriesOriginal', JSON.stringify(originalEntries()));
      append('_ownerFields', JSON.stringify(fieldValues));
      append('_ownerName', String(page?.name || 'organization'));
      append('_ownerKind', String(page?.kind || 'sysbo-hierarchy'));
      append('_ownerMode', String(page?.mode || 'edit'));
      append('_ownerIdentityField', idField);
      document.body.append(form);
      form.submit();
    }
  });

  quick.addEventListener('input', () => { refreshQuickState(); if (draft) refreshProvisionalLabel(); });
  quick.addEventListener('change', () => { refreshQuickState(); if (draft) refreshProvisionalLabel(); });
  quick.querySelector('[data-record-quick-cancel]')?.addEventListener('click', cancelQuick);
  quickSave?.addEventListener('click', saveQuick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && draft) {
      event.preventDefault();
      cancelQuick();
    }
  });
  window.addEventListener(runtime.eventName || 'manatos:ctx-change', () => {
    refreshWorkspaceSummary();
    if (draft) requestAnimationFrame(positionQuick);
  });
  if (draftSupported) restoreWorkspaceDraft();
  refreshWorkspaceSummary();
  refreshQuickState();
})();
