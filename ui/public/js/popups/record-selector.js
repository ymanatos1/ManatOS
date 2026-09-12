/**
 * Generic metadata-driven existing-record selector.
 *
 * The selector deliberately reuses the same EJS list toolbar/filter/header/
 * paging components as ordinary SysBO browse pages. This runtime adds only
 * popup-local concerns: candidate eligibility, selection, paging, CTX state and
 * returning the chosen record(s) to the caller.
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

  const entityContextFor = (entityKey) => {
    const entities = runtime?.value?.entities;
    if (!entities || typeof entities !== 'object') return null;
    return Object.values(entities).find((entity) => entity?.key === entityKey) || null;
  };

  const candidateId = (candidate, primaryIdField = 'id') =>
    String(candidate?.[primaryIdField] ?? candidate?.id ?? candidate?.value ?? '');

  const entryName = (candidate, primaryField) =>
    String(
      candidate?.__entryName ??
        candidate?.label ??
        candidate?.[primaryField] ??
        candidate?.name ??
        candidate?.id ??
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
      presentation: { title: '', mode: 'subtle' },
      state: { valid: false },
    });
    if (!v2Surface) {
      console.warn('[ManatOS record selector] PopupRuntime could not open selector surface');
      return null;
    }
    const popupPath = v2Surface.path;

    popupRuntime.updateUiLevel?.(
      v2Surface,
      {
        selection: {
          current: { __entryName: '' },
          selected: [],
          facts: { alreadyInContext: false },
        },
        row: { current: {}, facts: { alreadyInContext: false } },
      },
      { source: 'record-selector', action: 'initialize-selector-state' },
    );

    const publishEvaluationState = ({ selection = null, row = null } = {}) => {
      const current = runtime?.get?.(popupPath);
      if (!current || typeof current !== 'object') return;
      const patch = {};
      if (selection) patch.selection = selection;
      if (row) patch.row = row;
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
    backdrop.append(fragment);
    document.body.append(backdrop);

    const search = panel.querySelector('[data-selector-filter]');
    const rowsHost = panel.querySelector('[data-selector-rows]');
    const selectButton = panel.querySelector('[data-selector-select]');
    const note = panel.querySelector('[data-selector-context-note]');
    let pageSize = Number(panel.querySelector('[data-selector-page-size]')?.value) || 10;
    let currentPage = 1;
    const selectedIds = new Set(
      (Array.isArray(initialSelection)
        ? initialSelection
        : initialSelection == null
          ? []
          : [initialSelection]
      )
        .map((value) => String(value))
        .filter(Boolean),
    );

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

    const matchingRows = () => {
      const term = String(search?.value || '')
        .trim()
        .toLowerCase();
      const activeFilters = [...panel.querySelectorAll('[data-selector-field-filter]')];

      return source.filter((candidate) => {
        if (!candidate || typeof candidate !== 'object') return false;
        const id = candidateId(candidate, idField);
        if (!id) return false;

        const eligibilityResult = candidateEligibility(candidate);
        if (!eligibilityResult.visible) return false;

        if (term) {
          if (!searchTextFor(candidate).includes(term)) return false;
        }

        return activeFilters.every((control) => {
          const key = control.dataset.selectorFieldFilter;
          const wanted = String(control.value || '')
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

    const syncCtx = (filtered = matchingRows(), phase = 'open') => {
      if (!runtime?.replace) return;
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      popupRuntime.updateUiLevel?.(
        v2Surface,
        {
          invocation: { ...resolvedInvocation },
          presentation: {
            kind: 'selector',
            mode: presentationMode,
            title: selectorTitleText,
            contextNote: currentContextNote,
            showContextNote,
            autofocusSearch,
          },
          state: {
            lifecycle: phase === 'closing' ? 'closing' : 'active',
            active: phase !== 'closing',
            dirty: false,
            valid: selectedIds.size > 0,
            loading: false,
            saving: false,
            deleting: false,
            blocked: false,
            navigation: { activeTabId: null, activeInternalTabIds: {} },
          },
          facts: {
            search: String(search?.value || ''),
            filters: { ...fieldFilterValues() },
            paging: { page: currentPage, pageSize, total: filtered.length, totalPages },
          },
          list: {
            originalEntries: source.map((candidate) => ({ ...candidate })),
            entries: filtered.map((candidate) => ({ ...candidate })),
          },
          selection: {
            current:
              selectedCandidates()[0] != null
                ? { __entryName: '', ...selectedCandidates()[0] }
                : { __entryName: '' },
            selected: selectedCandidates().map((candidate) => ({ ...candidate })),
            facts:
              selectedCandidates()[0] != null
                ? { alreadyInContext: false, ...candidateFactsFor(selectedCandidates()[0]) }
                : { alreadyInContext: false },
          },
        },
        { source: 'record-selector', action: 'selector-v2-state' },
      );
    };

    const clearCtx = () => {
      popupRuntime.clearInspection?.(selectorCtxButton);
      popupRuntime.closeUiLevel?.(v2Surface);
    };

    const close = () => {
      syncCtx(matchingRows(), 'closing');
      clearCtx();
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    };

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
      const minimumPageSize = sizes.length ? Math.min(...sizes) : pageSize;
      if (pageSizeWrap instanceof HTMLElement) pageSizeWrap.hidden = total < minimumPageSize;

      const firstItem = panel.querySelector('[data-selector-first-item]');
      const prevItem = panel.querySelector('[data-selector-prev-item]');
      const nextItem = panel.querySelector('[data-selector-next-item]');
      const lastItem = panel.querySelector('[data-selector-last-item]');
      firstItem?.classList.toggle('disabled', currentPage <= 1);
      prevItem?.classList.toggle('disabled', currentPage <= 1);
      nextItem?.classList.toggle('disabled', currentPage >= pages);
      lastItem?.classList.toggle('disabled', currentPage >= pages);

      const current = panel.querySelector('[data-selector-current-page]');
      if (current) current.textContent = String(currentPage);
      const summary = panel.querySelector('[data-selector-page-summary]');
      if (summary) summary.textContent = `Page ${currentPage} of ${pages}`;
    };

    const selectedCandidates = () =>
      source.filter((candidate) => selectedIds.has(candidateId(candidate, idField)));

    let currentContextNote = '';
    const updateNote = () => {
      if (!(note instanceof HTMLElement)) return;
      const selected = selectedCandidates();
      const selectedEntry = selected[0] || null;
      const fallback = selected.length
        ? selectionMode === 'single'
          ? `Selected ${entryName(selectedEntry, primaryField)}.`
          : `${selected.length} entries selected.`
        : selectionMode === 'multiple'
          ? 'Select one or more entries to continue.'
          : 'Select an entry to continue.';
      publishEvaluationState({
        selection: {
          current: selectedEntry ? { __entryName: '', ...selectedEntry } : { __entryName: '' },
          selected: selected.map((candidate) => ({ ...candidate })),
          facts: selectedEntry
            ? { alreadyInContext: false, ...candidateFactsFor(selectedEntry) }
            : { alreadyInContext: false },
        },
      });
      currentContextNote = String(evaluateUIRule('contextNote', fallback));
      note.textContent = currentContextNote;
    };

    const refreshSelectionUi = (filtered = matchingRows()) => {
      rowsHost?.querySelectorAll('[data-selector-row]').forEach((row) => {
        const selected = selectedIds.has(String(row.dataset.candidateId || ''));
        row.classList.toggle('table-primary', selected);
        row.setAttribute('aria-selected', String(selected));
      });
      if (selectButton instanceof HTMLButtonElement) selectButton.disabled = selectedIds.size === 0;
      updateNote();
      syncCtx(filtered);
    };

    const render = () => {
      const filtered = matchingRows();
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      currentPage = Math.min(Math.max(1, currentPage), pages);
      const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
            const selected = selectedIds.has(id);
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

        if (renderedRows.length) {
          rowsHost.replaceChildren(...renderedRows);
        } else {
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
      if (count) count.textContent = String(filtered.length);
      updatePaging(pages, filtered.length);
      refreshSelectionUi(filtered);
    };

    const selectRow = (row) => {
      if (!(row instanceof HTMLElement) || row.getAttribute('aria-disabled') === 'true') return;
      const id = String(row.dataset.candidateId || '');
      if (!id) return;

      if (selectionMode === 'single') {
        selectedIds.clear();
        selectedIds.add(id);
      } else if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }

      // Keep the same row DOM node alive so browser dblclick semantics remain
      // reliable. Filtering/paging rebuild rows; selection itself only updates
      // presentation and CTX state.
      refreshSelectionUi();
    };

    const commitSelection = () => {
      const selected = selectedCandidates();
      if (!selected.length) return;
      const result = selectionMode === 'single' ? selected[0] : selected;
      if (typeof onSelect === 'function' && onSelect(result, resolvedInvocation) === false) return;
      window.dispatchEvent(
        new CustomEvent('manatos:record-selector-selection', {
          detail: {
            outcome: 'selected',
            entityName: resolvedInvocation.entityName ?? null,
            selected: result,
          },
        }),
      );
      close();
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

    panel.querySelector('[data-selector-close]')?.addEventListener('click', close);
    panel.querySelector('[data-selector-cancel]')?.addEventListener('click', close);
    // Universal ManatOS popup rule: backdrop clicks never dismiss a popup.
    search?.addEventListener('input', () => {
      currentPage = 1;
      render();
    });
    panel.querySelector('[data-selector-filters-toggle]')?.addEventListener('click', (event) => {
      const filters = panel.querySelector('[data-selector-filters]');
      if (!(filters instanceof HTMLElement)) return;
      filters.hidden = !filters.hidden;
      event.currentTarget?.setAttribute?.('aria-expanded', String(!filters.hidden));
    });
    panel.querySelector('[data-selector-filter-apply]')?.addEventListener('click', () => {
      currentPage = 1;
      render();
    });
    panel.querySelector('[data-selector-filter-clear]')?.addEventListener('click', () => {
      panel.querySelectorAll('[data-selector-field-filter]').forEach((control) => {
        control.value = '';
      });
      currentPage = 1;
      render();
    });
    panel.querySelector('[data-selector-page-size]')?.addEventListener('change', (event) => {
      pageSize = Number(event.target.value) || 10;
      currentPage = 1;
      render();
    });
    panel.querySelector('[data-selector-first]')?.addEventListener('click', () => {
      currentPage = 1;
      render();
    });
    panel.querySelector('[data-selector-prev]')?.addEventListener('click', () => {
      currentPage = Math.max(1, currentPage - 1);
      render();
    });
    panel.querySelector('[data-selector-next]')?.addEventListener('click', () => {
      currentPage += 1;
      render();
    });
    panel.querySelector('[data-selector-last]')?.addEventListener('click', () => {
      currentPage = Math.max(1, Math.ceil(matchingRows().length / pageSize));
      render();
    });
    selectButton?.addEventListener('click', commitSelection);

    render();
    if (autofocusSearch) search?.focus();
    void primeUIRuleAsts().then(() => {
      applySelectorPresentationRules();
      render();
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
