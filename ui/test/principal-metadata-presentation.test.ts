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
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
    const entry = await uiSource('views/pages/metadata-driven/field-components/enum-select.ejs');
    const forms = await uiSource('public/js/forms.js');
    const ctxRuntime = await uiSource('public/js/ctx-runtime.js');
    const routes = await uiSource('src/routes/sysbo-routes.ts');

    expect(canonical).toMatch(/value: SysBOPrincipalType\.Person,[\s\S]*?icon: 'person',[\s\S]*?isContainer: false,[\s\S]*?canHaveParent: true/);
    expect(canonical).toMatch(/value: SysBOPrincipalType\.Company,[\s\S]*?icon: 'building',[\s\S]*?isContainer: true,[\s\S]*?canHaveParent: false/);
    expect(canonical).toMatch(/value: SysBOPrincipalType\.Group,[\s\S]*?icon: 'people',[\s\S]*?isContainer: true,[\s\S]*?canHaveParent: true/);
    expect(canonical).toMatch(/value: SysBOPrincipalType\.System,[\s\S]*?icon: 'gear',[\s\S]*?isContainer: false,[\s\S]*?canHaveParent: false/);
    expect(uiMetadata).toContain("createDefaultValue: 'Person'");
    expect(uiMetadata).toContain('principalType.option.canHaveParent === true');
    expect(uiMetadata).toContain('readOnlyValue: null');
    expect(canonical).toContain("rootPrincipalId: {");
    expect(canonical).toContain("persisted: true");
    expect(canonical).toContain("parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')");
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

  it('places Parent then Root principal before Name while preserving Name as the generic clickable primary field', async () => {
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
    const list = await uiSource('views/pages/metadata-driven/bo-list-metadata.ejs');

    expect(uiMetadata).toContain("visibleFields: ['parentId', 'rootPrincipalId', 'name', 'principalType', 'enabled']");
    expect(uiMetadata).toContain("filterFields: ['name', 'principalType', 'parentId', 'rootPrincipalId']");
    expect(list).toContain("key === metadata.primaryField");
    expect(list).toContain("field.type === 'reference'");
    expect(list).toContain('referenceLabel(key, item[key])');
  });

  it('lays out Contact as a metadata grid so reusable contact collections can share rows', async () => {
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
    const renderer = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');

    expect(uiMetadata).toContain("tab('contact', 'Contact', 20, [], {");
    expect(uiMetadata).toContain("layout: 'form'");
    expect(uiMetadata).toMatch(/sourceKey: 'emailAddresses'[\s\S]*?span: 6|span: 6[\s\S]*?sourceKey: 'emailAddresses'/);
    expect(uiMetadata).toMatch(/sourceKey: 'telephoneNumbers'[\s\S]*?span: 6|span: 6[\s\S]*?sourceKey: 'telephoneNumbers'/);
    expect(uiMetadata).toContain("itemEntityKey: 'sys-telephone-numbers'");
    expect(uiMetadata).toContain("relationshipEntityKey: 'sys-principal-telephone-numbers'");
    expect(uiMetadata).toContain("identityFields: ['countryCode', 'number']");
    expect(uiMetadata).toContain("key: 'collection-editor'");
    expect(renderer).toContain('class="col-md-<%= resolveContentSpan(12) %>"');
    expect(renderer).toContain('data-metadata-content-component="<%= component.key %>"');
    expect(renderer).not.toContain("definition.key === 'sys-principals'");
  });

  it('declares the reusable CTX-driven Organization visualization without Principal-specific component code', async () => {
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
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
    const uiCss = await uiSource('public/css/ui.css');
    expect(uiCss).toContain('.metadata-hierarchy-toolbar .btn');
    expect(uiCss).toContain('min-width: 2.5rem');
    expect(uiCss).toContain('.metadata-hierarchy-children > .metadata-hierarchy-node:first-child::before');
    expect(uiCss).toContain('.metadata-hierarchy-children > .metadata-hierarchy-node:last-child::before');
    expect(uiCss).not.toContain('.metadata-hierarchy-view-chart .metadata-hierarchy-children::before');
    expect(component).toContain('aria-label="${mode === \'chart\' ? \'Chart\' : \'Tree\'}"');
    expect(component).not.toContain('<span class="ms-1">');
    expect(component).toContain('runtime.resolvePath');
    expect(component).not.toContain('sys-principals');
    expect(component).not.toContain("'parentId'");
    expect(component).not.toContain('rootPrincipalId');
    expect(renderer).toContain('data-metadata-content-component="<%= component.key %>"');
    expect(renderer).not.toContain("componentKey === 'hierarchy-tree'");
  });

  it('keeps Principals on the single metadata-driven SysBO engine after #16 cleanup', async () => {
    const definitions = await uiSource('src/sysbo/definitions.ts');
    const routes = await uiSource('src/routes/sysbo-routes.ts');
    const configuration = await apiSource('src/services/sys-configuration-service.ts');

    expect(definitions).toContain("boMetadata: sysBOPrincipalsMetadata");
    expect(definitions).not.toContain('DISPOSABLE LEGACY PRINCIPAL EJS');
    expect(routes).not.toContain('sysBOUiImplementation');
    expect(routes).not.toContain('UI_SYSBO_PRINCIPALS_VIEW_MODE');
    // Retired names remain only as compatibility tombstones so stale persisted
    // configuration rows are ignored rather than resurrecting the old engine.
    expect(configuration).toContain("'UI_SYSBO_PRINCIPALS_VIEW_MODE'");
  });

});
