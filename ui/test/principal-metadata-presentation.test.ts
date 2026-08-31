import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', relativePath), 'utf8');
const apiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', 'api', relativePath), 'utf8');
const sharedSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', 'shared', relativePath), 'utf8');

describe('metadata-driven Principal presentation', () => {
  it('uses canonical enum-item icons/traits and evaluator-driven Parent principal editability', async () => {
    const canonical = await sharedSource('src/bo-metadata.ts');
    const uiMetadata = await apiSource('src/metadata/sysbo-ui-definitions.ts');
    const entry = await uiSource('views/pages/metadata-driven/components/enum-select.ejs');
    const forms = await uiSource('public/js/forms.js');
    const ctxRuntime = await uiSource('public/js/ctx-runtime.js');
    const routes = await uiSource('src/routes/sysbo-routes.ts');

    expect(canonical).toContain("icon: 'person', isContainer: false, canHaveParent: true");
    expect(canonical).toContain("icon: 'building', isContainer: true, canHaveParent: false");
    expect(canonical).toContain("icon: 'people', isContainer: true, canHaveParent: true");
    expect(canonical).toContain("icon: 'gear', isContainer: false, canHaveParent: false");
    expect(uiMetadata).toContain('principalType.option.canHaveParent === true');
    expect(uiMetadata).toContain('readOnlyValue: null');
    expect(canonical).toContain("rootPrincipalId: {");
    expect(canonical).toContain("persisted: true");
    expect(canonical).toContain("TraverseCtx(parentId, dataList, 'parentId', 'id')");
    expect(entry).toContain('data-enum-items');
    expect(entry).toContain('data-enum-selected-icon');
    expect(entry).toContain('data-enum-item');
    expect(forms).toContain('selectedEnumItem');
    expect(forms).toContain('control.selectedOptions?.[0]?.dataset?.enumItem');
    expect(forms).toContain('resolveLocalFieldVariable');
    expect(forms).toContain('let value = { value: fieldValue, option };');
    expect(ctxRuntime).toContain('const updateField =');
    expect(ctxRuntime).toContain('dataCurrent');
    expect(routes).toContain('pageEntryRuntimeContext(initialRecordValues)');
    expect(routes).toContain('Object.entries(runtimeEntryValues).filter');
    expect(forms).toContain('expressionDependencyPaths');
    expect(forms).toContain('runtime?.resolvePath?.(node.path, scopePath)');
    expect(ctxRuntime).toContain('const resolvePath =');
    expect(ctxRuntime).toContain('relatedPaths');
  });

  it('places Root then Parent principal before Name while preserving Name as the generic clickable primary field', async () => {
    const uiMetadata = await apiSource('src/metadata/sysbo-ui-definitions.ts');
    const list = await uiSource('views/pages/metadata-driven/bo-list-metadata.ejs');

    expect(uiMetadata).toContain("visibleFields: ['rootPrincipalId', 'parentId', 'name', 'principalType', 'enabled']");
    expect(list).toContain("key === metadata.primaryField");
    expect(list).toContain("field.type === 'reference'");
    expect(list).toContain('referenceLabel(key, item[key])');
  });

  it('declares the reusable CTX-driven Organization visualization without Principal-specific component code', async () => {
    const uiMetadata = await apiSource('src/metadata/sysbo-ui-definitions.ts');
    const component = await uiSource('public/js/components/hierarchy-tree.js');
    const renderer = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');

    expect(uiMetadata).toContain("tab('organization', 'Organization'");
    expect(uiMetadata).toContain("key: 'hierarchy-tree'");
    expect(uiMetadata).toContain("dataSource: 'dataList'");
    expect(uiMetadata).toContain("rootField: 'rootPrincipalId'");
    expect(uiMetadata).toContain("viewModes: 'tree,chart'");
    expect(uiMetadata).toContain("defaultView: 'chart'");
    expect(uiMetadata).toContain("tab('licenses', 'Licenses', 800, ['licenses']");
    expect(uiMetadata).toContain("licenses: relatedLicensesCollection('principalId')");
    expect(component).toContain('options.parentField');
    expect(component).toContain('options.rootField');
    expect(component).toContain('projectedRows');
    expect(component).toContain('data-hierarchy-view-mode');
    expect(component).toContain('justify-content-start');
    expect(component).toContain('aria-label="${mode === \'chart\' ? \'Chart\' : \'Tree\'}"');
    expect(component).not.toContain('<span class="ms-1">');
    expect(component).toContain('runtime.resolvePath');
    expect(component).not.toContain('sys-principals');
    expect(component).not.toContain("'parentId'");
    expect(component).not.toContain('rootPrincipalId');
    expect(renderer).toContain('data-metadata-component="<%= componentKey %>"');
    expect(renderer).not.toContain("componentKey === 'hierarchy-tree'");
  });

  it('marks Principals #16 complete and freezes its legacy Current-EJS metadata for deletion', async () => {
    const definitions = await uiSource('src/sysbo/definitions.ts');
    const routes = await uiSource('src/routes/sysbo-routes.ts');
    const configuration = await apiSource('src/services/sys-configuration-service.ts');

    expect(definitions).toContain('#16 DISPOSABLE LEGACY PRINCIPAL EJS METADATA — READY FOR DELETION');
    expect(routes).toContain("definition.key === 'sys-users' || definition.key === 'sys-principals'");
    expect(routes).not.toContain("'sys-principals': 'UI_SYSBO_PRINCIPALS_VIEW_MODE'");
    expect(configuration).not.toContain("name:'UI_SYSBO_PRINCIPALS_VIEW_MODE'");
  });

});
