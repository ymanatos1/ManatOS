import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) => readFile(resolve(testDirectory, '..', relativePath), 'utf8');

describe('generic existing-record selector', () => {
  it('composes the selector from the same metadata-driven list components as browse pages', async () => {
    const selector = await uiSource('views/popups/selectors/record-selector.ejs');
    const listPage = await uiSource('views/pages/sysbo/list.ejs');

    for (const partial of ['list-toolbar', 'list-filters', 'list-table-header', 'list-paging']) {
      expect(selector).toContain(`../../components/sysbo/list/${partial}`);
      expect(listPage).toContain(`../../components/sysbo/list/${partial}`);
    }
    expect(selector).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(listPage).toContain("include('../../components/sysbo/list/list-row-cells'");

    expect(selector).toContain('selectorMode: true');
    expect(selector).toContain('data-record-selector-template');
    expect(selector).toContain('data-selector-visible-fields');
    expect(selector).toContain('data-selector-filter-fields');
    expect(selector).toContain('data-selector-candidate-rows');
    expect(selector).toContain('data-selector-filter-modes');
  });

  it('shares canonical list-cell presentation instead of rebuilding field cells in browser selector code', async () => {
    const selectorView = await uiSource('views/popups/selectors/record-selector.ejs');
    const listPage = await uiSource('views/pages/sysbo/list.ejs');
    const rowCells = await uiSource('views/components/sysbo/list/list-row-cells.ejs');
    const runtime = await uiSource('public/js/popups/record-selector.js');
    const reference = await uiSource('views/components/sysbo/entry/fields/reference-select.ejs');
    const hierarchy = await uiSource('views/components/sysbo/hierarchy/hierarchy-workspace.ejs');

    expect(selectorView).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(listPage).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(rowCells).toContain('Canonical metadata-driven record-cell presentation shared');
    expect(rowCells).toContain("field.type === 'reference'");
    expect(rowCells).toContain("field.type === 'boolean'");
    expect(selectorView).toContain('selectorCandidates');
    expect(reference).toContain('selectorCandidates: references');
    expect(hierarchy).toContain('selectorCandidates: Array.isArray');
    expect(runtime).toContain("panel.querySelector('[data-selector-candidate-rows]')");
    expect(runtime).toContain('prototype.cloneNode(true)');
    expect(runtime).toContain('filterModes');
    expect(runtime).not.toContain('const displayCellHtml =');
    expect(runtime).not.toContain('const displayValue =');
    expect(runtime).not.toContain('referenceCandidatesFor');
    expect(runtime).not.toContain("field?.type === 'enum'");
    expect(runtime).not.toContain("field?.type === 'reference'");
  });

  it('projects invocation parameters separately from mutable selector state in CTX', async () => {
    const runtime = await uiSource('public/js/popups/record-selector.js');

    expect(runtime).toContain("kind: 'record-selector'");
    expect(runtime).toContain('callingParams: { ...resolvedCallingParams }');
    expect(runtime).toContain('entriesOriginal: source.map');
    expect(runtime).toContain('entries: source.map');
    expect(runtime).toContain('filters: {');
    expect(runtime).toContain('selectedIds: [...selectedIds]');
    expect(runtime).toContain("phase = 'open'");
    expect(runtime).toContain("syncCtx(matchingRows(), 'closing')");
    expect(runtime).toContain("source: 'record-selector'");
    expect(runtime).toContain('popupRuntime?.toggleInspection?.({');
    expect(runtime).toContain('path: popupPath');
    expect(runtime).toContain("runtime.replace(popupPath, null");
    expect(runtime).toContain("manatos:record-selector-selection");
    expect(runtime).toMatch(/evaluateUIRule\(\s*'title'/);
    expect(runtime).toContain('resolvedCallingParams.queryPredicate');
    expect(runtime).not.toContain('listExceptions = null');
  });

  it('lets canonical reference fields invoke the selector without owning selector/list behavior', async () => {
    const reference = await uiSource('views/components/sysbo/entry/fields/reference-select.ejs');
    const fieldRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    const selectorRuntime = await uiSource('public/js/popups/record-selector.js');
    const renderPage = await uiSource('src/presentation/render-page.ts');

    expect(reference).toContain("action: 'select-existing'");
    expect(reference).toContain('Select existing entry…');
    expect(reference).toContain("include('../../../../popups/selectors/record-selector'");
    expect(reference).toContain('data-reference-entity-key');
    expect(fieldRuntime).toContain("case 'select-existing'");
    expect(fieldRuntime).toContain('window.ManatOSRecordSelector');
    expect(fieldRuntime).toContain("purpose: 'reference-field'");
    expect(fieldRuntime).toContain('targetField: fieldKey');
    expect(fieldRuntime).toContain('targetFieldLabel: fieldLabelText');
    expect(fieldRuntime).toContain('sourceEntityLabel');
    expect(fieldRuntime).toContain('sourceRecordName: sourceRecordName || null');
    expect(fieldRuntime).not.toContain('title: `Select ${targetName} for ${fieldLabelText}`');
    expect(fieldRuntime).toContain('setReferenceValue(control, selectedId)');
    expect(fieldRuntime).not.toContain('data-selector-row');
    expect(selectorRuntime).not.toContain('parentId');
    expect(selectorRuntime).not.toContain('Principal');
    expect(renderPage).toContain('relatedEntityUIMetadata: allSysBOUIMetadata');
  });

  it('keeps hierarchy-specific relationship policy in the hierarchy caller', async () => {
    const hierarchy = await uiSource('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const selector = await uiSource('public/js/popups/record-selector.js');

    expect(hierarchy).toContain("purpose: 'hierarchy-add-existing'");
    expect(hierarchy).toContain('relationCandidateEligibility');
    expect(hierarchy).toContain('queryPredicate: listExceptions');
    expect(hierarchy).not.toContain('title: `Select ${entityLabel} to place as ${memberName} ${relationLabel}`');
    expect(hierarchy).toContain('factsForCandidate: (candidate) =>');
    expect(hierarchy).not.toContain('noteForSelection:');
    expect(hierarchy).not.toContain('rowClass:');
    expect(hierarchy).not.toContain('selector.open({\n      template,\n      source,\n      listExceptions,');
    expect(hierarchy).toContain('visible: result.eligible');
    expect(selector).toContain('typeof eligibility ===');
    expect(selector).not.toContain('relationCandidateEligibility');
    expect(selector).not.toContain('relationCandidateEligibility');
  });
  it('keeps nested optional values inside an explicit browser expression scope instead of falling through to page CTX', async () => {
    const formRuntime = await uiSource('public/js/metadata-form-runtime.js');

    expect(formRuntime).toContain('return { owned: false, value: undefined }');
    expect(formRuntime).toContain('Object.prototype.hasOwnProperty.call(explicitEvaluationScopeValue, first)');
    expect(formRuntime).toContain('return { owned: true, value: undefined }');
    expect(formRuntime).toContain('if (scoped.owned) return scoped.value');
    expect(formRuntime).toContain('nested member lookup is strictly downward');
  });

  it('drives selector presentation from evaluator-visible callingParams rather than caller-specific DOM logic', async () => {
    const selectorView = await uiSource('views/popups/selectors/record-selector.ejs');
    const selectorRuntime = await uiSource('public/js/popups/record-selector.js');
    const hierarchy = await uiSource('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const fieldRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    const renderPage = await uiSource('src/presentation/render-page.ts');
    const css = await uiSource('public/css/ui.css');

    expect(selectorView).toContain('data-selector-ui-rules');
    expect(selectorView).toContain('compileUIExpression');
    expect(selectorView).toContain('callingParams.presentationMode');
    expect(selectorView).toContain('callingParams.targetFieldLabel');
    expect(selectorView).toContain('callingParams.relation');
    expect(selectorView).toContain("'Select ' + callingParams.targetFieldLabel + ' for ' + callingParams.sourceEntityLabel");
    expect(selectorRuntime).toMatch(/evaluateUIRule\(\s*'title'/);
    expect(renderPage).toContain('compileExpression(expression)');
    expect(selectorRuntime).toContain('callingParams: resolvedCallingParams');
    expect(selectorRuntime).toContain('const popupRuntime = window.ManatOSPopupRuntime');
    expect(selectorRuntime).toContain('title: callingParams.title ?? null');
    expect(selectorRuntime).toContain('autofocusSearch: callingParams.autofocusSearch ?? null');
    expect(selectorRuntime).toContain("{ alreadyInContext: false, ...scope.candidateFacts }");
    expect(selectorView).toContain('selectedEntry.__entryName ?');
    expect(selectorView).not.toContain('selectedEntry ? (callingParams.targetFieldLabel');
    expect(selectorRuntime).toMatch(/evaluateUIRule\(\s*'contextNote'/);
    expect(selectorRuntime).toMatch(/evaluateUIRule\(\s*'rowClass'/);
    expect(selectorRuntime).not.toContain('compileExpression(');
    expect(selectorRuntime).toContain('contextNote: currentContextNote');
    expect(hierarchy).toContain("presentationMode: 'subtle'");
    expect(selectorView).not.toContain("purpose == 'reference-field'");
    expect(selectorView).not.toContain("purpose == 'hierarchy-add-existing'");
    expect(fieldRuntime).toContain("presentationMode: 'entry'");
    expect(css).toContain('.metadata-record-selector.is-entry-presentation');
    expect(css).toContain('.metadata-record-selector.is-subtle-presentation');
  });

});
