import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('generic existing-record selector', () => {
  it('composes the selector from the same metadata-driven list components as browse pages', async () => {
    const selector = await uiSource('views/popups/selectors/record-selector.ejs');
    const listPage = await uiSource('views/components/runtime/entity-list.ejs');

    for (const partial of ['list-toolbar', 'list-filters', 'list-table-header', 'list-paging']) {
      expect(selector).toContain(`../../components/sysbo/list/${partial}`);
      expect(listPage).toContain(`../sysbo/list/${partial}`);
    }
    expect(selector).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(listPage).toContain("include('../sysbo/list/list-row-cells'");

    expect(selector).toContain('selectorMode: true');
    expect(selector).toContain('data-record-selector-template');
    expect(selector).toContain('data-selector-visible-fields');
    expect(selector).toContain('data-selector-filter-fields');
    expect(selector).toContain('data-selector-candidate-rows');
    expect(selector).toContain('data-selector-filter-modes');
    expect(selector).toContain('listMetadata: recordSelectorListMetadata');
    expect(selector).not.toContain('recordSelectorUI.list.common');
  });

  it('shares canonical list-cell presentation instead of rebuilding field cells in browser selector code', async () => {
    const selectorView = await uiSource('views/popups/selectors/record-selector.ejs');
    const listPage = await uiSource('views/components/runtime/entity-list.ejs');
    const rowCells = await uiSource('views/components/sysbo/list/list-row-cells.ejs');
    const runtime = await uiSource('public/js/popups/record-selector.js');
    const reference = await uiSource('views/components/sysbo/entry/fields/reference-select.ejs');
    const hierarchy = await uiSource('views/components/sysbo/hierarchy/hierarchy-workspace.ejs');

    expect(selectorView).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(listPage).toContain("include('../sysbo/list/list-row-cells'");
    expect(rowCells).toContain('Canonical metadata-driven record-cell presentation shared');
    expect(rowCells).toContain("field.type === 'reference'");
    expect(rowCells).toContain("field.type === 'boolean'");
    expect(selectorView).toContain('selectorCandidates');
    expect(selectorView).toContain("typeof selectorQueryExclude !== 'undefined'");
    expect(reference).toContain('selectorCandidates: references');
    expect(reference).toContain('selectorListMetadata: referenceSelectorContext.listMetadata');
    expect(hierarchy).toContain('selectorCandidates: Array.isArray');
    expect(hierarchy).toContain('selectorListMetadata,');
    expect(runtime).toContain("panel.querySelector('[data-selector-candidate-rows]')");
    expect(runtime).toContain('prototype.cloneNode(true)');
    expect(runtime).toContain('filterModes');
    expect(runtime).not.toContain('const displayCellHtml =');
    expect(runtime).not.toContain('const displayValue =');
    expect(runtime).not.toContain('referenceCandidatesFor');
    expect(runtime).not.toContain("field?.type === 'enum'");
    expect(runtime).not.toContain("field?.type === 'reference'");
    expect(runtime).toContain(
      'entryRepresentation?.projected?.(candidate, candidateId(candidate))',
    );
    expect(runtime).not.toContain('candidate?.__entryName ?? candidateId(candidate)');
    expect(runtime).not.toContain('candidate?.label ??');
    expect(runtime).not.toContain('candidate?.[primaryField] ??');
    expect(selectorView).toContain('projectedReferenceRepresentation(item, candidateId)');
    expect(selectorView).not.toContain('item?.__entryName || candidateId');
    expect(selectorView).not.toContain('entryRepresentationFor(\n            selectorEntityKey');
    expect(rowCells).toContain('entryRepresentationFor(definition.key, item');
    expect(rowCells).not.toContain('item?.__entryName || item?.label');
    expect(runtime).toContain('new EntityListRuntime({');
    expect(runtime).toContain('listRuntime.setQuery(queryPatch)');
    expect(runtime).toContain('listRuntime.select(id)');
    expect(runtime).not.toContain('const matchingRows =');
    expect(runtime).not.toContain('let currentPage =');
    expect(runtime).not.toContain('const selectedIds = new Set(');
  });

  it('projects invocation parameters separately from mutable selector state in CTX', async () => {
    const runtime = await uiSource('public/js/popups/record-selector.js');
    const dataAccess = await uiSource('src/routes/sysbo/shared/data-access.ts');

    expect(runtime).toContain("kind: 'selector'");
    expect(runtime).toContain('invocation: { ...resolvedInvocation }');
    expect(runtime).toContain('definition: snapshot.definition');
    expect(runtime).toContain('query: snapshot.query');
    expect(runtime).not.toContain('originalEntries: snapshot.originalEntries.map');
    expect(runtime).toContain('entries: snapshot.entries.map');
    expect(runtime).toContain('selectedIds: [...snapshot.selectedIds]');
    expect(runtime).toContain('selected: selectedCandidates().map');
    expect(runtime).toContain('const currentState = runtime?.get?.(`${popupPath}.state`) || {};');
    expect(runtime).toContain('delete semanticState.lifecycle');
    expect(runtime).toContain('delete semanticState.active');
    expect(runtime).toContain('...semanticState');
    expect(runtime).not.toContain("phase = 'open'");
    expect(runtime).not.toContain("syncCtx('closing')");
    expect(runtime).toContain("source: 'record-selector'");
    expect(runtime).toContain('popupRuntime?.toggleInspection?.({');
    expect(runtime).toContain('path: popupPath');
    expect(runtime).toContain('popupRuntime?.openUiLevel?.({');
    expect(runtime).toContain("kind: 'selector'");
    expect(runtime).toContain("mode: 'select'");
    expect(runtime).toContain('popupRuntime.updateUiLevel?.(');
    expect(runtime).toContain('v2Surface');
    expect(runtime).toContain('popupRuntime.closeUiLevel?.(v2Surface)');
    expect(runtime).not.toContain('fallbackPopupPath');
    expect(runtime).toContain('if (!v2Surface) {');
    expect(runtime).not.toContain('popupRuntime?.popupPath?.() ||');
    expect(runtime).not.toContain('legacyPopupPath');
    expect(runtime).toContain('popupRuntime.surfaceResult(v2Surface, outcome, detail)');
    expect(runtime).toContain("makeSurfaceResult('selected'");
    expect(runtime).toContain('onSelect(surfaceResult)');
    expect(runtime).toContain('onClose(surfaceResult)');
    expect(runtime).toContain(
      "new CustomEvent('manatos:record-selector-selection', { detail: surfaceResult })",
    );
    expect(runtime).toMatch(/evaluateUIRule\(\s*'title'/);
    expect(runtime).toContain('resolvedInvocation.rules?.query?.exclude');
    expect(runtime).toContain("const idField = 'id'");
    expect(runtime).not.toContain('...callingParams,');
    expect(dataAccess).toContain("targetDefinition.boMetadata.exposure === 'internal'");
    expect(dataAccess).toContain('? undefined');
    expect(runtime).not.toContain('listExceptions = null');
  });

  it('lets canonical reference fields invoke the selector without owning selector/list behavior', async () => {
    const reference = await uiSource('views/components/sysbo/entry/fields/reference-select.ejs');
    const fieldRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    const selectorRuntime = await uiSource('public/js/popups/record-selector.js');
    const renderPage = await uiSource('src/presentation/page/render-page.ts');

    expect(reference).toContain("action: 'select-existing'");
    expect(reference).toContain("label: '@CM.FieldToolSelect'");
    expect(reference).toContain("include('../../../../popups/selectors/record-selector'");
    expect(reference).toContain('data-reference-entity-key');
    expect(fieldRuntime).toContain("case 'select-existing'");
    expect(fieldRuntime).toContain('surfaceRef: pagePath');
    expect(fieldRuntime).toMatch(
      /case 'select-existing':[\s\S]*?invocation: \{[\s\S]*?purpose: 'select'[\s\S]*?caller: \{[\s\S]*?surfaceRef: pagePath/,
    );
    expect(fieldRuntime).toContain('rules: { query: { exclude: queryExclude } }');
    expect(fieldRuntime).toContain(
      "behavior: { selection: 'single', allowClear: !control.required }",
    );
    expect(fieldRuntime).toContain('window.ManatOS?.popup?.recordSelector');
    expect(selectorRuntime).toContain("let path = 'ctx.ui.level'");
    expect(selectorRuntime).not.toContain("let path = 'ctx.page'");
    expect(fieldRuntime).toContain('ctxRuntime.get?.(`${pagePath}.data.entry.current`)');
    expect(fieldRuntime).toContain('ctxRuntime.get?.(`${pagePath}.data.fields.${fieldKey}`)');
    expect(fieldRuntime).not.toContain('ctxRuntime.resolve?.(`${pagePath}.data.entry.current`)');
    expect(fieldRuntime).not.toContain(
      'ctxRuntime.resolve?.(`${pagePath}.data.fields.${fieldKey}`)',
    );
    expect(fieldRuntime).toContain('const source = Array.isArray(fieldContext?.options)');
    expect(fieldRuntime).not.toContain('`${pagePath}.data.resources.referenceData`');
    expect(fieldRuntime).not.toContain('const renderedSource = [...control.options]');
    expect(fieldRuntime).not.toContain('ctxSource.length ? ctxSource : renderedSource');
    expect(fieldRuntime).toContain("purpose: 'select'");
    expect(fieldRuntime).toContain('sourceEntityName');
    expect(fieldRuntime).toContain('surfaceRef: pagePath');
    expect(fieldRuntime).not.toContain('title: `Select ${targetName} for ${fieldLabelText}`');
    expect(fieldRuntime).toContain('setReferenceValue(control, selectedId)');
    expect(fieldRuntime).not.toContain('The current entry cannot reference itself.');
    expect(fieldRuntime).not.toContain('data-selector-row');
    const dataAccess = await uiSource('src/routes/sysbo/shared/data-access.ts');
    expect(selectorRuntime).not.toContain('parentId');
    expect(selectorRuntime).not.toContain('Principal');
    expect(selectorRuntime).not.toContain('candidate?.__referenceUnavailable === true');
    expect(selectorRuntime).toContain('resolvedInvocation.rules?.query?.exclude');
    expect(selectorRuntime).not.toContain('panel.dataset.selectorQueryPredicateAst');
    expect(selectorRuntime).not.toContain('expressionCompiler');
    expect(selectorRuntime).toContain('publishEvaluationState({');
    expect(selectorRuntime).toContain(
      'row: { current: { ...candidate }, facts: { ...candidateFacts } }',
    );
    expect(selectorRuntime).not.toContain('evaluateAstWithScope(predicateAst, candidate)');
    expect(selectorRuntime).toContain('excludedIds.has(id)');
    expect(selectorRuntime).toContain('initialSelectedIds.has(id)');
    expect(fieldRuntime).toContain('dataset.referenceQueryExclude');
    expect(fieldRuntime).not.toContain('queryPredicateAst,');
    expect(reference).toContain('referenceSelectorContexts?.[key]');
    expect(reference).toContain('referenceSelectorContext.referenceData');
    expect(reference).not.toContain('targetField.referenceBOKey === referenceTargetKey');
    expect(dataAccess).toContain('selectorContextForReferenceField');
    expect(dataAccess).toContain('referenceData: await references(req, targetDefinition, {');
    expect(dataAccess).toContain('fieldKeys: selectorFieldKeys');
    expect(dataAccess).toContain('referenceCatalogueUnavailable(error)');
    expect(dataAccess).toContain("code === 'FORBIDDEN'");
    expect(dataAccess).toContain("code === 'HTTP_403'");
    expect(dataAccess).toContain('output[field.key] = []');
    expect(dataAccess).toContain('if (response.data.items.length === 0)');
    expect(dataAccess).toContain('const selectedId = options.sourceRecord?.[field.key]');
    expect(dataAccess).toContain(
      'if (persistedCandidate) projected.push(projectReference(persistedCandidate))',
    );
    expect(dataAccess).toContain('excludedCandidateIds: readonly string[]');
    expect(dataAccess).toContain('candidate.__referenceUnavailable === true');
    expect(dataAccess).not.toContain('preparedExpressionAst(queryPredicate)');
    expect(dataAccess).toContain('canonicalSysBOUIMetadata(req, referencedDefinition)');
    expect(dataAccess).toContain('if (!referenceCatalogueUnavailable(error)) throw error');
    expect(dataAccess).toContain('let referencedUIMetadata: SysBOUIMetadata | undefined');
    expect(renderPage).toContain('relatedEntityUIMetadata: allSysBOUIMetadata');
  });

  it('keeps hierarchy-specific relationship policy in the hierarchy caller', async () => {
    const hierarchy = await uiSource('public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js');
    const selector = await uiSource('public/js/popups/record-selector.js');

    expect(hierarchy).toContain("purpose: 'select'");
    expect(hierarchy).toContain('relationCandidateEligibility');
    expect(hierarchy).not.toContain('queryPredicate: listExceptions');
    expect(hierarchy).not.toContain(
      'title: `Select ${entityLabel} to place as ${memberName} ${relationLabel}`',
    );
    expect(hierarchy).toContain('factsForCandidate: (candidate) =>');
    expect(hierarchy).not.toContain('noteForSelection:');
    expect(hierarchy).not.toContain('rowClass:');
    expect(hierarchy).not.toContain(
      'selector.open({\n      template,\n      source,\n      listExceptions,',
    );
    expect(hierarchy).toContain('visible: result.eligible');
    expect(selector).toContain('typeof eligibility ===');
    expect(selector).not.toContain('relationCandidateEligibility');
    expect(selector).not.toContain('relationCandidateEligibility');
  });
  it('keeps selector expression evaluation CTX-owned instead of restoring detached browser scopes', async () => {
    const formRuntime = await uiSource('public/js/sysbo/entry/form-runtime.js');
    const selectorRuntime = await uiSource('public/js/popups/record-selector.js');

    expect(formRuntime).not.toContain('explicitEvaluationScopeValue');
    expect(formRuntime).not.toContain('evaluateAstWithScope');
    expect(formRuntime).not.toContain('evaluateAstOwnedWithScope');
    expect(selectorRuntime).toContain('evaluateAstAt');
    expect(selectorRuntime).not.toContain('evaluateAstWithScope');
  });

  it('drives selector presentation from evaluator-visible invocation rather than caller-specific DOM logic', async () => {
    const selectorView = await uiSource('views/popups/selectors/record-selector.ejs');
    const selectorRuntime = await uiSource('public/js/popups/record-selector.js');
    const hierarchy = await uiSource('public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js');
    const fieldRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    const renderPage = await uiSource('src/presentation/page/render-page.ts');
    const css = await uiSource('public/css/ui.css');

    expect(selectorView).toContain('data-selector-ui-rules');
    expect(selectorView).not.toContain('compileUIExpression');
    expect(selectorView).toContain('title: selectorTitleExpression');
    expect(selectorView).toContain('#control.invocation.presentation.layout');
    expect(selectorView).toContain('#control.invocation.presentation.title');
    expect(selectorView).toContain('#control.invocation.behavior.selection');
    expect(selectorView).not.toContain('callingParams.sourceRecordName');
    expect(selectorRuntime).toMatch(/evaluateUIRule\(\s*'title'/);
    expect(renderPage).not.toContain('compileExpression(expression)');
    expect(selectorRuntime).toContain('expressionRuntime?.astForSource?.(source)');
    expect(selectorRuntime).toContain('expressionRuntime.loadAstForSource(source)');
    expect(selectorView).not.toContain('preparedExpression');
    expect(selectorRuntime).toContain('invocation: { ...resolvedInvocation }');
    expect(selectorRuntime).toContain('const popupRuntime = window.ManatOS?.popup?.runtime');
    expect(selectorRuntime).toContain('window.ManatOS.popup.recordSelector = Object.freeze');
    expect(selectorRuntime).not.toContain('window.ManatOSRecordSelector =');
    expect(selectorRuntime).not.toContain('callingParams');
    expect(selectorRuntime).toContain('canonicalInvocation?.behavior?.autofocus');
    expect(selectorRuntime).not.toContain('...scope.candidateFacts');
    expect(selectorRuntime).toContain('publishEvaluationState');
    expect(selectorRuntime).toContain('evaluateAstAt(ast, popupPath)');
    expect(selectorRuntime).toContain(
      'row: { current: { ...candidate }, facts: { ...candidateFacts } }',
    );
    expect(selectorView).toContain('#data.selection.current.name ?');
    expect(selectorView).not.toContain('#data.selection.current.__entryName');
    expect(selectorView).not.toContain('selectedEntry ? (callingParams.targetFieldLabel');
    expect(selectorRuntime).toMatch(/evaluateUIRule\(\s*'contextNote'/);
    expect(selectorRuntime).toMatch(/evaluateUIRule\(\s*'rowClass'/);
    expect(selectorRuntime).not.toContain('compileExpression(');
    expect(selectorRuntime).toContain('contextNote: currentContextNote');
    expect(hierarchy).toContain("layout: 'subtle'");
    expect(selectorView).not.toContain("purpose == 'reference-field'");
    expect(selectorView).not.toContain("purpose == 'hierarchy-add-existing'");
    expect(fieldRuntime).toContain("presentation: { title, layout: 'entry' }");
    expect(css).toContain('.metadata-record-selector.is-entry-presentation');
    expect(css).toContain('.metadata-record-selector.is-subtle-presentation');
  });
});
