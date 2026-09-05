/**
 * Generic metadata-driven existing-record selector.
 *
 * The selector deliberately reuses the same EJS list toolbar/filter/header/
 * paging components as ordinary SysBO browse pages. This runtime adds only
 * popup-local concerns: candidate eligibility, selection, paging, CTX state and
 * returning the chosen record(s) to the caller.
 *
 * Callers describe WHY the selector is open through callingParams. Those
 * resolved parameters are projected under the live popup CTX node so both
 * expressions and CTX Viewer diagnostics can inspect the exact invocation.
 */
(() => {
  const runtime = window.ManatOS?.ctx;
  const popupRuntime = window.ManatOSPopupRuntime;

  const parseJson = (value, fallback) => {
    try {
      const parsed = JSON.parse(String(value || ''));
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
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
    callingParams = {},
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

    const entityKey = String(callingParams.entityKey || panel.dataset.selectorEntityKey || '');
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
    const selectionMode = callingParams.selectionMode === 'multiple' ? 'multiple' : 'single';
    const idField = String(callingParams.idField || 'id');
    const resolvedCallingParams = Object.freeze({
      // Keep every selector UI-policy input present in the invocation scope,
      // even when a caller does not need it. The canonical evaluator treats an
      // explicit null as a resolved scalar value; an absent/undefined nested
      // member would otherwise fall through to the page CTX resolver.
      purpose: String(callingParams.purpose || 'select-existing-entry'),
      presentationMode: callingParams.presentationMode ?? null,
      title: callingParams.title ?? null,
      targetField: callingParams.targetField ?? null,
      targetFieldLabel: callingParams.targetFieldLabel ?? null,
      targetEntityLabel: callingParams.targetEntityLabel ?? metadata.name ?? 'entry',
      sourceEntityKey: callingParams.sourceEntityKey ?? null,
      sourceEntityLabel: callingParams.sourceEntityLabel ?? null,
      sourceRecordId: callingParams.sourceRecordId ?? null,
      sourceRecordName: callingParams.sourceRecordName ?? null,
      relation: callingParams.relation ?? null,
      anchorRecordId: callingParams.anchorRecordId ?? null,
      queryPredicate: callingParams.queryPredicate ?? null,
      allowClear: callingParams.allowClear ?? false,
      showContextNote: callingParams.showContextNote ?? null,
      autofocusSearch: callingParams.autofocusSearch ?? null,
      ...callingParams,
      entityKey,
      selectionMode,
    });

    // UI rules are canonical precompiled expressions emitted by the server.
    // Evaluate them against the same invocation object that is projected into
    // popup.callingParams; never reparse expression strings in the browser.
    const expressionRuntime = window.ManatOS?.expression;
    const evaluateUIRule = (key, fallback, scope = {}) => {
      const compiled = uiRules?.[key];
      const ast = compiled?.ast;
      if (!ast || !expressionRuntime?.evaluateAstWithScope) return fallback;

      // UI policy expressions are scalar expressions. Give every structured
      // selector object a stable scalar-facing shape so a missing property is
      // represented by null/false rather than accidentally escaping the
      // explicit scope and resolving against the surrounding page CTX.
      const selectedEntry =
        scope.selectedEntry && typeof scope.selectedEntry === 'object'
          ? { __entryName: '', ...scope.selectedEntry }
          : { __entryName: '' };
      const candidate =
        scope.candidate && typeof scope.candidate === 'object' ? scope.candidate : {};
      const selectionFacts =
        scope.selectionFacts && typeof scope.selectionFacts === 'object'
          ? { alreadyInContext: false, ...scope.selectionFacts }
          : { alreadyInContext: false };
      const candidateFacts =
        scope.candidateFacts && typeof scope.candidateFacts === 'object'
          ? { alreadyInContext: false, ...scope.candidateFacts }
          : { alreadyInContext: false };

      try {
        const value = expressionRuntime.evaluateAstWithScope(ast, {
          callingParams: resolvedCallingParams,
          selectedEntry,
          selectedEntries: Array.isArray(scope.selectedEntries) ? scope.selectedEntries : [],
          selectionFacts,
          candidate,
          candidateFacts,
        });
        return value == null ? fallback : value;
      } catch (error) {
        console.warn(`[ManatOS record selector] UI rule ${key} failed`, error);
        return fallback;
      }
    };
    const presentationMode = String(evaluateUIRule('presentationMode', 'subtle'));
    const selectorTitleText = String(
      evaluateUIRule(
        'title',
        resolvedCallingParams.title || `Select existing ${metadata.name || 'entry'}`,
      ),
    );
    const showContextNote = Boolean(evaluateUIRule('showContextNote', true));
    const autofocusSearch = Boolean(evaluateUIRule('autofocusSearch', true));
    panel.dataset.selectorPresentation = presentationMode;
    panel.classList.toggle('is-entry-presentation', presentationMode === 'entry');
    panel.classList.toggle('is-subtle-presentation', presentationMode !== 'entry');

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop metadata-record-selector-backdrop';
    backdrop.dataset.recordSelectorBackdrop = '';
    backdrop.append(fragment);
    document.body.append(backdrop);

    const selectorTitle = panel.querySelector('[data-selector-title]');
    if (selectorTitle instanceof HTMLElement) selectorTitle.textContent = selectorTitleText;

    const search = panel.querySelector('[data-selector-filter]');
    const rowsHost = panel.querySelector('[data-selector-rows]');
    const selectButton = panel.querySelector('[data-selector-select]');
    const note = panel.querySelector('[data-selector-context-note]');
    if (note instanceof HTMLElement) note.hidden = !showContextNote;
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

    const popupPath = popupRuntime?.popupPath?.() || `${leafPagePath() || 'ctx.page'}.popup`;
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

    const candidateEligibility = (candidate) =>
      normalizeEligibility(
        typeof eligibility === 'function' ? eligibility(candidate, resolvedCallingParams) : true,
      );

    // Callers may project domain facts for a candidate, but presentation remains
    // selector-owned and evaluator-driven. This keeps hierarchy membership,
    // relationship state, etc. out of popup DOM/string-building callbacks.
    const candidateFactsFor = (candidate) => {
      if (typeof factsForCandidate !== 'function') return { alreadyInContext: false };
      const facts = factsForCandidate(candidate, resolvedCallingParams);
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
      const payload = popupRuntime?.createPayload?.({
        kind: 'record-selector',
        callingParams: resolvedCallingParams,
        presentation: {
          mode: presentationMode,
          title: selectorTitleText,
          contextNote: currentContextNote,
          showContextNote,
          autofocusSearch,
        },
        entriesOriginal: source.map((candidate) => ({ ...candidate })),
        entries: source.map((candidate) => ({ ...candidate })),
        filters: {
          ...fieldFilterValues(),
          ...(resolvedCallingParams.queryPredicate != null
            ? { queryPredicate: resolvedCallingParams.queryPredicate }
            : {}),
        },
        search: String(search?.value || ''),
        paging: {
          page: currentPage,
          pageSize,
          total: filtered.length,
          totalPages,
        },
        selectedId: selectionMode === 'single' ? ([...selectedIds][0] ?? null) : null,
        selectedIds: [...selectedIds],
        state: {
          phase,
          open: phase === 'opening' || phase === 'open',
          dirty: false,
          valid: selectedIds.size > 0,
          internalEditing: false,
          internalEditorCount: 0,
          saving: false,
          deleting: false,
        },
      }) || {
        kind: 'record-selector',
        callingParams: { ...resolvedCallingParams },
        presentation: { mode: presentationMode, title: selectorTitleText },
        state: {
          phase,
          open: phase === 'opening' || phase === 'open',
          valid: selectedIds.size > 0,
        },
      };
      runtime.replace(popupPath, payload, {
        source: 'record-selector',
        action: 'selector-state',
        triggerPath: popupPath,
      });
    };

    const clearCtx = () => {
      popupRuntime?.clearInspection?.(selectorCtxButton);
      if (runtime?.replace) {
        runtime.replace(popupPath, null, {
          source: 'record-selector',
          action: 'close-record-selector',
          triggerPath: popupPath,
        });
      }
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
      currentContextNote = String(
        evaluateUIRule('contextNote', fallback, {
          selectedEntry,
          selectedEntries: selected,
          selectionFacts: selectedEntry ? candidateFactsFor(selectedEntry) : {},
        }),
      );
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
            const policyRowClass = String(
              evaluateUIRule('rowClass', '', { candidate, candidateFacts }) || '',
            );

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
      if (typeof onSelect === 'function' && onSelect(result, resolvedCallingParams) === false)
        return;
      window.dispatchEvent(
        new CustomEvent('manatos:record-selector-selection', {
          detail: {
            entityKey,
            purpose: resolvedCallingParams.purpose,
            callingParams: { ...resolvedCallingParams },
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

    return Object.freeze({
      close,
      popupPath,
      callingParams: resolvedCallingParams,
    });
  };

  window.ManatOSRecordSelector = Object.freeze({
    open,
    leafPagePath,
  });
})();
