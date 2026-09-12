(async () => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  const workspace = document.querySelector('[data-metadata-hierarchy-workspace]');
  if (!runtime || !(workspace instanceof HTMLElement)) return;

  const component = workspace.querySelector('[data-metadata-component="hierarchy-tree"]');
  const quickHost = workspace.querySelector('[data-hierarchy-record-quick-host]');
  const quick = quickHost?.querySelector('[data-record-quick]');
  if (
    !(component instanceof HTMLElement) ||
    !(quickHost instanceof HTMLElement) ||
    !(quick instanceof HTMLElement)
  )
    return;

  const quickSave = quick.querySelector('[data-record-quick-commit]');
  const quickState = quick.querySelector('[data-record-quick-state]');

  const activeUiLevelPath = () => {
    let node = runtime.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };
  const pagePath = activeUiLevelPath();
  if (!pagePath) return;
  const page = runtime.resolve(pagePath);
  const workspaceValue = (key, fallback = null) => {
    const facts = runtime.resolve(`${pagePath}.resources.workspace`);
    return facts?.[key] ?? fallback;
  };
  const workspaceValuePath = (key) => `${pagePath}.resources.workspace.${key}`;
  const entriesPath = `${pagePath}.list.entries`;
  const originalEntriesPath = `${pagePath}.list.originalEntries`;

  const idField = String(workspaceValue('identityField', 'id'));
  const parentField = String(workspaceValue('parentField', ''));
  const componentOptions = (() => {
    try {
      const parsed = JSON.parse(component.dataset.metadataComponentOptions || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  })();
  const entryRepresentation =
    componentOptions.entryRepresentation && typeof componentOptions.entryRepresentation === 'object'
      ? componentOptions.entryRepresentation
      : {};
  const entryNameField = String(
    entryRepresentation.name?.field ||
      (entryRepresentation.name?.expression &&
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryRepresentation.name.expression)
        ? entryRepresentation.name.expression
        : '') ||
      componentOptions.labelField ||
      'name',
  );
  const labelField = entryNameField;
  const entityLabel = String(componentOptions.entityLabel || 'entry');
  const rootField = String(workspaceValue('rootField', componentOptions.rootField ?? ''));
  const entityKey = String(component.dataset.entityKey || '');
  const entityContext = (() => {
    const registry = runtime.value?.entities;
    if (!registry || typeof registry !== 'object') return null;
    return Object.values(registry).find((candidate) => candidate?.key === entityKey) || null;
  })();
  const entityMetadata =
    entityContext?.metadata && typeof entityContext.metadata === 'object'
      ? entityContext.metadata
      : null;
  if (!parentField) return;

  const typeField = String(workspaceValue('typeField', componentOptions.typeField ?? ''));
  const containerTrait = String(
    workspaceValue('containerTrait', componentOptions.containerTrait ?? ''),
  );
  const canHaveParentTrait = String(
    workspaceValue('canHaveParentTrait', componentOptions.canHaveParentTrait ?? ''),
  );
  const rootEligibleTrait = String(
    workspaceValue('rootEligibleTrait', componentOptions.rootEligibleTrait ?? ''),
  );
  const standAloneEligibleTrait = String(
    workspaceValue('standAloneEligibleTrait', componentOptions.standAloneEligibleTrait ?? ''),
  );
  const createHierarchyWorkspaceModel = window.ManatOS?.createHierarchyWorkspaceModel;
  if (typeof createHierarchyWorkspaceModel !== 'function')
    throw new Error('Hierarchy workspace model service is unavailable.');
  const hierarchyModel = createHierarchyWorkspaceModel({
    idField,
    parentField,
    rootField,
    typeField,
    rootEligibleTrait,
    standAloneEligibleTrait,
    entityMetadata,
  });

  const entryResolver = window.ManatOS?.entryRepresentation;
  await entryResolver?.prepare?.(entryRepresentation);
  const entryOwnerPath = (row) => {
    if (!row || typeof row !== 'object') return null;
    const values = runtime.resolve(entriesPath);
    if (!Array.isArray(values)) return null;
    const rowId = row?.[idField];
    const index = values.findIndex(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        (candidate === row || String(candidate?.[idField] ?? '') === String(rowId ?? '')),
    );
    return index >= 0 ? `${entriesPath}[${index}]` : null;
  };
  const resolveEntryName = (row) => {
    if (!row) return '';
    if (entryResolver?.resolve) {
      return entryResolver.resolve(entryRepresentation, row, {
        metadata: entityMetadata,
        entityIcon: componentOptions.entityIcon,
        fallbackName: row?.[labelField] ?? '',
        ownerPath: entryOwnerPath(row),
      }).name;
    }
    return String(row?.[labelField] ?? '');
  };

  let draft = null;
  let savedDraftSignature = null;
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

  const entries = () => {
    const value = runtime.resolve(entriesPath);
    return Array.isArray(value) ? value : [];
  };

  /*
   * The hierarchy owns the parent relationship. The sibling model service keeps
   * graph calculations presentation-neutral while this shell owns CTX mutation.
   */
  const withCalculatedHierarchy = (rows) => hierarchyModel.withCalculatedHierarchy(rows);

  const replaceEntries = (next, action) =>
    runtime.replace(entriesPath, withCalculatedHierarchy(next), {
      source: 'hierarchy-workspace',
      action,
      triggerPath: entriesPath,
    });

  const fieldEmptyValue = (field) => {
    if (!field || typeof field !== 'object') return null;
    if (field.type === 'boolean') return false;
    if (field.type === 'string' || field.type === 'email' || field.type === 'version') return '';
    return null;
  };

  const staticDefault = (_key, field) => {
    const candidate = field?.createDefaultValue;
    if (candidate === null || ['string', 'number', 'boolean'].includes(typeof candidate))
      return candidate;
    return fieldEmptyValue(field);
  };

  const completeDraftRecord = (draftId) => {
    const result = {};
    const definitions =
      entityMetadata?.fieldDefinition && typeof entityMetadata.fieldDefinition === 'object'
        ? entityMetadata.fieldDefinition
        : {};
    for (const [key, field] of Object.entries(definitions)) {
      if (!field || typeof field !== 'object' || field.sensitive === true) continue;
      result[key] = key === idField ? draftId : staticDefault(key, field);
    }
    result[idField] = draftId;
    return result;
  };
  const makeDraftId = () =>
    `draft:${crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const find = (id) => entries().find((row) => String(row?.[idField]) === String(id));

  const hierarchyCompletion = (rows) => hierarchyModel.completion(rows);

  const originalEntries = () => {
    const value = runtime.resolve(originalEntriesPath);
    return Array.isArray(value) ? value : [];
  };

  const replaceOriginalEntries = (next, action) => {
    runtime.replace(
      originalEntriesPath,
      next.map((entry) => ({ ...entry })),
      {
        source: 'hierarchy-workspace',
        action,
        triggerPath: originalEntriesPath,
      },
    );
  };

  const workspaceDirty = (rows = entries()) => !hierarchyModel.sameRows(rows, originalEntries());

  /*
   * Relationship placement is isolated from workspace UI orchestration. This
   * service owns graph mutations/eligibility while CTX storage remains here.
   */
  const createHierarchyRelationshipRuntime = window.ManatOS?.createHierarchyRelationshipRuntime;
  if (typeof createHierarchyRelationshipRuntime !== 'function')
    throw new Error('Hierarchy relationship runtime service is unavailable.');
  const hierarchyRelationships = createHierarchyRelationshipRuntime({
    runtime,
    pagePath,
    workspace,
    entityContext,
    entityMetadata,
    entityLabel,
    idField,
    parentField,
    typeField,
    containerTrait,
    canHaveParentTrait,
    rootEligibleTrait,
    standAloneEligibleTrait,
    entries,
    originalEntries,
    replaceEntries,
    replaceOriginalEntries,
    find,
    resolveEntryName,
    isEditing: () => Boolean(draft),
  });

  const setRuntimeValue = (path, value, action) => {
    if (runtime.resolve(path) === value) return;
    runtime.replace(path, value, { source: 'hierarchy-workspace', action, triggerPath: path });
  };

  const workspaceDraftSignature = (rows = entries()) =>
    JSON.stringify(rows.map((row) => ({ ...row })));

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
    setRuntimeValue(
      workspaceValuePath('draftStatus'),
      changedSinceDraft ? 'modified-after-draft' : 'saved',
      'hierarchy-draft-status',
    );
    setRuntimeValue(
      `${pagePath}.control.state.draftDirty`,
      changedSinceDraft,
      'hierarchy-draft-dirty',
    );
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

    if (memberCount instanceof HTMLElement)
      memberCount.textContent = `${rows.length} ${rows.length === 1 ? 'member' : 'members'}`;
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
    const matchesSavedDraft =
      Boolean(savedDraftSignature) && workspaceDraftSignature(rows) === savedDraftSignature;
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
      hierarchyEditExit.title = dirty
        ? 'Discard the current organization changes and close.'
        : 'Close this organization.';
      hierarchyEditExit.disabled = Boolean(draft);
    }
    if (hierarchyCommit instanceof HTMLButtonElement) {
      hierarchyCommit.disabled = !state.complete || !dirty || Boolean(draft);
      hierarchyCommit.title = draft
        ? 'Finish or cancel the current inline edit first.'
        : !state.complete
          ? state.reason || 'Complete the hierarchy before committing.'
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
    setRuntimeValue(
      workspaceValuePath('hierarchyStatus'),
      state.complete ? 'complete' : 'incomplete',
      'hierarchy-status',
    );
    setRuntimeValue(workspaceValuePath('finalizable'), state.complete, 'hierarchy-finalizable');
    setRuntimeValue(`${pagePath}.control.state.valid`, state.complete, 'hierarchy-valid');
    setRuntimeValue(`${pagePath}.control.state.dirty`, dirty, 'hierarchy-dirty');
    setRuntimeValue(`${pagePath}.control.state.blocked`, Boolean(draft), 'hierarchy-blocked');
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
      if (!(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ))
        return;
      result[control.name] =
        control instanceof HTMLInputElement && control.type === 'checkbox'
          ? control.checked
          : control.value;
    });
    return result;
  };

  const quickIsComplete = () =>
    [...quick.querySelectorAll('[name]')]
      .filter(
        (control) =>
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement,
      )
      .every(
        (control) =>
          control.disabled ||
          typeof control.checkValidity !== 'function' ||
          control.checkValidity(),
      );

  const quickIsDirty = () => {
    if (!quickBaseline) return false;
    return JSON.stringify(quickValues()) !== JSON.stringify(quickBaseline);
  };

  const refreshQuickState = () => {
    const dirty = quickIsDirty();
    const complete = quickIsComplete();
    if (quickSave instanceof HTMLButtonElement) quickSave.disabled = !(draft && dirty && complete);
    if (quickState instanceof HTMLElement) {
      quickState.textContent = !dirty
        ? 'No changes'
        : complete
          ? 'Ready'
          : 'Complete required fields';
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
      ? component.querySelector(
          `[data-hierarchy-node-id="${CSS.escape(draft.targetId)}"] .metadata-hierarchy-node-row`,
        )
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
      const option = hierarchyRelationships.enumOptionFor(current);
      if (option?.[containerTrait] !== true) return;
    }
    const id = makeDraftId();
    const row = {
      ...completeDraftRecord(id),
      [idField]: id,
      [parentField]: null,
      ...(rootField ? { [rootField]: null } : {}),
    };
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
      entries()
        .filter((entry) => String(entry?.[idField] ?? '') !== String(cancelledId))
        .map((entry) => ({ ...entry })),
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
    let next = entries().map((entry) =>
      String(entry?.[idField] ?? '') === String(id)
        ? { ...active.row, ...entry, ...values, [idField]: id }
        : { ...entry },
    );
    if (active.command === 'add-parent' && active.targetId) {
      next = next.map((entry) =>
        String(entry[idField]) === active.targetId ? { ...entry, [parentField]: id } : entry,
      );
    }
    finishQuickUi();
    replaceEntries(next, 'save-quick');
  };

  const metaValue = (name, fallback) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || fallback;
  const userId = metaValue('manatos-user-id', 'anonymous');
  const hierarchyMode = String(page?.control?.mode ?? 'create');
  const focusedMemberId = String(workspaceValue('focusedMemberId', '')) || '';
  const hierarchyRootIdentity = String(workspaceValue('hierarchyRootId', '')) || focusedMemberId;
  /*
   * Draft storage is isolated from workspace DOM/state orchestration. The store
   * owns browser key compatibility/migration; this shell owns semantic CTX data.
   */
  const createHierarchyDraftStore = window.ManatOS?.createHierarchyDraftStore;
  if (typeof createHierarchyDraftStore !== 'function')
    throw new Error('Hierarchy draft store service is unavailable.');
  const hierarchyDraftStore = createHierarchyDraftStore({
    userId,
    entityKey,
    hierarchyMode,
    hierarchyRootIdentity,
  });
  const draftSupported = hierarchyDraftStore.supported;

  const compatibleDraftPayload = (candidate) => hierarchyDraftStore.compatiblePayload(candidate);
  const storedDraftCandidates = () => hierarchyDraftStore.candidates();

  const saveWorkspaceDraft = () => {
    if (!draftSupported || draft) return false;
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      entries: entries().map((row) => ({ ...row })),
      entriesOriginal: originalEntries().map((row) => ({ ...row })),
    };
    const saved = hierarchyDraftStore.save(payload);
    if (!saved) {
      if (hierarchyDraftStatus instanceof HTMLElement) {
        hierarchyDraftStatus.textContent = 'Draft could not be saved in this browser';
        hierarchyDraftStatus.hidden = false;
      }
      return false;
    }
    savedDraftSignature = payload.entries.length ? workspaceDraftSignature(payload.entries) : null;
    refreshWorkspaceSummary();
    return true;
  };

  const clearCreateWorkspaceDrafts = () => hierarchyDraftStore.clearCreateDrafts();

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
        commitDetailSection(
          'Persisted entries removed from the working organization',
          summary.persistedEntries,
          'No persisted entries are currently included.',
        ),
        `<section class="mb-3"><div class="fw-semibold mb-1">Saved Create Organization draft</div><div class="small text-secondary">${summary.savedDraftPresent ? 'The saved browser draft for this Create Organization workspace will be deleted.' : 'No saved browser draft currently exists.'}</div></section>`,
        '<div class="alert alert-info py-2 mb-0"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>No persisted Principal is deleted or modified in application storage/database by Clear all.</div>',
      ].join('');
    }

    panel.querySelectorAll('[data-clear-all-tab]').forEach((button) =>
      button.addEventListener('click', () => {
        const tab = button.dataset.clearAllTab || 'summary';
        panel.querySelectorAll('[data-clear-all-tab]').forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle('active', active);
          candidate.setAttribute('aria-selected', String(active));
        });
        panel.querySelectorAll('[data-clear-all-panel]').forEach((candidate) => {
          candidate.hidden = candidate.dataset.clearAllPanel !== tab;
        });
      }),
    );

    const developerToolsDock = document.getElementById('developerToolsDock');
    const popupRuntime = window.ManatOS?.popup?.runtime;
    const developerToolsWasVisible = Boolean(
      developerToolsDock && !developerToolsDock.classList.contains('d-none'),
    );
    const ctxButton = panel.querySelector('[data-clear-all-confirm-ctx]');
    if (ctxButton instanceof HTMLButtonElement) {
      ctxButton.hidden = !developerToolsWasVisible;
      ctxButton.setAttribute('aria-pressed', 'false');
      ctxButton.addEventListener('click', () => {
        popupRuntime?.toggleInspection?.({
          path: pagePath,
          button: ctxButton,
        });
      });
    }

    backdrop.append(fragment);
    document.body.append(backdrop);
    const cancel = () => {
      popupRuntime?.clearInspection?.(ctxButton);
      backdrop.remove();
    };
    panel
      .querySelectorAll('[data-clear-all-confirm-cancel]')
      .forEach((button) => button.addEventListener('click', cancel));
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
      } catch {
        /* Ignore an unreadable historical draft; never block the page. */
      }
    }
    if (!best) return false;

    const payload = best.payload;
    replaceEntries(
      payload.entries.map((row) => ({ ...row })),
      'restore-workspace-draft',
    );
    if (Array.isArray(payload.entriesOriginal)) {
      replaceOriginalEntries(
        payload.entriesOriginal.map((row) => ({ ...row })),
        'restore-workspace-draft-original',
      );
    }
    hierarchyRelationships.hydrateMissingOriginalSnapshots();
    savedDraftSignature = workspaceDraftSignature(payload.entries);

    // Migrate a recognized legacy draft to the stable key, but leave the old
    // copy untouched until a successful Commit clears the working draft.
    if (best.key !== hierarchyDraftStore.storageKey) {
      hierarchyDraftStore.save({
        version: 1,
        savedAt: payload.savedAt || new Date().toISOString(),
        entries: payload.entries,
        entriesOriginal: payload.entriesOriginal || originalEntries(),
      });
    }
    return true;
  };

  const closeWorkspace = () => {
    if (draft) return;
    const rows = entries();
    const matchesSavedDraft =
      Boolean(savedDraftSignature) && workspaceDraftSignature(rows) === savedDraftSignature;
    const saved = matchesSavedDraft || saveWorkspaceDraft();
    if (!saved && rows.length) return;
    window.location.assign(
      workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`,
    );
  };

  const exitEditWorkspace = () => {
    if (draft) return;
    window.location.assign(
      workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`,
    );
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
      if (id.startsWith('draft:')) {
        created.push(row);
        continue;
      }
      const baseline = originalById.get(id);
      if (!baseline) {
        updated.push(row);
        continue;
      }
      (JSON.stringify({ ...row }) !== JSON.stringify({ ...baseline }) ? updated : unchanged).push(
        row,
      );
    }
    const removed = original.filter((row) => {
      const id = String(row?.[idField] ?? '');
      return id && !currentIds.has(id);
    });
    return { created, updated, unchanged, removed, total: current.length };
  };

  const commitEscape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  const commitDetailSection = (title, rows, emptyText) => {
    const items = rows
      .map(
        (row) =>
          `<li class="list-group-item d-flex justify-content-between align-items-center gap-3"><span>${commitEscape(resolveEntryName(row) || row?.[idField] || 'Entry')}</span><code class="small text-secondary">${commitEscape(row?.[idField] || '')}</code></li>`,
      )
      .join('');
    return `<section class="mb-3"><div class="fw-semibold mb-1">${commitEscape(title)} <span class="badge text-bg-secondary">${rows.length}</span></div>${items ? `<ul class="list-group list-group-flush border rounded">${items}</ul>` : `<div class="small text-secondary">${commitEscape(emptyText)}</div>`}</section>`;
  };

  const confirmCommitWorkspace = () => {
    if (!(hierarchyCommit instanceof HTMLButtonElement) || hierarchyCommit.disabled || draft)
      return;
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
        commitDetailSection(
          'Existing entries to update',
          summary.updated,
          'No existing entries will be changed.',
        ),
        commitDetailSection(
          'Existing entries unchanged',
          summary.unchanged,
          'No unchanged existing entries.',
        ),
        commitDetailSection(
          'Existing entries removed from organization',
          summary.removed,
          'No existing entries are removed.',
        ),
      ].join('');
    }
    panel.querySelectorAll('[data-commit-tab]').forEach((button) =>
      button.addEventListener('click', () => {
        const tab = button.dataset.commitTab || 'summary';
        panel.querySelectorAll('[data-commit-tab]').forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle('active', active);
          candidate.setAttribute('aria-selected', String(active));
        });
        panel.querySelectorAll('[data-commit-panel]').forEach((candidate) => {
          candidate.hidden = candidate.dataset.commitPanel !== tab;
        });
      }),
    );

    const developerToolsDock = document.getElementById('developerToolsDock');
    const popupRuntime = window.ManatOS?.popup?.runtime;
    const developerToolsWasVisible = Boolean(
      developerToolsDock && !developerToolsDock.classList.contains('d-none'),
    );
    const ctxButton = panel.querySelector('[data-commit-confirm-ctx]');
    if (ctxButton instanceof HTMLButtonElement) {
      ctxButton.hidden = !developerToolsWasVisible;
      ctxButton.setAttribute('aria-pressed', 'false');
      ctxButton.addEventListener('click', () => {
        popupRuntime?.toggleInspection?.({
          path: pagePath,
          button: ctxButton,
        });
      });
    }

    backdrop.append(fragment);
    document.body.append(backdrop);
    const cancel = () => {
      popupRuntime?.clearInspection?.(ctxButton);
      backdrop.remove();
    };
    panel
      .querySelectorAll('[data-commit-confirm-cancel]')
      .forEach((button) => button.addEventListener('click', cancel));
    // Universal ManatOS popup rule: backdrop clicks never dismiss a popup.
    panel.querySelector('[data-commit-confirm-accept]')?.addEventListener('click', () => {
      cancel();
      commitWorkspace();
    });
    panel.querySelector('[data-commit-confirm-accept]')?.focus();
  };

  const commitWorkspace = async () => {
    if (!(hierarchyCommit instanceof HTMLButtonElement) || hierarchyCommit.disabled || draft)
      return;
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    hierarchyCommit.disabled = true;
    hierarchyCommit.dataset.busy = 'true';
    try {
      const response = await fetch(`/bo/${encodeURIComponent(entityKey)}/hierarchy/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-ManatOS-Application-Command': '1',
        },
        body: JSON.stringify({
          _csrf: csrf,
          identityField: idField,
          entries: entries(),
          entriesOriginal: originalEntries(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true) {
        window.ManatOS?.errors?.fromResponse?.(response, payload, {
          retry: () => commitWorkspace(),
        });
        const failure = new Error(
          payload?.error?.message || payload?.message || 'Organization commit failed.',
        );
        failure.manatosPresented = true;
        throw failure;
      }
      // Persistence succeeded: clear every compatible Create Organization draft
      // before leaving so the next create workflow starts genuinely empty.
      clearCreateWorkspaceDrafts();
      savedDraftSignature = null;
      // Commit is the terminal action for both Create and Edit Organization.
      // Return to the owning entity list rather than reopening the committed graph.
      window.location.assign(
        workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`,
      );
    } catch (error) {
      hierarchyCommit.disabled = false;
      if (error?.manatosPresented !== true) {
        window.ManatOS?.errors?.present?.(
          {
            code: 'HIERARCHY_COMMIT_FAILED',
            message: error instanceof Error ? error.message : String(error),
            userMessage: error instanceof Error ? error.message : 'Organization commit failed.',
            retryable: true,
          },
          { retry: () => commitWorkspace() },
        );
      }
    } finally {
      delete hierarchyCommit.dataset.busy;
    }
  };

  if (pagePath && window.ManatOS?.uiHost?.registerRecoveryAdapter) {
    window.ManatOS.uiHost.registerRecoveryAdapter(pagePath, {
      getUserChanges() {
        if (!workspaceDirty()) return null;
        return {
          format: 'hierarchy-commit-v1',
          identityField: idField,
          entries: entries().map((row) => ({ ...row })),
          entriesOriginal: originalEntries().map((row) => ({ ...row })),
        };
      },
      applyUserChanges(changes) {
        if (!changes || changes.format !== 'hierarchy-commit-v1' || !Array.isArray(changes.entries))
          return false;
        replaceEntries(
          changes.entries.map((row) => ({ ...row })),
          'workspace-recovery',
        );
        if (Array.isArray(changes.entriesOriginal)) {
          replaceOriginalEntries(
            changes.entriesOriginal.map((row) => ({ ...row })),
            'workspace-recovery-original',
          );
        }
        refreshWorkspaceSummary();
        return true;
      },
      async prepareGentleClose() {
        replaceOriginalEntries(
          entries().map((row) => ({ ...row })),
          'workspace-recovery-gentle-close',
        );
        setRuntimeValue(
          `${pagePath}.control.state.dirty`,
          false,
          'workspace-recovery-gentle-close',
        );
        refreshWorkspaceSummary();
        await Promise.resolve();
        return true;
      },
    });
  }

  hierarchyClose?.addEventListener('click', closeWorkspace);
  hierarchyEditExit?.addEventListener('click', exitEditWorkspace);
  hierarchySaveDraft?.addEventListener('click', () => saveWorkspaceDraft());
  hierarchyClearAll?.addEventListener('click', confirmClearAllWorkspace);
  hierarchyCommit?.addEventListener('click', confirmCommitWorkspace);

  component.addEventListener('manatos:hierarchy-command', (event) => {
    const { command, memberId, relation } = event.detail || {};
    if (command === 'delete') hierarchyRelationships.removeNode(memberId);
    else if (command === 'clear-parent') hierarchyRelationships.clearParent(memberId);
    else if (command === 'move') hierarchyRelationships.moveNode(memberId, event.detail?.targetId);
    else if (['add-first', 'add-child', 'add-sibling', 'add-parent'].includes(command))
      beginQuick(command, memberId);
    else if (
      ['use-existing-parent', 'use-existing-sibling', 'use-existing-child'].includes(command)
    )
      hierarchyRelationships.relateExistingNode(command, memberId, event.detail?.candidateId);
    else if (command === 'choose-existing-entry')
      hierarchyRelationships.openExistingEntrySelector(memberId, relation || 'sibling');
    else if (command === 'open' && typeof memberId === 'string') {
      /*
       * Owner-aware full record editing. The selected record and the complete
       * owner working set are posted to the UI route; the route renders the same
       * metadata-driven entry page without issuing an entity-record GET.
       */
      event.preventDefault?.();
      const row = find(memberId);
      if (!row) return;
      setRuntimeValue(workspaceValuePath('focusedMemberId'), memberId, 'focus-member');

      const fieldValues = {
        ...(runtime.resolve(`${pagePath}.resources.workspace`) || {}),
      };
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
      append('_ownerName', String(page?.control?.name || 'organization'));
      append('_ownerKind', String(page?.control?.kind || 'sysbo-hierarchy'));
      append('_ownerMode', String(page?.control?.mode || 'edit'));
      append('_ownerIdentityField', idField);
      document.body.append(form);
      form.submit();
    }
  });

  quick.addEventListener('input', () => {
    refreshQuickState();
    if (draft) refreshProvisionalLabel();
  });
  quick.addEventListener('change', () => {
    refreshQuickState();
    if (draft) refreshProvisionalLabel();
  });
  quick.querySelector('[data-record-quick-cancel]')?.addEventListener('click', cancelQuick);
  quickSave?.addEventListener('click', saveQuick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && draft) {
      event.preventDefault();
      cancelQuick();
    }
  });
  runtime.trackSubscriber?.('*', { kind: 'hierarchy', label: 'Hierarchy workspace' });
  window.addEventListener(runtime.eventName || 'manatos:ctx-change', () => {
    refreshWorkspaceSummary();
    if (draft) requestAnimationFrame(positionQuick);
  });
  if (draftSupported) restoreWorkspaceDraft();
  refreshWorkspaceSummary();
  refreshQuickState();
})();
