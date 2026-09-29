(async () => {
  'use strict';

  const runtime = window.ManatOS?.ctx;
  const workspace = document.querySelector('[data-metadata-hierarchy-workspace]');
  if (!runtime || !(workspace instanceof HTMLElement)) return;

  const component = workspace.querySelector('[data-metadata-component="hierarchy-tree"]');
  if (!(component instanceof HTMLElement)) return;

  const pagePath = runtime.leafUiLevelPath?.();
  if (!pagePath) return;

  // A PAGE UiLevel owns the complete workspace frame, including its shared
  // TitleBar. Reuse the same physical-root boundary as normal List pages rather
  // than narrowing hierarchy ownership to the content card.
  const pageRoot = workspace.closest('.workspace');
  if (pageRoot instanceof HTMLElement) {
    pageRoot.setAttribute('data-ui-level-root', '');
    pageRoot.dataset.ctxScopePath = pagePath;
  }
  workspace.removeAttribute('data-ui-level-root');
  workspace.dataset.ctxScopePath = pagePath;

  // runtime.resolve() consumes expression notation. Canonical CTX identities use
  // the `ctx...` form, so absolute reads must be translated to the `$...`
  // expression form. Passing `ctx.ui...` directly is a relative lookup for a
  // child named `ctx` and therefore resolves to undefined.
  const resolveCanonical = (path) =>
    runtime.resolve(path === 'ctx' ? '$' : `$.${String(path).replace(/^ctx\.?/, '')}`);

  const page = resolveCanonical(pagePath);
  if (!page) return;

  // Pin the reusable hierarchy component to the workspace surface. Without an
  // explicit scope, opening a nested popup can make the global leaf UI level the
  // popup and cause the hierarchy to resolve its sources from the wrong owner.
  component.dataset.ctxScopePath = pagePath;

  const workspaceValue = (key, fallback = null) => {
    const facts = resolveCanonical(`${pagePath}.data.resources.workspace`);
    return facts?.[key] ?? fallback;
  };
  const entriesPath = `${pagePath}.data.list.entries`;

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
    const values = resolveCanonical(entriesPath);
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
  let releaseInlineInputBlock = null;
  let releaseCommitInputBlock = null;
  let inlineInputBlocked = false;

  const blockInlineUserInput = () => {
    if (inlineInputBlocked) return;
    inlineInputBlocked = true;
    releaseInlineInputBlock = window.ManatOS?.uiHost?.setUserInputBlocked?.(
      pagePath,
      'hierarchy-inline-edit',
      true,
    );
  };
  const releaseInlineUserInput = () => {
    if (!inlineInputBlocked) return;
    inlineInputBlocked = false;
    releaseInlineInputBlock?.();
    releaseInlineInputBlock = null;
  };
  const memberCount = workspace.querySelector('[data-hierarchy-member-count]');
  const incompleteIndicator = workspace.querySelector('[data-hierarchy-incomplete]');
  const hierarchyName = workspace.querySelector('[data-hierarchy-name]');
  const hierarchyClose = workspace.querySelector('[data-hierarchy-close]');
  const hierarchyEditExit = workspace.querySelector('[data-hierarchy-edit-exit]');
  const hierarchyCommit = workspace.querySelector('[data-hierarchy-commit]');
  const hierarchyCommitMenuToggle = workspace.querySelector('[data-hierarchy-commit-menu-toggle]');
  const hierarchyCommitOptions = [...workspace.querySelectorAll('[data-hierarchy-commit-option]')];
  const hierarchyStateIndicator = workspace.querySelector('[data-hierarchy-state-indicator]');
  const hierarchyStateIcon = workspace.querySelector('[data-hierarchy-state-icon]');
  const hierarchyStateText = workspace.querySelector('[data-hierarchy-state-text]');
  const hierarchyDraftHelp = workspace.querySelector('[data-hierarchy-draft-help]');
  const hierarchyDraftStatus = workspace.querySelector('[data-hierarchy-draft-status]');
  const hierarchySaveDraft = workspace.querySelector('[data-hierarchy-save-draft]');
  const hierarchyClearAll = workspace.querySelector('[data-hierarchy-clear-all]');

  /*
   * Stage 21: canonical hierarchy CTX ownership is typed. This browser adapter
   * still owns orchestration while graph/relationship/draft behavior migrates,
   * but it no longer writes workspace aggregate paths directly.
   */
  const organizationSurfaceFactory = window.ManatOS?.organizationHierarchySurface;
  if (typeof organizationSurfaceFactory !== 'function')
    throw new Error('Typed Organization hierarchy surface is unavailable.');
  const organizationSurface = organizationSurfaceFactory(pagePath, {
    identityField: idField,
    normalizeEntries: (rows) => hierarchyModel.withCalculatedHierarchy(rows),
    rootField,
    relationship: {
      identityField: idField,
      parentField,
      typeField,
      containerTrait,
      canHaveParentTrait,
      rootEligibleTrait,
      standAloneEligibleTrait,
      typeOptions: typeField
        ? window.ManatOS?.enumItemsForField?.(entityMetadata?.fieldDefinition?.[typeField]) || []
        : [],
      resolveName: (row) => resolveEntryName(row),
    },
  });
  if (hierarchyEditExit instanceof HTMLButtonElement) {
    hierarchyEditExit.dataset.surfaceClosePath = pagePath;
    hierarchyEditExit.dataset.surfaceCloseHref =
      workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`;
  }
  const entries = () => organizationSurface.entries;
  const replaceEntries = (next, action) => organizationSurface.replaceEntries(next, action);

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

  const originalEntries = () => organizationSurface.originalEntries;
  const replaceOriginalEntries = (next, action) =>
    organizationSurface.replaceOriginalEntries(next, action);
  // Presentation consumes the canonical UiLevel dirty projection. Semantic dirty
  // evaluation is owned by the typed surface/runtime, not this browser adapter.
  const workspaceDirty = () => runtime?.get?.(`${pagePath}.state.dirty`) === true;

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
    organizationSurface,
    entries,
    find,
    resolveEntryName,
    isEditing: () => Boolean(draft),
  });

  const setRuntimeValue = (path, value, action) => {
    const workspacePrefix = `${pagePath}.data.resources.workspace.`;
    const statePrefix = `${pagePath}.state.`;
    if (path.startsWith(workspacePrefix)) {
      organizationSurface.setWorkspaceValue(path.slice(workspacePrefix.length), value, action);
      return;
    }
    if (path.startsWith(statePrefix)) {
      organizationSurface.setStateValue(path.slice(statePrefix.length), value, action);
      return;
    }
    throw new Error(`Organization hierarchy surface does not own CTX path: ${path}`);
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
      `${pagePath}.data.resources.workspace.draftStatus`,
      changedSinceDraft ? 'modified-after-draft' : 'saved',
      'hierarchy-draft-status',
    );
    setRuntimeValue(`${pagePath}.state.draftDirty`, changedSinceDraft, 'hierarchy-draft-dirty');
  };

  let workspaceDisposed = false;

  const refreshWorkspaceSummary = () => {
    // Lifecycle callbacks are released on manatos:ui-level-disposing before CTX
    // removal. A callback already queued in the same turn may still arrive; it
    // must retire with its owning UiLevel rather than writing into dead CTX.
    if (workspaceDisposed) return;
    const rows = entries();
    const state = hierarchyCompletion(rows);
    const dirty = workspaceDirty();
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
    // This surface's controls follow its canonical input-blocker state. A child popup
    // temporarily makes the owner UiLevel inactive, but that is presentation focus, not
    // a reason to leave the owner's controls disabled after the popup has returned.
    const userInputReady = runtime?.get?.(`${pagePath}.state.userInputReady`) !== false;
    if (hierarchyClose instanceof HTMLButtonElement) {
      hierarchyClose.disabled = !userInputReady;
      hierarchyClose.title = draft
        ? 'Finish or cancel the current inline edit first.'
        : matchesSavedDraft
          ? 'Close this workspace; the saved draft already matches it.'
          : rows.length
            ? 'Save the current workspace draft in this browser and close.'
            : 'Close this workspace.';
    }
    if (
      hierarchyStateIndicator instanceof HTMLElement &&
      hierarchyStateText instanceof HTMLElement
    ) {
      hierarchyStateIndicator.classList.remove(
        'text-secondary',
        'text-primary',
        'text-decoration-none',
      );
      hierarchyStateIndicator.classList.add(dirty ? 'text-primary' : 'text-secondary');
      hierarchyStateIndicator.classList.toggle('text-decoration-none', !dirty);
      hierarchyStateText.textContent = dirty ? 'Unsaved changes' : 'No changes';
      if (hierarchyStateIndicator instanceof HTMLButtonElement) {
        hierarchyStateIndicator.disabled = !dirty;
        hierarchyStateIndicator.title = dirty
          ? 'Review the current unsaved organization changes.'
          : 'No unsaved changes to review';
      }
      if (hierarchyStateIcon instanceof HTMLElement)
        hierarchyStateIcon.className = dirty
          ? 'bi bi-pencil-square me-1'
          : 'bi bi-check-circle me-1';
    }
    if (hierarchyEditExit instanceof HTMLButtonElement) {
      hierarchyEditExit.textContent = dirty ? 'Cancel' : 'Close';
      hierarchyEditExit.title = dirty
        ? 'Discard the current organization changes and close.'
        : 'Close this organization.';
      hierarchyEditExit.disabled = !userInputReady;
    }
    if (hierarchyCommit instanceof HTMLButtonElement) {
      const commitDisabled = !state.complete || !dirty || Boolean(draft);
      hierarchyCommit.disabled = commitDisabled;
      if (hierarchyCommitMenuToggle instanceof HTMLButtonElement)
        hierarchyCommitMenuToggle.disabled = commitDisabled;
      hierarchyCommitOptions.forEach((button) => {
        if (button instanceof HTMLButtonElement) button.disabled = commitDisabled;
      });
      hierarchyCommit.title = draft
        ? 'Finish or cancel the current inline edit first.'
        : !state.complete
          ? state.reason || 'Complete the hierarchy before committing.'
          : !dirty
            ? 'No changes to commit.'
            : 'Commit all organization members and relationships atomically.';
    }
    if (hierarchyDraftHelp instanceof HTMLElement) {
      // Create Organization is the deliberate normal-navigation draft exception.
      // The hint is useful only once the chart actually contains uncommitted work.
      hierarchyDraftHelp.hidden = hierarchyMode !== 'create' || rows.length === 0;
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
      `${pagePath}.data.resources.workspace.hierarchyStatus`,
      state.complete ? 'complete' : 'incomplete',
      'hierarchy-status',
    );
    setRuntimeValue(
      `${pagePath}.data.resources.workspace.finalizable`,
      state.complete,
      'hierarchy-finalizable',
    );
    setRuntimeValue(`${pagePath}.state.valid`, state.complete, 'hierarchy-valid');
    setRuntimeValue(`${pagePath}.state.blocked`, Boolean(draft), 'hierarchy-blocked');
  };

  const finishQuickUi = () => {
    draft = null;
    releaseInlineUserInput();
    delete component.dataset.hierarchyEditingId;
    workspace.classList.remove('is-quick-editing');
    refreshWorkspaceSummary();
  };

  const cancelQuick = () => {
    if (!draft) return;
    finishQuickUi();
  };

  const acceptQuickRecord = (record) => {
    if (!draft || !record || typeof record !== 'object') return false;
    const active = draft;
    const id = active.id;
    let next = entries().map((entry) =>
      String(entry?.[idField] ?? '') === String(id)
        ? { ...entry, ...record, [idField]: id }
        : { ...entry },
    );
    if (active.command === 'add-parent' && active.targetId) {
      next = next.map((entry) =>
        String(entry?.[idField] ?? '') === String(active.targetId)
          ? { ...entry, [parentField]: id }
          : entry,
      );
    }
    finishQuickUi();
    replaceEntries(next, 'save-quick');
    return true;
  };

  const quickPopupTitle = (command, current) => {
    const targetLabel = String(resolveEntryName(current) || '').trim();
    if (command === 'add-child' && targetLabel) return `Create ${entityLabel} under ${targetLabel}`;
    if (command === 'add-sibling' && targetLabel) return `Create ${targetLabel} sibling`;
    if (command === 'add-parent' && targetLabel) return `Create parent for ${targetLabel}`;
    return `Create ${entityLabel}`;
  };

  const openQuickPopup = (activeDraft, current) => {
    const entryOpening = window.ManatOS?.entryOpening;
    if (!entryOpening?.open) throw new Error('Canonical entry opener is unavailable.');

    const relation = activeDraft.command.replace('add-', '');
    const allowedTypeValues = organizationSurface.allowedTypeValuesForNewMember(
      activeDraft.targetId,
      relation,
    );

    const callerRules = entryOpening.composeCallerRules?.(
      { fixedValues: { [parentField]: { value: activeDraft.row[parentField] ?? null } } },
      activeDraft,
    ) || { defaults: {}, uiOverrides: {} };

    return entryOpening.open({
      host: 'popup',
      target: { entityKey },
      title: quickPopupTitle(activeDraft.command, current),
      mode: 'create',
      purpose: 'hierarchy-quick-entry',
      uiViewKey: 'quick',
      behavior: { recoverable: false },
      caller: { workspaceOwned: true },
      rules: {
        defaults: { ...callerRules.defaults, [idField]: activeDraft.id },
        uiOverrides: {
          ...callerRules.uiOverrides,
          [typeField]: {
            ...(callerRules.uiOverrides?.[typeField] || {}),
            allowedValues: allowedTypeValues,
          },
        },
      },
      presentation: {
        layout: 'quick',
        entryDensity: 'compact',
        autoCloseOnBackdrop: true,
        anchorToTrigger: true,
      },
      onSaved: (result) => {
        const ownerAccepted = result?.metadata?.ownerAccepted === true;
        if (ownerAccepted) {
          if (activeDraft.command === 'add-parent' && activeDraft.targetId)
            organizationSurface.reparentMember(
              activeDraft.targetId,
              activeDraft.id,
              'relate-new-parent',
            );
          finishQuickUi();
          return;
        }
        if (!acceptQuickRecord(result?.record) && draft?.id === activeDraft.id) cancelQuick();
      },
      onClose: (result) => {
        if (result?.outcome !== 'saved' && draft?.id === activeDraft.id) cancelQuick();
      },
    });
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
    if (current)
      row[parentField] = organizationSurface.parentForNewMember(
        String(current[idField]),
        command.replace('add-', ''),
      );

    draft = {
      id,
      command,
      targetId: current ? String(current[idField]) : null,
      row,
    };

    // A new owned Entry initializes in its own canonical Entry #data. The owner
    // remains untouched until explicit Save accepts the child through its provider.
    component.dataset.hierarchyEditingId = id;
    workspace.classList.add('is-quick-editing');
    blockInlineUserInput();
    refreshWorkspaceSummary();

    const opened = openQuickPopup(draft, current);
    if (!opened) cancelQuick();
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
      version: 2,
      savedAt: new Date().toISOString(),
      entries: entries().map((row) => ({ ...row })),
      entriesOriginal: originalEntries().map((row) => ({ ...row })),
      // Persist the generic semantic transaction graph as well as the hierarchy
      // rows. Future related entity editors can participate without adding
      // entity-specific draft properties to Organization.
      workspaceTransaction: organizationSurface.transactionSnapshot(),
      recycleBin: organizationSurface.recycleBin.map((row) => ({ ...row })),
      runtimeResources: organizationSurface.runtimeResourceSnapshot(),
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
    organizationSurface.replaceTransaction({ version: 1, mutations: [] }, 'clear-all-transaction');
    organizationSurface.replaceRecycleBin([], 'clear-all-recycle-bin');
    refreshWorkspaceSummary();
  };

  const clearAllDetailSection = (title, rows, emptyText) => {
    const section = document.createElement('section');
    section.className = 'mb-3';
    const heading = document.createElement('div');
    heading.className = 'fw-semibold mb-1';
    heading.textContent = title;
    section.append(heading);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'small text-secondary';
      empty.textContent = emptyText;
      section.append(empty);
      return section.outerHTML;
    }
    const list = document.createElement('ul');
    list.className = 'small mb-0';
    for (const row of rows) {
      const item = document.createElement('li');
      item.textContent = String(
        row?.name || row?.userName || row?.email || row?.[idField] || 'Entry',
      );
      list.append(item);
    }
    section.append(list);
    return section.outerHTML;
  };

  const confirmClearAllWorkspace = () => {
    if (!draftSupported || draft || !entries().length) return;
    document.querySelector('[data-hierarchy-clear-all-confirm]')?.remove();
    const template = workspace.querySelector('[data-hierarchy-clear-all-confirm-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const fragment = template.content.cloneNode(true);
    const modal = fragment.querySelector('.metadata-hierarchy-clear-confirm');
    if (!(modal instanceof HTMLElement)) return;
    modal.dataset.hierarchyClearAllConfirm = '';
    const panel = modal.querySelector('.modal-content');
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
        clearAllDetailSection('New entries to discard', summary.newEntries, 'No new entries.'),
        clearAllDetailSection(
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

    const popupRuntime = window.ManatOS?.popup?.runtime;
    document.body.append(fragment);
    popupRuntime?.registerBootstrapModal?.(modal);
    const modalInstance = window.bootstrap?.Modal?.getOrCreateInstance(modal);
    const close = () => modalInstance?.hide();
    modal.addEventListener('hidden.bs.modal', () => modal.remove(), { once: true });
    panel
      .querySelectorAll('[data-clear-all-confirm-cancel]')
      .forEach((button) => button.addEventListener('click', close));
    panel.querySelector('[data-clear-all-confirm-accept]')?.addEventListener('click', () => {
      close();
      clearAllWorkspace();
    });
    modalInstance?.show();
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
    organizationSurface.replaceTransaction(
      payload.workspaceTransaction || { version: 1, mutations: [] },
      'restore-workspace-draft-transaction',
    );
    organizationSurface.replaceRecycleBin(
      Array.isArray(payload.recycleBin) ? payload.recycleBin : [],
      'restore-workspace-draft-recycle-bin',
    );
    organizationSurface.replaceRuntimeResources(payload.runtimeResources || {});
    organizationSurface.pruneRuntimeResources();
    hierarchyRelationships.hydrateMissingOriginalSnapshots();
    savedDraftSignature = workspaceDraftSignature(payload.entries);

    // Migrate a recognized legacy draft to the stable key, but leave the old
    // copy untouched until a successful Commit clears the working draft.
    if (best.key !== hierarchyDraftStore.storageKey) {
      hierarchyDraftStore.save({
        version: 2,
        savedAt: payload.savedAt || new Date().toISOString(),
        entries: payload.entries,
        entriesOriginal: payload.entriesOriginal || originalEntries(),
        workspaceTransaction: payload.workspaceTransaction || { version: 1, mutations: [] },
        recycleBin: Array.isArray(payload.recycleBin) ? payload.recycleBin : [],
        runtimeResources: payload.runtimeResources || {},
      });
    }
    return true;
  };

  const leaveHierarchyWorkspace = () => {
    window.location.assign(
      workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`,
    );
  };

  /*
   * Create Organization is the deliberate normal-close draft exception. Close
   * persists the complete working aggregate in the browser and then leaves; it
   * never commits application storage. If browser draft persistence fails, stay
   * on the workspace so Close cannot silently lose the user's work.
   */
  const closeWorkspace = () => {
    if (draft) return;
    if (workspaceDirty() && !saveWorkspaceDraft()) return;
    leaveHierarchyWorkspace();
  };

  /*
   * Edit Organization follows the ordinary lifecycle rule: Cancel/Close is an
   * explicit discard boundary. Only Commit persists edit-workspace changes.
   * Outage recovery is separate and is captured by the recovery adapter before
   * an unavailable UI is gently closed.
   */
  const exitEditWorkspace = () => {
    if (draft) return;
    leaveHierarchyWorkspace();
  };

  let pendingCommitPlan = null;
  let pendingCommitMode = 'stay';

  const commitPlanForWorkspace = () => {
    const commitRuntime = window.ManatOS?.workspaceCommit;
    if (!commitRuntime?.buildPlan) throw new Error('Workspace CommitPlan runtime is unavailable.');
    return commitRuntime.buildPlan({
      rootEntityKey: entityKey,
      identityField: idField,
      entries: entries(),
      entriesOriginal: originalEntries(),
      workspaceTransaction: organizationSurface.transactionSnapshot(),
    });
  };

  const reviewWorkspaceChanges = () => {
    if (!workspaceDirty()) return;
    const reportChanges = window.ManatOS?.semanticChangeReport?.hierarchy;
    if (typeof reportChanges !== 'function') {
      window.ManatOS?.errors?.present?.({
        code: 'HIERARCHY_CHANGE_REPORT_UNAVAILABLE',
        message: 'Semantic hierarchy change-report runtime is unavailable.',
        userMessage: 'The current organization changes cannot be reviewed safely.',
        retryable: false,
      });
      return;
    }
    let reportModel;
    try {
      reportModel = reportChanges({
        entityKey,
        identityField: idField,
        entries: entries(),
        entriesOriginal: originalEntries(),
        recycleBin: organizationSurface.recycleBin,
        workspaceTransaction: organizationSurface.transactionSnapshot(),
        ownerPath: pagePath,
      });
    } catch (error) {
      window.ManatOS?.errors?.present?.({
        code: 'HIERARCHY_CHANGE_REPORT_INVALID',
        message: error instanceof Error ? error.message : String(error),
        userMessage: 'The current organization changes cannot be reviewed safely.',
        retryable: false,
      });
      return;
    }
    window.ManatOS?.changeReportPopup?.show?.(reportModel, {
      title: 'Unsaved changes',
      summary: reportModel?.summary || 'Current unsaved organization changes',
      presentationContext: window.ManatOS?.semanticReportPresentation?.live?.(pagePath),
    });
  };

  if (hierarchyStateIndicator instanceof HTMLButtonElement) {
    hierarchyStateIndicator.addEventListener('click', reviewWorkspaceChanges);
  }

  const confirmCommitWorkspace = (commitMode = 'stay') => {
    if (!(hierarchyCommit instanceof HTMLButtonElement) || hierarchyCommit.disabled || draft)
      return;
    document.querySelector('.metadata-hierarchy-commit-confirm-modal')?.remove();
    const template = workspace.querySelector('[data-hierarchy-commit-confirm-template]');
    if (!(template instanceof HTMLTemplateElement)) return;
    let plan;
    try {
      plan = commitPlanForWorkspace();
    } catch (error) {
      window.ManatOS?.errors?.present?.({
        code: 'HIERARCHY_COMMIT_PLAN_INVALID',
        message: error instanceof Error ? error.message : String(error),
        userMessage:
          error instanceof Error
            ? error.message
            : 'The organization changes cannot be planned safely.',
        retryable: false,
      });
      return;
    }
    pendingCommitPlan = plan;
    pendingCommitMode = commitMode === 'close' ? 'close' : 'stay';
    const fragment = template.content.cloneNode(true);
    const modal = fragment.querySelector('.metadata-hierarchy-commit-confirm-modal');
    if (!(modal instanceof HTMLElement)) return;
    modal.dataset.popupInvocation = JSON.stringify({
      purpose: 'hierarchy-commit',
      data: { commitMode: pendingCommitMode },
      behavior: { recoverable: false },
    });
    const panel = modal.querySelector('.metadata-hierarchy-commit-confirm');
    if (!(panel instanceof HTMLElement)) return;
    const reportHost = panel.querySelector('[data-commit-report]');
    const reportModel = window.ManatOS?.workspaceCommit?.reportModel?.(plan);
    window.ManatOS?.semanticReportPresentation?.render?.(
      reportHost,
      reportModel,
      window.ManatOS?.semanticReportPresentation?.live?.(pagePath),
    );
    const operationCount = panel.querySelector('[data-commit-operation-count]');
    if (operationCount) operationCount.textContent = String(plan.operations.length);

    const popupRuntime = window.ManatOS?.popup?.runtime;
    document.body.append(fragment);
    popupRuntime?.registerBootstrapModal?.(modal);
    const modalInstance = window.bootstrap?.Modal?.getOrCreateInstance(modal);
    const close = () => modalInstance?.hide();
    modal.addEventListener(
      'hidden.bs.modal',
      () => {
        pendingCommitPlan = null;
        modal.remove();
      },
      { once: true },
    );
    panel
      .querySelectorAll('[data-commit-confirm-cancel]')
      .forEach((button) => button.addEventListener('click', close));
    panel.querySelector('[data-commit-confirm-accept]')?.addEventListener('click', () => {
      const acceptedPlan = pendingCommitPlan;
      const simulateTransactionFailure =
        panel.querySelector('[data-commit-simulate-failure]') instanceof HTMLInputElement &&
        panel.querySelector('[data-commit-simulate-failure]').checked;
      pendingCommitPlan = null;
      close();
      if (acceptedPlan)
        commitWorkspace(acceptedPlan, pendingCommitMode, simulateTransactionFailure);
    });
    modalInstance?.show();
    return modal;
  };

  const commitWorkspace = async (
    commitPlan,
    commitMode = 'stay',
    simulateTransactionFailure = false,
  ) => {
    if (!(hierarchyCommit instanceof HTMLButtonElement) || hierarchyCommit.disabled || draft)
      return;
    if (!commitPlan) return confirmCommitWorkspace(commitMode);
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    hierarchyCommit.disabled = true;
    hierarchyCommit.dataset.busy = 'true';
    releaseCommitInputBlock = window.ManatOS?.uiHost?.setUserInputBlocked?.(
      pagePath,
      'hierarchy-commit',
      true,
    );
    refreshWorkspaceSummary();
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
          commitPlan,
          debug: simulateTransactionFailure ? { simulateTransactionFailure: true } : undefined,
          // Transport only binary resources referenced by the immutable final plan.
          // Deleted/recycled members may retain private resources for undo, but those
          // resources are deliberately not part of persistence.
          resources: (() => {
            const referenced = new Set();
            const visit = (value) => {
              if (!value || typeof value !== 'object') return;
              if (Array.isArray(value)) return value.forEach(visit);
              if (value.pending === true) {
                const identity = String(value.revision ?? value.id ?? '');
                if (identity.startsWith('pending:')) referenced.add(`picture:${identity}`);
              }
              Object.values(value).forEach(visit);
            };
            commitPlan.operations.forEach((operation) => visit(operation.current));
            const available = organizationSurface.runtimeResourceSnapshot();
            for (const key of referenced) {
              if (!Object.prototype.hasOwnProperty.call(available, key))
                throw new Error(`Commit is missing required current runtime resource '${key}'.`);
            }
            return Object.fromEntries([...referenced].map((key) => [key, available[key]]));
          })(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true) {
        window.ManatOS?.errors?.fromResponse?.(response, payload, {
          retry: () => commitWorkspace(commitPlan, commitMode, simulateTransactionFailure),
        });
        const failure = new Error(
          payload?.error?.message || payload?.message || 'Organization commit failed.',
        );
        failure.manatosPresented = true;
        throw failure;
      }
      clearCreateWorkspaceDrafts();
      savedDraftSignature = null;
      // Successful Commit establishes a new accepted aggregate baseline before any
      // intentional navigation. The universal dirty/beforeunload lifecycle can then
      // observe this UiLevel as clean without a Commit-specific guard bypass.
      organizationSurface.acceptCommittedBaseline('commit-success');
      if (commitMode === 'close') {
        window.location.assign(
          workspace.dataset.hierarchyCloseHref || `/bo/${encodeURIComponent(entityKey)}`,
        );
      } else if (commitMode === 'stay') {
        const committedRootId = String(payload?.data?.rootId || '');
        const stayHref = committedRootId
          ? `/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(committedRootId)}/hierarchy`
          : window.location.href;
        window.location.assign(stayHref);
      }
      return true;
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
          { retry: () => commitWorkspace(commitPlan, commitMode, simulateTransactionFailure) },
        );
      }
      return false;
    } finally {
      delete hierarchyCommit.dataset.busy;
      releaseCommitInputBlock?.();
      releaseCommitInputBlock = null;
      refreshWorkspaceSummary();
    }
  };

  const workspaceDismissControl = hierarchyMode === 'create' ? hierarchyClose : hierarchyEditExit;
  const unregisterWorkspaceDismiss =
    pagePath && workspaceDismissControl instanceof HTMLButtonElement
      ? window.ManatOS?.popup?.runtime?.registerDismissHandler?.({ path: pagePath }, () => {
          void window.ManatOS?.surfaceClosure?.requestTrigger?.(workspaceDismissControl, pagePath);
          return true;
        })
      : null;
  if (typeof unregisterWorkspaceDismiss === 'function') {
    window.addEventListener('pagehide', unregisterWorkspaceDismiss, { once: true });
  }

  const typedRecoveryAdapter = window.ManatOS?.organizationRecoveryAdapter?.(pagePath);
  if (pagePath && !typedRecoveryAdapter) {
    throw new Error('Canonical Organization recovery adapter is unavailable.');
  }

  let unregisterRecoveryAdapter = null;
  if (pagePath && window.ManatOS?.uiHost?.registerRecoveryAdapter) {
    unregisterRecoveryAdapter = window.ManatOS.uiHost.registerRecoveryAdapter(pagePath, {
      ...typedRecoveryAdapter,
      recoveryUrl() {
        if (hierarchyMode === 'create') {
          return `/bo/${encodeURIComponent(entityKey)}/hierarchy/new`;
        }
        const recordId = String(page?.control?.recordId || focusedMemberId || '');
        return recordId
          ? `/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(recordId)}/hierarchy`
          : null;
      },
      cancellationPresentation() {
        if (hierarchyMode === 'create') {
          return {
            message:
              'You have unsaved Create Organization changes. Keep the browser draft and continue later, or Commit them now.',
            discardLabel: 'Keep draft & leave',
            saveLabel: 'Commit',
          };
        }
        const state = runtime?.get?.(`${pagePath}.state`);
        const canCommit = state?.dirty === true && state?.valid === true && state?.blocked !== true;
        return {
          message: canCommit
            ? 'You have unsaved Organization changes. Discard them or Commit them now.'
            : 'You have unsaved Organization changes. The Organization is incomplete and cannot be committed. Discard the changes or cancel navigation to complete it.',
          discardLabel: 'Discard',
          saveLabel: 'Commit',
        };
      },
      canSaveUserChanges() {
        const state = runtime?.get?.(`${pagePath}.state`);
        return state?.dirty === true && state?.valid === true && state?.blocked !== true;
      },
      async discardUserChanges() {
        if (hierarchyMode !== 'create') return true;
        return saveWorkspaceDraft();
      },
      async saveUserChanges() {
        let plan;
        try {
          plan = commitPlanForWorkspace();
        } catch (error) {
          window.ManatOS?.errors?.present?.({
            code: 'HIERARCHY_COMMIT_PLAN_INVALID',
            message: error instanceof Error ? error.message : String(error),
            userMessage:
              error instanceof Error
                ? error.message
                : 'The organization changes cannot be planned safely.',
            retryable: false,
          });
          return false;
        }
        return (await commitWorkspace(plan, 'lifecycle')) === true;
      },
      async prepareGentleClose() {
        replaceOriginalEntries(
          entries().map((row) => ({ ...row })),
          'workspace-recovery-gentle-close',
        );
        setRuntimeValue(`${pagePath}.state.dirty`, false, 'workspace-recovery-gentle-close');
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
  hierarchyCommit?.addEventListener('click', () => confirmCommitWorkspace('close'));
  hierarchyCommitOptions.forEach((button) =>
    button.addEventListener('click', () =>
      confirmCommitWorkspace(button.getAttribute('data-hierarchy-commit-option') || 'stay'),
    ),
  );

  component.addEventListener('manatos:hierarchy-command', (event) => {
    const {
      command,
      memberId,
      relation,
      entityKey: externalEntityKey,
      identity,
      identityKind,
      mutationId,
    } = event.detail || {};
    if (command === 'edit-external-entry' && externalEntityKey && identity) {
      event.preventDefault?.();
      if (!organizationSurface.canOwnExternalEntity?.(externalEntityKey)) return;
      const transfer = organizationSurface.ownerProvider?.provideEntryIfPresent?.(
        externalEntityKey,
        identity,
      );
      if (!transfer) return;
      const entryOpening = window.ManatOS?.entryOpening;
      if (!entryOpening?.open) throw new Error('Canonical entry opening service is unavailable.');
      const targetContext = runtime.entity?.(externalEntityKey) || null;
      const record = transfer.current || {};
      const primaryField = String(targetContext?.metadata?.primaryField || 'name');
      const name = String(record?.fullName || record?.[primaryField] || record?.name || identity);
      const ownerDraft = identityKind === 'workspace' || String(identity).startsWith('draft:');
      entryOpening.open({
        host: 'popup',
        target: ownerDraft
          ? { entityKey: externalEntityKey }
          : { entityKey: externalEntityKey, recordId: String(identity) },
        title: `${ownerDraft ? 'Create' : 'Edit'} ${
          targetContext?.metadata?.label || 'entry'
        } - ${name}`,
        mode: ownerDraft ? 'create' : 'edit',
        purpose: 'edit-owned-external-entry',
        presentation: { layout: 'entry' },
        caller: { workspaceOwned: true },
        ...(ownerDraft ? { rules: { defaults: { id: String(identity) } } } : {}),
      });
      return;
    }
    if (command === 'remove-external-entry' && mutationId && externalEntityKey && identity) {
      event.preventDefault?.();
      if (!organizationSurface.canOwnExternalEntity?.(externalEntityKey)) return;
      const relationships = entityMetadata?.relationships || {};
      const referenceFields = Object.values(relationships)
        .filter((relationship) => relationship?.references?.objectKey === externalEntityKey)
        .flatMap((relationship) =>
          Array.isArray(relationship?.fields)
            ? relationship.fields.map((field) => String(field))
            : [],
        );
      organizationSurface.removeExternalDraftMutation?.(mutationId, referenceFields);
      return;
    }
    if (command === 'delete') hierarchyRelationships.removeNode(memberId);
    else if (command === 'restore-recycled') hierarchyRelationships.restoreNode(memberId);
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
      setRuntimeValue(
        `${pagePath}.data.resources.workspace.focusedMemberId`,
        memberId,
        'focus-member',
      );

      const fieldValues = {
        ...(resolveCanonical(`${pagePath}.data.resources.workspace`) || {}),
      };
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const entryOpening = window.ManatOS?.entryOpening;
      if (!entryOpening?.transport || !entryOpening?.composeCallerRules)
        throw new Error('Canonical entry invocation transport is unavailable.');
      const callerRules = entryOpening.composeCallerRules(
        organizationSurface.ownedEntryFieldRules(memberId),
        row,
      );
      const projected = entryOpening.transport({
        host: 'page',
        target: {
          entityKey,
          url: `/bo/${encodeURIComponent(entityKey)}/owned-entry/${encodeURIComponent(memberId)}`,
        },
        mode: 'edit',
        purpose: 'hierarchy-owned-entry',
        caller: { workspaceOwned: true },
        rules: callerRules,
        request: {
          method: 'POST',
          fields: {
            _csrf: csrf,
            _ownerEntries: JSON.stringify(entries()),
            _ownerEntriesOriginal: JSON.stringify(originalEntries()),
            _ownerFields: JSON.stringify(fieldValues),
            _ownerBreadcrumbItems: JSON.stringify(
              Array.isArray(page?.control?.presentation?.breadcrumbItems)
                ? page.control.presentation.breadcrumbItems
                : [],
            ),
            _ownerName: String(page?.control?.name || 'organization'),
            _ownerKind: String(page?.control?.kind || 'sysbo-hierarchy'),
            _ownerMode: String(page?.control?.mode || 'edit'),
            _ownerIdentityField: idField,
            _ownerWorkspaceTransaction: JSON.stringify(organizationSurface.transactionSnapshot()),
            _ownerRecycleBin: JSON.stringify(organizationSurface.recycleBin),
            _ownerRuntimeResources: JSON.stringify(organizationSurface.runtimeResourceSnapshot()),
            _ownerRecoveryUrl:
              window.ManatOS?.uiHost?.recoveryUrl?.(pagePath) ||
              (hierarchyMode === 'create'
                ? `/bo/${encodeURIComponent(entityKey)}/hierarchy/new`
                : `/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(
                    String(page?.control?.recordId || focusedMemberId || memberId),
                  )}/hierarchy`),
          },
        },
      });
      if (!projected.request) throw new Error('Owned Entry page requires POST transport.');
      const form = document.createElement('form');
      form.method = projected.request.method.toLowerCase();
      form.action = projected.url;
      /*
       * This POST is not abandonment of the dirty Organization workspace. It is
       * an owner-state handoff: the complete working aggregate is serialized
       * below and reconstructed by the owned-entry page. Mark the submission as
       * an intentional dirty-page transition so the generic beforeunload guard
       * does not fall through to the browser-native "Leave site?" prompt.
       */
      form.dataset.allowDirtyPageExit = 'true';
      form.hidden = true;
      for (const [name, value] of Object.entries(projected.request.fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.append(input);
      }
      document.body.append(form);
      form.requestSubmit();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && draft) {
      event.preventDefault();
      cancelQuick();
    }
  });
  const releaseHierarchySubscriber =
    runtime.trackSubscriber?.('*', { kind: 'hierarchy', label: 'Hierarchy workspace' }) || null;
  const hierarchyCtxEventName = runtime.eventName || 'manatos:ctx-change';
  const onHierarchyCtxChange = () => refreshWorkspaceSummary();
  const disposeHierarchyWorkspace = (event) => {
    if (event?.detail?.path !== pagePath || workspaceDisposed) return;
    workspaceDisposed = true;
    window.removeEventListener(hierarchyCtxEventName, onHierarchyCtxChange);
    window.removeEventListener('manatos:ui-level-disposing', disposeHierarchyWorkspace);
    releaseHierarchySubscriber?.();
    unregisterRecoveryAdapter?.();
    unregisterWorkspaceDismiss?.();
  };
  window.addEventListener(hierarchyCtxEventName, onHierarchyCtxChange);
  window.addEventListener('manatos:ui-level-disposing', disposeHierarchyWorkspace);
  if (draftSupported) restoreWorkspaceDraft();
  refreshWorkspaceSummary();
})();
