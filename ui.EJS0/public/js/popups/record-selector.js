/**
 * Generic metadata-driven existing-record selector.
 *
 * The selector deliberately reuses the same EJS list toolbar/filter/header/
 * paging components as ordinary SysBO browse pages. This runtime adds only
 * popup-local concerns: candidate eligibility, presentation/evaluator CTX and
 * returning the chosen record(s) to the caller. Query, paging and selection are
 * owned by EntityListRuntime.
 *
 * Callers open the selector through the canonical SurfaceInvocation contract.
 * The child never receives return-routing state such as a target field.
 */
(() => {
  const runtime = window.ManatOS?.ctx;
  const popupRuntime = window.ManatOS?.popup?.runtime;

  const parseJson = (value, fallback) => {
    try {
      const parsed = JSON.parse(String(value || ''));
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
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

  const entityContextFor = (entityKey) => runtime?.entity?.(entityKey) || null;

  const candidateId = (candidate, primaryIdField = 'id') =>
    String(candidate?.[primaryIdField] ?? candidate?.id ?? candidate?.value ?? '');

  // Selector candidates are projected by the canonical data-access entry-
  // representation pipeline. Browser selection behavior consumes that projection;
  // it must not invent another entity-name policy from arbitrary row fields.
  const entryName = (candidate) =>
    String(
      window.ManatOS?.entryRepresentation?.projected?.(candidate, candidateId(candidate))?.name ??
        candidateId(candidate) ??
        '',
    );

  const normalizeEligibility = (result) => {
    if (result === false)
      return { eligible: false, visible: true, reason: 'This entry cannot be selected.' };
    if (result === true || result == null) return { eligible: true, visible: true, reason: '' };
    if (typeof result !== 'object') return { eligible: true, visible: true, reason: '' };
    return {
      eligible: result.eligible !== false,
      visible: result.visible !== false,
      reason: String(result.reason || ''),
    };
  };

  const open = ({
    template,
    source = [],
    invocation = null,
    initialSelection = null,
    eligibility = null,
    factsForCandidate = null,
    onSelect = null,
    onClose = null,
  } = {}) => {
    if (!(template instanceof HTMLTemplateElement)) return null;
    if (!Array.isArray(source)) return null;
    const diagnosticOpeningAt = performance.now();

    // Only one modal record-selection context is active at a time.
    document.querySelector('[data-record-selector-backdrop]')?.remove();

    const fragment = template.content.cloneNode(true);
    const panel = fragment.querySelector('.metadata-record-selector');
    if (!(panel instanceof HTMLElement)) return null;

    const entityKey = String(panel.dataset.selectorEntityKey || '');
    const entityContext = entityContextFor(entityKey);
    const metadata = entityContext?.metadata;
    if (!entityKey || !metadata?.fieldDefinition) return null;

    const primaryField = String(
      panel.dataset.selectorPrimaryField || metadata.primaryField || 'name',
    );
    const visibleFields = parseJson(panel.dataset.selectorVisibleFields, [primaryField]);
    const filterModes = parseJson(panel.dataset.selectorFilterModes, {});
    const uiRules = parseJson(panel.dataset.selectorUiRules, {});
    const candidateRowsTemplate = panel.querySelector('[data-selector-candidate-rows]');
    const candidateRows =
      candidateRowsTemplate instanceof HTMLTemplateElement
        ? new Map(
            [
              ...candidateRowsTemplate.content.querySelectorAll('[data-selector-candidate-row]'),
            ].map((row) => [String(row.dataset.candidateId || ''), row]),
          )
        : new Map();
    const canonicalInvocation =
      invocation && typeof invocation === 'object' && !Array.isArray(invocation)
        ? invocation
        : null;
    const selectionMode =
      canonicalInvocation?.behavior?.selection === 'multiple' ? 'multiple' : 'single';
    const idField = 'id';
    const resolvedInvocation = Object.freeze({
      entityName: canonicalInvocation?.entityName ?? entityContext?.name ?? metadata.name ?? null,
      purpose: canonicalInvocation?.purpose ?? 'select',
      caller: canonicalInvocation?.caller ?? null,
      presentation: canonicalInvocation?.presentation ?? null,
      rules: canonicalInvocation?.rules ?? null,
      behavior: {
        selection: selectionMode,
        allowClear: canonicalInvocation?.behavior?.allowClear === true,
        autofocus: canonicalInvocation?.behavior?.autofocus !== false,
      },
    });

    /*
     * Selector policy runs against the selector's real CTX surface. Invocation,
     * selection and the currently evaluated row are observable state; the
     * evaluator receives only a CTX owner path, never a manufactured JS scope.
     */
    const expressionRuntime = window.ManatOS?.expression;

    // A selector is a CHILD UI surface owned by PopupRuntime. Do not manufacture
    // a second CTX topology here: every popup family must use the same browser
    // surface-opening boundary so nesting, paths and lifecycle stay canonical.
    const v2Surface = popupRuntime?.openUiLevel?.({
      kind: 'selector',
      mode: 'select',
      name: `${entityKey}-selector`,
      entityKey,
      invocation: resolvedInvocation,
      presentation: {
        title:
          resolvedInvocation.presentation?.title || `Select existing ${metadata.label || 'entry'}`,
        mode: 'subtle',
        definition: {
          regions: [
            {
              id: 'toolbar',
              role: 'toolbar',
              composition: [
                {
                  key: 'count',
                  kind: 'component',
                  component: 'list-count',
                  rendererRef: 'list-part:count',
                },
                ...(Object.keys(filterModes).length
                  ? [
                      {
                        key: 'filters',
                        kind: 'component',
                        component: 'list-filters',
                        rendererRef: 'list-part:filters',
                      },
                    ]
                  : []),
                {
                  key: 'search',
                  kind: 'component',
                  component: 'list-search',
                  rendererRef: 'list-part:search',
                },
              ],
            },
            ...(Object.keys(filterModes).length
              ? [
                  {
                    id: 'filters',
                    role: 'filters',
                    composition: [
                      ...Object.keys(filterModes).map((field) => ({
                        key: field,
                        kind: 'field',
                        field,
                        rendererRef: `list-filter-field:${field}`,
                      })),
                      {
                        key: 'apply',
                        kind: 'action',
                        action: 'apply',
                        label: 'Filter',
                        rendererRef: 'list-filter-action:apply',
                      },
                      {
                        key: 'clear',
                        kind: 'action',
                        action: 'clear',
                        label: 'Clear',
                        rendererRef: 'list-filter-action:clear',
                      },
                    ],
                  },
                ]
              : []),
            {
              id: 'list',
              role: 'list',
              composition: visibleFields.map((field) => ({
                key: field,
                kind: 'field',
                field,
                rendererRef: `list-field:${field}`,
              })),
            },
            {
              id: 'pagination',
              role: 'pagination',
              composition: [
                {
                  key: 'paging',
                  kind: 'component',
                  component: 'list-paging',
                  rendererRef: 'list-part:paging',
                },
              ],
            },
          ],
          chrome: {
            title: { rendererRef: 'title:surface' },
            actionsRendererRef: 'actions:surface',
            actions: [
              {
                key: 'selection',
                kind: 'status',
                label: 'Selection state',
                rendererRef: 'status:selection',
              },
              {
                key: 'cancel',
                kind: 'action',
                label: 'Cancel',
                rendererRef: 'layout-action:cancel',
              },
              {
                key: 'select',
                kind: 'action',
                label: 'Select',
                rendererRef: 'layout-action:select',
              },
            ],
          },
        },
      },
      state: { valid: false },
    });
    if (!v2Surface) {
      console.warn('[ManatOS record selector] PopupRuntime could not open selector surface');
      return null;
    }
    const popupPath = v2Surface.path;
    panel.dataset.uiLevelRoot = '';
    panel.dataset.ctxScopePath = popupPath;

    popupRuntime.updateUiLevel?.(
      v2Surface,
      {
        data: {
          selection: {
            current: { name: '' },
            selected: [],
            facts: { alreadyInContext: false },
          },
          row: { current: {}, facts: { alreadyInContext: false } },
        },
      },
      { source: 'record-selector', action: 'initialize-selector-state' },
    );

    const publishEvaluationState = ({ selection = null, row = null } = {}) => {
      const current = runtime?.get?.(popupPath);
      if (!current || typeof current !== 'object') return;
      const patch = {};
      if (selection || row) {
        patch.data = {
          ...(current.data && typeof current.data === 'object' ? current.data : {}),
          ...(selection ? { selection } : {}),
          ...(row ? { row } : {}),
        };
      }
      if (!Object.keys(patch).length) return;
      popupRuntime.updateUiLevel?.(v2Surface, patch, {
        source: 'record-selector',
        action: 'update-selector-evaluation-context',
      });
    };

    const sourceForUIRule = (key) => {
      const declaration = uiRules?.[key];
      if (typeof declaration === 'string') return declaration;
      return declaration &&
        typeof declaration === 'object' &&
        typeof declaration.source === 'string'
        ? declaration.source
        : null;
    };

    const evaluateUIRule = (key, fallback) => {
      const source = sourceForUIRule(key);
      const ast = source ? expressionRuntime?.astForSource?.(source) : null;
      if (!ast || !expressionRuntime?.evaluateAstAt) return fallback;
      try {
        const value = expressionRuntime.evaluateAstAt(ast, popupPath);
        return value == null ? fallback : value;
      } catch (error) {
        console.warn(`[ManatOS record selector] UI rule ${key} failed`, error);
        return fallback;
      }
    };

    const primeUIRuleAsts = async () => {
      if (!expressionRuntime?.loadAstForSource) return;
      const sources = [
        ...new Set(
          Object.keys(uiRules || {})
            .map(sourceForUIRule)
            .filter(Boolean),
        ),
      ];
      await Promise.all(
        sources.map((source) =>
          expressionRuntime.loadAstForSource(source).catch((error) => {
            console.warn('[ManatOS record selector] UI rule could not be prepared', error);
            return null;
          }),
        ),
      );
    };

    let presentationMode = 'subtle';
    let selectorTitleText =
      resolvedInvocation.presentation?.title || `Select existing ${metadata.label || 'entry'}`;
    let showContextNote = true;
    let autofocusSearch = true;
    const applySelectorPresentationRules = () => {
      presentationMode = String(evaluateUIRule('presentationMode', 'subtle'));
      selectorTitleText = String(
        evaluateUIRule(
          'title',
          resolvedInvocation.presentation?.title || `Select existing ${metadata.label || 'entry'}`,
        ),
      );
      showContextNote = Boolean(evaluateUIRule('showContextNote', true));
      autofocusSearch = Boolean(evaluateUIRule('autofocusSearch', true));
      panel.dataset.selectorPresentation = presentationMode;
      panel.classList.toggle('is-entry-presentation', presentationMode === 'entry');
      panel.classList.toggle('is-subtle-presentation', presentationMode !== 'entry');
      const selectorTitle = panel.querySelector('[data-selector-title]');
      if (selectorTitle instanceof HTMLElement) selectorTitle.textContent = selectorTitleText;
      const note = panel.querySelector('[data-selector-context-note]');
      if (note instanceof HTMLElement) note.hidden = !showContextNote;
    };

    applySelectorPresentationRules();

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop metadata-record-selector-backdrop';
    backdrop.dataset.recordSelectorBackdrop = '';
    backdrop.dataset.manatosPopupReady = 'false';
    backdrop.append(fragment);
    document.body.append(backdrop);
    window.dispatchEvent(
      new CustomEvent('manatos:ui-surface-rendered', { detail: { path: popupPath } }),
    );
    window.requestAnimationFrame(() => {
      window.ManatOS?.clientDiagnostics?.send?.({
        type: 'popup-opening-measurement',
        popupKind: 'record-selector',
        title: selectorTitleText,
        openToFirstVisibleContentMs: Math.max(
          0,
          Math.round((performance.now() - diagnosticOpeningAt) * 10) / 10,
        ),
      });
    });

    const search = panel.querySelector('[data-selector-filter]');
    const rowsHost = panel.querySelector('[data-selector-rows]');
    const selectButton = panel.querySelector('[data-selector-select]');
    const note = panel.querySelector('[data-selector-context-note]');
    const initialPageSize = Number(panel.querySelector('[data-selector-page-size]')?.value) || 10;
    const EntityListRuntime = window.ManatOS?.EntityListRuntime;
    if (typeof EntityListRuntime !== 'function') {
      console.warn('[ManatOS record selector] Canonical EntityListRuntime is unavailable');
      popupRuntime.closeUiLevel?.(v2Surface);
      backdrop.remove();
      return null;
    }

    const developerToolsDock = document.getElementById('developerToolsDock');
    const developerToolsWasVisible = Boolean(
      developerToolsDock && !developerToolsDock.classList.contains('d-none'),
    );
    const selectorCtxButton = panel.querySelector('[data-selector-ctx]');

    if (selectorCtxButton instanceof HTMLButtonElement && developerToolsWasVisible) {
      selectorCtxButton.classList.remove('d-none');
      selectorCtxButton.setAttribute('aria-pressed', 'false');
      selectorCtxButton.addEventListener('click', () => {
        popupRuntime?.toggleInspection?.({
          path: popupPath,
          button: selectorCtxButton,
        });
      });
    }

    const fieldFilterValues = () =>
      Object.fromEntries(
        [...panel.querySelectorAll('[data-selector-field-filter]')].map((control) => [
          control.dataset.selectorFieldFilter,
          control.value,
        ]),
      );

    const initialSelectedIds = new Set(
      (Array.isArray(initialSelection)
        ? initialSelection
        : initialSelection == null
          ? []
          : [initialSelection]
      )
        .map((value) => String(value))
        .filter(Boolean),
    );

    const candidateEligibility = (candidate) => {
      const id = candidateId(candidate, idField);

      /*
       * Generic query exclusions are invocation data, not executable child state.
       * The initial selection remains exempt so an existing valid link stays
       * visible/selectable while editing.
       */
      const excludedIds = new Set(
        Array.isArray(resolvedInvocation.rules?.query?.exclude)
          ? resolvedInvocation.rules.query.exclude.map((value) => String(value))
          : [],
      );
      if (excludedIds.has(id) && !initialSelectedIds.has(id)) {
        return {
          eligible: false,
          visible: true,
          reason: 'This entry is unavailable for the current selection.',
        };
      }

      return normalizeEligibility(
        typeof eligibility === 'function' ? eligibility(candidate, resolvedInvocation) : true,
      );
    };

    // Callers may project domain facts for a candidate, but presentation remains
    // selector-owned and evaluator-driven. This keeps hierarchy membership,
    // relationship state, etc. out of popup DOM/string-building callbacks.
    const candidateFactsFor = (candidate) => {
      if (typeof factsForCandidate !== 'function') return { alreadyInContext: false };
      const facts = factsForCandidate(candidate, resolvedInvocation);
      return facts && typeof facts === 'object' && !Array.isArray(facts)
        ? { alreadyInContext: false, ...facts }
        : { alreadyInContext: false };
    };

    const presentationRowFor = (candidate) =>
      candidateRows.get(candidateId(candidate, idField)) || null;

    const filterValuesFor = (candidate) => {
      const row = presentationRowFor(candidate);
      return row ? parseJson(row.dataset.selectorFilterValues, {}) : {};
    };

    const searchTextFor = (candidate) => {
      const row = presentationRowFor(candidate);
      return String(row?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    const eligibleRowsForQuery = (query) => {
      const term = String(query.search || '')
        .trim()
        .toLowerCase();
      return source.filter((candidate) => {
        if (!candidate || typeof candidate !== 'object') return false;
        const id = candidateId(candidate, idField);
        if (!id) return false;
        const eligibilityResult = candidateEligibility(candidate);
        if (!eligibilityResult.visible) return false;
        if (term && !searchTextFor(candidate).includes(term)) return false;
        return Object.entries(query.filters || {}).every(([key, rawWanted]) => {
          const wanted = String(rawWanted || '')
            .trim()
            .toLowerCase();
          if (!wanted) return true;
          const actual = String(filterValuesFor(candidate)?.[key] ?? '')
            .trim()
            .toLowerCase();
          return filterModes?.[key] === 'exact' ? actual === wanted : actual.includes(wanted);
        });
      });
    };

    const listRuntime = new EntityListRuntime({
      entityKey,
      idField,
      viewKey: 'main',
      columns: visibleFields.map((field) => ({ field, label: field })),
      selectionMode,
      dataSource: {
        load: async (query) => {
          const filtered = eligibleRowsForQuery(query);
          const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
          const page = Math.min(Math.max(1, query.page), totalPages);
          return {
            items: filtered.slice((page - 1) * query.pageSize, page * query.pageSize),
            paging: { total: filtered.length, page, pageSize: query.pageSize, totalPages },
          };
        },
      },
      initialQuery: {
        page: 1,
        pageSize: initialPageSize,
        direction: 'asc',
        filters: fieldFilterValues(),
        search: String(search?.value || ''),
      },
    });
    for (const id of initialSelectedIds) listRuntime.select(id);

    const selectedCandidates = () => {
      const selectedIdSet = new Set(listRuntime.snapshot.selectedIds);
      return source.filter((candidate) => selectedIdSet.has(candidateId(candidate, idField)));
    };

    const syncCtx = () => {
      const snapshot = listRuntime.snapshot;
      const currentState = runtime?.get?.(`${popupPath}.state`) || {};
      const semanticState = { ...currentState };
      delete semanticState.lifecycle;
      delete semanticState.active;
      popupRuntime.updateUiLevel?.(
        v2Surface,
        {
          control: {
            ...(runtime?.get?.(`${popupPath}.control`) || {}),
            invocation: { ...resolvedInvocation },
            presentation: {
              ...(runtime?.get?.(`${popupPath}.control.presentation`) || {}),
              kind: 'selector',
              mode: presentationMode,
              title: selectorTitleText,
              contextNote: currentContextNote,
              showContextNote,
              autofocusSearch,
            },
          },
          state: {
            ...semanticState,
            dirty: false,
            valid: snapshot.selectedIds.length > 0,
            loading: snapshot.loading,
            saving: false,
            deleting: false,
            blocked: false,
            navigation: { activeTabId: null, activeInternalTabIds: {} },
          },
          data: {
            ...(runtime?.get?.(`${popupPath}.data`) || {}),
            list: {
              definition: snapshot.definition,
              query: snapshot.query,
              originalEntries: snapshot.originalEntries.map((candidate) => ({ ...candidate })),
              entries: snapshot.entries.map((candidate) => ({ ...candidate })),
              selectedIds: [...snapshot.selectedIds],
              loading: snapshot.loading,
              paging: { ...snapshot.paging },
            },
            selection: {
              current:
                selectedCandidates()[0] != null
                  ? { ...selectedCandidates()[0], name: entryName(selectedCandidates()[0]) }
                  : { name: '' },
              selected: selectedCandidates().map((candidate) => ({ ...candidate })),
              facts:
                selectedCandidates()[0] != null
                  ? { alreadyInContext: false, ...candidateFactsFor(selectedCandidates()[0]) }
                  : { alreadyInContext: false },
            },
          },
        },
        { source: 'record-selector', action: 'selector-list-runtime-state' },
      );
    };

    const clearCtx = () => {
      popupRuntime.clearInspection?.(selectorCtxButton);
      popupRuntime.closeUiLevel?.(v2Surface);
    };

    let unregisterDismiss = null;
    let unbindDismissTarget = null;
    let unregisterPhysicalRetirer = null;
    const retirePhysicalHost = () => {
      unregisterDismiss?.();
      unregisterDismiss = null;
      unbindDismissTarget?.();
      unbindDismissTarget = null;
      unregisterPhysicalRetirer?.();
      unregisterPhysicalRetirer = null;
      popupRuntime.clearInspection?.(selectorCtxButton);
      backdrop.remove();
    };
    const makeSurfaceResult = (outcome, detail = {}) =>
      popupRuntime.surfaceResult(v2Surface, outcome, detail);

    const close = (surfaceResult = makeSurfaceResult('closed')) => {
      clearCtx();
      retirePhysicalHost();
      if (typeof onClose === 'function') onClose(surfaceResult);
      return surfaceResult;
    };
    unregisterPhysicalRetirer = popupRuntime?.registerPhysicalSurfaceRetirer?.(retirePhysicalHost);

    const updatePaging = (pages, total) => {
      const showPager = pages > 1;
      const summaryWrap = panel.querySelector('[data-selector-page-summary-wrap]');
      const paginationNav = panel.querySelector('[data-selector-pagination-nav]');
      if (summaryWrap instanceof HTMLElement) summaryWrap.hidden = !showPager;
      if (paginationNav instanceof HTMLElement) paginationNav.hidden = !showPager;

      const pageSizeWrap = panel.querySelector('[data-selector-page-size-wrap]');
      const sizes = [...panel.querySelectorAll('[data-selector-page-size] option')]
        .map((option) => Number(option.value))
        .filter((value) => Number.isFinite(value) && value > 0);
      const minimumPageSize = sizes.length
        ? Math.min(...sizes)
        : listRuntime.snapshot.paging.pageSize;
      if (pageSizeWrap instanceof HTMLElement) pageSizeWrap.hidden = total < minimumPageSize;

      const firstItem = panel.querySelector('[data-selector-first-item]');
      const prevItem = panel.querySelector('[data-selector-prev-item]');
      const nextItem = panel.querySelector('[data-selector-next-item]');
      const lastItem = panel.querySelector('[data-selector-last-item]');
      firstItem?.classList.toggle('disabled', listRuntime.snapshot.paging.page <= 1);
      prevItem?.classList.toggle('disabled', listRuntime.snapshot.paging.page <= 1);
      nextItem?.classList.toggle('disabled', listRuntime.snapshot.paging.page >= pages);
      lastItem?.classList.toggle('disabled', listRuntime.snapshot.paging.page >= pages);

      const current = panel.querySelector('[data-selector-current-page]');
      if (current) current.textContent = String(listRuntime.snapshot.paging.page);
      const summary = panel.querySelector('[data-selector-page-summary]');
      if (summary) summary.textContent = `Page ${listRuntime.snapshot.paging.page} of ${pages}`;
    };

    let currentContextNote = '';
    const updateNote = () => {
      if (!(note instanceof HTMLElement)) return;
      const selected = selectedCandidates();
      const selectedEntry = selected[0] || null;
      const fallback = selected.length
        ? selectionMode === 'single'
          ? `Selected ${entryName(selectedEntry)}.`
          : `${selected.length} entries selected.`
        : selectionMode === 'multiple'
          ? 'Select one or more entries to continue.'
          : 'Select an entry to continue.';
      publishEvaluationState({
        selection: {
          current: selectedEntry
            ? { ...selectedEntry, name: entryName(selectedEntry) }
            : { name: '' },
          selected: selected.map((candidate) => ({ ...candidate })),
          facts: selectedEntry
            ? { alreadyInContext: false, ...candidateFactsFor(selectedEntry) }
            : { alreadyInContext: false },
        },
      });
      currentContextNote = String(evaluateUIRule('contextNote', fallback));
      note.textContent = currentContextNote;
    };

    const refreshSelectionUi = () => {
      rowsHost?.querySelectorAll('[data-selector-row]').forEach((row) => {
        const selected = listRuntime.snapshot.selectedIds.includes(
          String(row.dataset.candidateId || ''),
        );
        row.classList.toggle('table-primary', selected);
        row.setAttribute('aria-selected', String(selected));
      });
      if (selectButton instanceof HTMLButtonElement)
        selectButton.disabled = listRuntime.snapshot.selectedIds.length === 0;
      updateNote();
      syncCtx();
    };

    const render = async (queryPatch = null) => {
      const snapshot = queryPatch
        ? await listRuntime.setQuery(queryPatch)
        : await listRuntime.load();
      const pageRows = snapshot.entries;

      if (rowsHost) {
        const renderedRows = pageRows
          .map((candidate) => {
            const id = candidateId(candidate, idField);
            const prototype = presentationRowFor(candidate);
            if (!(prototype instanceof HTMLTableRowElement)) {
              console.warn(
                `[ManatOS record selector] Missing canonical list-row presentation for candidate ${id}`,
              );
              return null;
            }
            const row = prototype.cloneNode(true);
            const eligibilityResult = candidateEligibility(candidate);
            const selected = snapshot.selectedIds.includes(id);
            const candidateFacts = candidateFactsFor(candidate);
            publishEvaluationState({
              row: { current: { ...candidate }, facts: { ...candidateFacts } },
            });
            const policyRowClass = String(evaluateUIRule('rowClass', '') || '');
            row.removeAttribute('data-selector-candidate-row');
            row.dataset.selectorRow = '';
            row.tabIndex = eligibilityResult.eligible ? 0 : -1;
            row.classList.toggle('table-primary', selected);
            row.classList.toggle('text-secondary', !eligibilityResult.eligible);
            row.classList.toggle('opacity-50', !eligibilityResult.eligible);
            if (policyRowClass)
              policyRowClass
                .split(/\s+/)
                .filter(Boolean)
                .forEach((name) => row.classList.add(name));
            row.setAttribute('aria-selected', String(selected));
            if (!eligibilityResult.eligible) {
              row.setAttribute('aria-disabled', 'true');
              row.title = eligibilityResult.reason || 'This entry cannot be selected.';
            }
            return row;
          })
          .filter(Boolean);
        if (renderedRows.length) rowsHost.replaceChildren(...renderedRows);
        else {
          const emptyRow = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = Math.max(1, visibleFields.length);
          cell.className = 'empty-table-state';
          cell.innerHTML =
            '<i class="bi bi-search"></i><strong>No entries found</strong><span>No existing entries match the current filter. Change or clear the filters.</span>';
          emptyRow.append(cell);
          rowsHost.replaceChildren(emptyRow);
        }
      }
      const count = panel.querySelector('[data-selector-count]');
      if (count) count.textContent = String(snapshot.paging.total);
      updatePaging(snapshot.paging.totalPages, snapshot.paging.total);
      refreshSelectionUi();
    };

    const selectRow = (row) => {
      if (!(row instanceof HTMLElement) || row.getAttribute('aria-disabled') === 'true') return;
      const id = String(row.dataset.candidateId || '');
      if (!id) return;

      if (selectionMode === 'single') {
        listRuntime.select(id);
      } else if (listRuntime.snapshot.selectedIds.includes(id)) {
        listRuntime.deselect(id);
      } else {
        listRuntime.select(id);
      }

      // Keep the same row DOM node alive so browser dblclick semantics remain
      // reliable. Filtering/paging rebuild rows; selection itself only updates
      // presentation and CTX state.
      refreshSelectionUi();
    };

    const commitSelection = () => {
      const selected = selectedCandidates();
      if (!selected.length) return;
      const selectedValue = selectionMode === 'single' ? selected[0] : selected;
      const surfaceResult = makeSurfaceResult('selected', {
        value: selectedValue,
        metadata: { entityName: resolvedInvocation.entityName ?? null },
      });
      if (typeof onSelect === 'function' && onSelect(surfaceResult) === false) return;
      window.dispatchEvent(
        new CustomEvent('manatos:record-selector-selection', { detail: surfaceResult }),
      );
      close(surfaceResult);
    };

    panel.addEventListener('click', (event) => {
      const row =
        event.target instanceof Element ? event.target.closest('[data-selector-row]') : null;
      if (row instanceof HTMLElement) selectRow(row);
    });
    panel.addEventListener('dblclick', (event) => {
      if (selectionMode !== 'single') return;
      const row =
        event.target instanceof Element ? event.target.closest('[data-selector-row]') : null;
      if (!(row instanceof HTMLElement) || row.getAttribute('aria-disabled') === 'true') return;
      selectRow(row);
      commitSelection();
    });
    panel.addEventListener('keydown', (event) => {
      const row =
        event.target instanceof Element ? event.target.closest('[data-selector-row]') : null;
      if (!(row instanceof HTMLElement) || row.getAttribute('aria-disabled') === 'true') return;
      if (event.key === 'Enter' && selectionMode === 'single') {
        event.preventDefault();
        selectRow(row);
        commitSelection();
      } else if (event.key === ' ') {
        event.preventDefault();
        selectRow(row);
      }
    });

    unregisterDismiss = popupRuntime.registerDismissHandler?.(v2Surface, () => close());
    unbindDismissTarget = popupRuntime.bindDismissTarget?.(v2Surface, backdrop);
    panel.querySelector('[data-selector-close]')?.addEventListener('click', () => {
      popupRuntime.requestDismiss?.(v2Surface, 'close-button');
    });
    panel.querySelector('[data-selector-cancel]')?.addEventListener('click', () => {
      popupRuntime.requestDismiss?.(v2Surface, 'cancel-button');
    });
    // Universal ManatOS popup rule: backdrop clicks never dismiss a popup.
    search?.addEventListener('input', () => {
      void render({ page: 1, search: String(search.value || '') });
    });
    panel.querySelector('[data-selector-filters-toggle]')?.addEventListener('click', (event) => {
      const filters = panel.querySelector('[data-selector-filters]');
      if (!(filters instanceof HTMLElement)) return;
      filters.hidden = !filters.hidden;
      event.currentTarget?.setAttribute?.('aria-expanded', String(!filters.hidden));
    });
    panel.querySelector('[data-selector-filter-apply]')?.addEventListener('click', () => {
      void render({ page: 1, filters: fieldFilterValues() });
    });
    panel.querySelector('[data-selector-filter-clear]')?.addEventListener('click', () => {
      panel.querySelectorAll('[data-selector-field-filter]').forEach((control) => {
        control.value = '';
      });
      void render({ page: 1, filters: fieldFilterValues() });
    });
    panel.querySelector('[data-selector-page-size]')?.addEventListener('change', (event) => {
      void render({ page: 1, pageSize: Number(event.target.value) || 10 });
    });
    panel.querySelector('[data-selector-first]')?.addEventListener('click', () => {
      void render({ page: 1 });
    });
    panel.querySelector('[data-selector-prev]')?.addEventListener('click', () => {
      void render({ page: Math.max(1, listRuntime.snapshot.paging.page - 1) });
    });
    panel.querySelector('[data-selector-next]')?.addEventListener('click', () => {
      void render({ page: listRuntime.snapshot.paging.page + 1 });
    });
    panel.querySelector('[data-selector-last]')?.addEventListener('click', () => {
      void render({ page: listRuntime.snapshot.paging.totalPages });
    });
    selectButton?.addEventListener('click', commitSelection);

    void render();
    if (autofocusSearch) search?.focus();
    void primeUIRuleAsts().then(() => {
      applySelectorPresentationRules();
      void render();
      backdrop.dataset.manatosPopupReady = 'true';
      if (autofocusSearch && document.activeElement === document.body) search?.focus();
    });

    return Object.freeze({
      close,
      popupPath,
      invocation: resolvedInvocation,
    });
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.popup = window.ManatOS.popup || {};
  window.ManatOS.popup.recordSelector = Object.freeze({
    open,
    leafPagePath,
  });
})();
