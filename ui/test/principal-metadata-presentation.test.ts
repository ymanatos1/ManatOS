import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from './source-contract.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', relativePath), 'utf8');
const apiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', 'api', relativePath), 'utf8');
const sharedSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', 'shared', relativePath), 'utf8');

describe('metadata-driven Principal presentation', () => {
  it('uses canonical enum-item icons/traits and evaluator-driven Parent principal editability', async () => {
    const canonical = await sharedSource('src/metadata/bo/business.ts');
    const uiMetadata = await sharedSource('src/metadata/ui/business.ts');
    const entry = await uiSource('views/components/sysbo/entry/fields/enum-select.ejs');
    const runtime = await uiSource('public/js/metadata-form-runtime.js');
    const ctxRuntime = await uiSource('public/js/ctx-runtime.js');
    const routeContext = await uiSource('src/routes/sysbo/context.ts');
    const definitions = await uiSource('src/sysbo/definitions.ts');

    expect(definitions).toContain("icon: 'bi-diagram-3-fill'");
    expect(canonical).toMatch(
      /value: SysBOPrincipalType\.Person,[\s\S]*?isContainer: false,[\s\S]*?canHaveParent: true,[\s\S]*?canBeOrganizationRoot: false,[\s\S]*?canStandAloneOrganization: true/,
    );
    expect(canonical).toMatch(
      /value: SysBOPrincipalType\.Company,[\s\S]*?isContainer: true,[\s\S]*?canHaveParent: false,[\s\S]*?canBeOrganizationRoot: true/,
    );
    expect(canonical).toMatch(
      /value: SysBOPrincipalType\.Group,[\s\S]*?isContainer: true,[\s\S]*?canHaveParent: true,[\s\S]*?canBeOrganizationRoot: true/,
    );
    expect(canonical).toMatch(
      /value: SysBOPrincipalType\.System,[\s\S]*?isContainer: false,[\s\S]*?canHaveParent: true,[\s\S]*?canBeOrganizationRoot: false,[\s\S]*?canStandAloneOrganization: true/,
    );
    expect(uiMetadata).toContain("createDefaultValue: 'Person'");
    expect(uiMetadata).toContain('principalType.option.canHaveParent === true');
    expect(uiMetadata).toContain('readOnlyValue: null');
    expect(canonical).toContain('rootPrincipalId: {');
    expect(canonical).toContain('persisted: true');
    expect(canonical).toContain(
      "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
    );
    expect(entry).toContain('data-enum-items');
    expect(entry).toContain('data-enum-selected-icon');
    expect(entry).toContain('data-enum-item');
    const fieldRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    expect(runtime).toContain('window.ManatOSFieldComponents?.getFieldOption?.(control)');
    expect(runtime).not.toContain('selectedEnumItem');
    expect(runtime).not.toContain('dataset.enumItems');
    expect(fieldRuntime).toContain('const getFieldOption = (control) =>');
    expect(fieldRuntime).toContain('selectedOption?.dataset?.enumItem');
    expect(runtime).toContain('resolveLocalFieldVariable');
    expect(runtime).toContain('let value = { value: fieldValue, option };');
    expect(ctxRuntime).toContain('const updateField =');
    expect(ctxRuntime).toContain('entry');
    expect(routeContext).toContain('pageEntryRuntimeContext(initialRecordValues)');
    expect(routeContext).toContain('Object.entries(runtimeEntryValues).filter');
    expect(runtime).toContain('expressionDependencyPaths');
    expect(runtime).toContain('runtime?.resolvePath?.(node.path, scopePath)');
    expect(ctxRuntime).toContain('const resolvePath =');
    expect(ctxRuntime).toContain('relatedPaths');
  });

  it('places Parent then Root principal before Name while preserving Name as the generic clickable primary field', async () => {
    const uiMetadata = await sharedSource('src/metadata/ui/business.ts');
    const list = await uiSource('views/pages/sysbo/list.ejs');
    const rowCells = await uiSource('views/components/sysbo/list/list-row-cells.ejs');

    expect(uiMetadata).toContain(
      "visibleFields: ['parentId', 'rootPrincipalId', 'name', 'principalType', 'enabled']",
    );
    expect(uiMetadata).toContain(
      "filterFields: ['name', 'principalType', 'parentId', 'rootPrincipalId']",
    );
    expect(list).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(rowCells).toContain('key === metadata.primaryField');
    expect(rowCells).toContain("field.type === 'reference'");
    expect(rowCells).toContain('rowReferenceName(reference, item[key])');
    const referenceSelect = await uiSource(
      'views/components/sysbo/entry/fields/reference-select.ejs',
    );
    const dataAccess = await uiSource('src/routes/sysbo/data-access.ts');
    expect(dataAccess).toContain('__entryIcons: representation.icons');
    expect(referenceSelect).toContain('reference?.__entryIcons');
    expect(referenceSelect).toContain('metadata-entry-icon-<%= iconIndex %>');
  });

  it('lays out Contact as a metadata grid so reusable contact collections can share rows', async () => {
    const uiMetadata = await sharedSource('src/metadata/ui/business.ts');
    const renderer = await uiSource('views/pages/sysbo/entry.ejs');
    const tabContent = await uiSource('views/components/sysbo/entry/shell/entry-tab-content.ejs');

    expect(uiMetadata).toContain("tab('contact', 'Contact', 20, [], {");
    expect(uiMetadata).toContain("layout: 'form'");
    expect(uiMetadata).toMatch(
      /sourceKey: 'emailAddresses'[\s\S]*?span: 6|span: 6[\s\S]*?sourceKey: 'emailAddresses'/,
    );
    expect(uiMetadata).toMatch(
      /sourceKey: 'telephoneNumbers'[\s\S]*?span: 6|span: 6[\s\S]*?sourceKey: 'telephoneNumbers'/,
    );
    expect(uiMetadata).toContain("itemEntityKey: 'sys-telephone-numbers'");
    expect(uiMetadata).toContain("relationshipEntityKey: 'sys-principal-telephone-numbers'");
    expect(uiMetadata).toContain("identityFields: ['countryCode', 'number']");
    expect(uiMetadata).toContain("key: 'collection-editor'");
    expect(tabContent).toContain('class="col-md-<%= resolveContentSpan(12) %>"');
    expect(tabContent).toContain('data-metadata-content-component="<%= component.key %>"');
    expect(renderer).not.toContain("definition.key === 'sys-principals'");
  });

  it('declares the reusable CTX-driven Organization visualization without Principal-specific component code', async () => {
    const uiMetadata = await sharedSource('src/metadata/ui/business.ts');
    const component = await uiSource('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const renderer = await uiSource('views/pages/sysbo/entry.ejs');
    const tabContent = await uiSource('views/components/sysbo/entry/shell/entry-tab-content.ejs');

    expect(uiMetadata).toContain("tab('organization', 'Organization'");
    expect(uiMetadata).toContain("key: 'hierarchy-tree'");
    expect(uiMetadata).toContain("dataSource: 'entries'");
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
    expect(sourceWithoutWhitespace(uiCss)).toContain(
      sourceWithoutWhitespace(
        '.metadata-hierarchy-children > .metadata-hierarchy-node:first-child::before',
      ),
    );
    expect(sourceWithoutWhitespace(uiCss)).toContain(
      sourceWithoutWhitespace(
        '.metadata-hierarchy-children > .metadata-hierarchy-node:last-child::before',
      ),
    );
    expect(uiCss).not.toContain(
      '.metadata-hierarchy-view-chart .metadata-hierarchy-children::before',
    );
    expect(component).toContain("aria-label=\"${mode === 'chart' ? 'Chart' : 'Tree'}\"");
    expect(component).not.toContain('<span class="ms-1">');
    expect(component).toContain('runtime.resolvePath');
    expect(component).not.toContain('sys-principals');
    expect(component).not.toContain("'parentId'");
    expect(component).not.toContain('rootPrincipalId');
    expect(tabContent).toContain('data-metadata-content-component="<%= component.key %>"');
    expect(renderer).not.toContain("componentKey === 'hierarchy-tree'");
  });

  it('keeps Principals on the single metadata-driven SysBO engine after #16 cleanup', async () => {
    const definitions = await uiSource('src/sysbo/definitions.ts');
    const routes = await uiSource('src/routes/sysbo-routes.ts');
    const configuration = await apiSource('src/services/sys-configuration-service.ts');

    expect(definitions).toContain('boMetadata: sysBOPrincipalsMetadata');
    expect(definitions).not.toContain('DISPOSABLE LEGACY PRINCIPAL EJS');
    expect(routes).not.toContain('sysBOUiImplementation');
    expect(routes).not.toContain('UI_SYSBO_PRINCIPALS_VIEW_MODE');
    // Retired names remain only as compatibility tombstones so stale persisted
    // configuration rows are ignored rather than resurrecting the old engine.
    expect(configuration).toContain("'UI_SYSBO_PRINCIPALS_VIEW_MODE'");
  });

  it('declares Principal Organization as the first consumer of the generic hierarchy workspace', async () => {
    const uiMetadata = await sharedSource('src/metadata/ui/business.ts');
    const routes = await uiSource('src/routes/sysbo-routes.ts');
    const hierarchyRenderer = await uiSource('src/routes/sysbo/hierarchy-renderer.ts');
    const workspace = await uiSource('views/components/sysbo/hierarchy/hierarchy-workspace.ejs');
    const hierarchyRuntime = await uiSource('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const hierarchyModel = await uiSource('src/presentation/metadata-hierarchy-workspace.ts');

    expect(uiMetadata).toContain("label: 'Add organization'");
    expect(uiMetadata).toMatch(/addOrganization:[\s\S]*?emphasis: 'solid'/);
    expect(uiMetadata).toMatch(
      /organization:[\s\S]*?label: 'Organization'[\s\S]*?emphasis: 'outline'/,
    );
    expect(uiMetadata).toContain("href: '/bo/sys-principals/hierarchy/new'");
    expect(uiMetadata).toContain("href: '/bo/sys-principals/{id}/hierarchy'");
    expect(uiMetadata).toContain("workspaceKey: 'organization'");
    expect(uiMetadata).toContain("workspaceLabel: 'Organization'");
    expect(uiMetadata).toContain("containerTrait: 'isContainer'");
    expect(uiMetadata).toContain("canHaveParentTrait: 'canHaveParent'");
    expect(uiMetadata).toContain("rootEligibleTrait: 'canBeOrganizationRoot'");
    expect(uiMetadata).toContain("standAloneEligibleTrait: 'canStandAloneOrganization'");

    expect(routes).toContain("router.get('/:key/hierarchy/new'");
    expect(routes).toContain("router.get('/:key/:id/hierarchy'");
    expect(routes).toContain('renderMetadataDrivenHierarchyWorkspace');
    expect(routes).toContain("from './sysbo/hierarchy-renderer.js'");
    expect(hierarchyRenderer).toContain("'sysbo-hierarchy'");
    expect(hierarchyRenderer).toContain('pageCollectionRuntimeContext(hierarchyItems)');
    expect(hierarchyRenderer).toContain('initialMemberId: focusedId');
    expect(hierarchyRenderer).toContain('focusedMemberId: focusedId');
    expect(hierarchyRenderer).not.toContain('renderPrincipalOrganizationWorkspace');
    expect(hierarchyRenderer).not.toContain('sys-principals');

    expect(hierarchyModel).toContain('metadataHierarchyWorkspaceDescriptor');
    expect(hierarchyModel).toContain('keyedHierarchySnapshot');
    expect(hierarchyModel).toContain('hierarchyRootIdForMember');
    expect(workspace).toContain('data-metadata-hierarchy-workspace');
    expect(workspace).toContain("dataSource: 'entries'");
    expect(workspace).toContain("focusSource: 'focusedMemberId'");
    expect(workspace).toContain("interactionMode: 'workspace'");
    expect(workspace).not.toContain('data-hierarchy-save-close');
    expect(hierarchyRuntime).toContain('const collectionRows =');
    expect(hierarchyRuntime).toContain('focusSource');
    expect(hierarchyRuntime).toContain('data-hierarchy-empty-add');
    expect(hierarchyRuntime).toContain("String(options.interactionMode || '') === 'workspace'");
    expect(hierarchyRuntime).not.toContain('sys-principals');
  });
});
