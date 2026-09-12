import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
const source = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('generic transactional collection editor', () => {
  it('keeps Principal Contact declarative and the component entity-agnostic', async () => {
    const metadata = await source('../shared/src/metadata/ui/business.ts');
    const component = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    expect(metadata).toContain("tab('contact', 'Contact', 20");
    expect(metadata).toContain("key: 'collection-editor'");
    expect(component).not.toContain('sys-principals');
    expect(component).not.toContain('SysEmailAddress');
    expect(component).not.toContain('SysTelephoneNumber');
    expect(component).toContain('relatedChanges.');
    expect(component).toContain('componentData?.collectionResourceData?.[o.sourceKey]?.rows');
    expect(component).not.toContain('componentData?.relatedData');
    expect(component).not.toContain('componentData?.relatedReferenceData');
  });

  it('persists every declared collection editor through the same metadata-driven Save contract', async () => {
    const entryWrite = await source('src/routes/sysbo/entry/write.ts');
    const discovery = await source('src/routes/sysbo/related/collection-editor-metadata.ts');

    expect(entryWrite).toContain('collectionEditorDescriptors(uiMetadata)');
    expect(entryWrite).toContain('`relatedChanges.${descriptor.sourceKey}`');
    expect(entryWrite).toContain('descriptor.itemFieldKeys.map');
    expect(entryWrite).not.toContain("definition.key === 'sys-principals'");
    expect(entryWrite).not.toContain('principalRelatedChanges');
    expect(entryWrite).not.toContain("'emailAddresses'");
    expect(entryWrite).not.toContain("'telephoneNumbers'");
    expect(entryWrite).not.toContain("'addresses'");
    expect(discovery).toContain("component?.key === 'collection-editor'");
    expect(discovery).toContain('options?.sourceKey');
    expect(discovery).toContain('options?.itemFields');
  });

  it('supports scalar and structured collection values through metadata rather than component forks', async () => {
    const metadata = await source('../shared/src/metadata/ui/business.ts');
    const component = await source('views/components/sysbo/entry/content/collection-editor.ejs');

    expect(metadata).toContain("sourceKey: 'emailAddresses'");
    expect(metadata).toContain("sourceKey: 'telephoneNumbers'");
    expect(metadata).toContain("identityFields: ['countryCode', 'number']");
    expect(metadata).toContain("validation: 'country-code'");
    expect(metadata).toContain("validation: 'telephone-number'");
    expect(component).toContain('const itemFields = Array.isArray(o.itemFields)');
    expect(component).toContain('data-collection-item-field');
    expect(component).toContain("field.validation === 'country-code'");
    expect(component).toContain("case 'digits'");
    expect(component).toContain('identityFields.length');
    expect(component).toContain('rowIcon');
    expect(component).toContain('beginEdit(index)');
    expect(component).toContain('metadata-collection-editable-value');
    expect(component).toContain("text.addEventListener('click', () => beginEdit(index))");
    const countries = await source('../shared/src/domain/system-country-catalog.ts');
    expect(countries).toContain("languageFlagSrc: '/assets/flags/el.svg'");
    expect(countries).toContain("languageFlagSrc: '/assets/flags/en.svg'");
    expect(component).toContain('option.flagSrc');
    expect(component).toContain('metadata-country-flag-space');
  });

  it('hydrates persisted relationship ids through canonical reference records', async () => {
    const dataAccess = await source('src/routes/sysbo/shared/data-access.ts');
    const relatedCollections = await source('src/routes/sysbo/related/collections.ts');
    expect(dataAccess).not.toContain('referencedPrimaryField');
    expect(dataAccess).toContain('value: id');
    expect(dataAccess).toContain('const representation = resolveEntryRepresentation(');
    expect(dataAccess).toContain("const entryName = representation.name || String(id ?? '')");
    expect(dataAccess).not.toContain('primaryValue');
    expect(dataAccess).toContain('label: entryName');
    expect(dataAccess).toContain('__entryIcons: representation.icons');
    expect(relatedCollections).toContain('collection.source?.kind');
    expect(relatedCollections).toContain('collectionResourceData[sourceKey]');
    expect(relatedCollections).not.toContain('relatedEditingData');
    expect(dataAccess).not.toContain("field.referenceBOKey === 'sys-email-addresses'");
    expect(dataAccess).not.toContain("field.referenceBOKey === 'sys-telephone-numbers'");
    expect(relatedCollections).not.toContain("'sys-email-addresses'");
    expect(relatedCollections).not.toContain("'sys-telephone-numbers'");
  });

  it('widens country-code menus and prioritizes the active language flag before other flagged countries', async () => {
    const editor = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    const css = await source('public/css/debugger/ctx-debug.css');
    expect(editor).toContain('document.documentElement.dataset.uiLanguage');
    expect(editor).toContain('preferredFlag');
    expect(editor).toContain('aFlag === preferredFlag ? 0 : aFlag ? 1 : 2');
    expect(css).toContain('width: max(100%, 19rem) !important;');
  });

  it('uses the universal required-field label convention and shared country catalogue projections', async () => {
    const editor = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    const metadata = await source('../shared/src/metadata/ui/business.ts');
    const countries = await source('../shared/src/domain/system-country-catalog.ts');
    expect(editor).toContain('metadata-field-required-marker');
    expect(editor).toContain('data-collection-field-container');
    expect(editor).toContain('metadata-field-changed');
    expect(metadata).toContain('telephoneCountryOptions');
    expect(metadata).toContain('addressCountryOptions');
    expect(countries).toContain('systemCountryCatalog');
  });

  it('collapses contact collections into wrapped object summaries without disturbing an open editor', async () => {
    const metadata = await source('../shared/src/metadata/ui/business.ts');
    const component = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    const css = await source('public/css/pages.css');

    expect(metadata.match(/collapsible: true/g)?.length).toBeGreaterThanOrEqual(3);
    expect(component).toContain('data-collection-collapse-toggle');
    expect(component).toContain('data-collection-summary');
    expect(component).toContain('metadata-collection-summary-item');
    expect(component).toContain("if (!box.classList.contains('d-none') && next) return");
    expect(component).toContain('setCollapseEnabled(false)');
    expect(component).toContain('let collapsed = collapsible;');
    expect(component).not.toContain('sessionStorage.setItem(collapseStorageKey');
    expect(component).toContain("item.addEventListener('click', () => beginEdit(index))");
    expect(component).not.toContain('data-entry-child-editor');
    expect(component).toContain('data-collection-payload');
    expect(component).not.toContain('data-form-state-contributor');
    expect(component).toContain('collectionSnapshot');
    expect(component).toContain('collectionBaseline');
    expect(component).toContain("new CustomEvent('manatos:form-contributor-register'");
    expect(component).toContain('id: `collection:<%= o.sourceKey %>`');
    expect(component).not.toContain('manatos:child-editor-state');
    expect(component).not.toContain('data-child-editor-dirty');
    expect(component).not.toContain("Symbol.for('ManatOS.SysBO.EntryFormState')");
    expect(component).toContain("blocksPersistence: !box.classList.contains('d-none')");
    expect(css).toContain('.metadata-collection-summary {');
    expect(css).toContain('flex-wrap: wrap;');
  });

  it('closes only pristine inline drafts when focus leaves the collection', async () => {
    const component = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    expect(component).toContain("root.addEventListener('focusout'");
    expect(component).toContain('if (active instanceof Node && root.contains(active)) return');
    expect(component).toContain('if (!editorDraftDirty()) clearEditor()');
    expect(component).not.toContain('if (editorDraftDirty()) clearEditor()');
  });
});

describe('V2 collection CTX ownership', () => {
  it('projects V2 drafts exclusively to component resources', async () => {
    const editor = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    const host = await source('views/components/sysbo/entry/shell/metadata-component.ejs');
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');
    const projection = await source('src/runtime/state/collection-resource-projection.ts');

    expect(host).toContain('data-ctx-scope-path');
    expect(editor).toContain('host?.dataset?.ctxScopePath');
    expect(editor).toContain('.resources.collections.<%= o.sourceKey %>.current');
    expect(editor).not.toContain('ctx.page');
    expect(renderer).toContain('surfaceResources.collections');
    expect(renderer).toContain('projectCollectionResources');
    expect(projection).toContain('original: Object.freeze(cloneValues(source.rows ?? []))');
    expect(projection).toContain('current: Object.freeze(cloneValues(source.rows ?? []))');
    expect(projection).toContain('references: Object.freeze(');
  });

  it('keeps V2 collection initialization independent from the retired ctx.page entry branch', async () => {
    const component = await source('views/components/sysbo/entry/content/collection-editor.ejs');
    const v2Entry = await source('views/components/runtime/entity-entry.ejs');

    expect(component).toContain('componentData?.collectionResourceData?.[o.sourceKey]?.rows');
    expect(component).toContain(
      'const initialValues = Array.isArray(v2Collection) ? v2Collection : [];',
    );
    expect(component).not.toContain('componentData?.relatedData');
    expect(component).not.toContain('componentData?.relatedReferenceData');
    expect(component).not.toContain('relatedEditingData');
    expect(component).not.toContain('ctxPage?.entry');
    expect(component).not.toContain('v1Collection');
    expect(v2Entry).not.toContain("ctxPage: typeof ctxPage !== 'undefined' ? ctxPage : null");
    expect(v2Entry).not.toContain('relatedData');
    expect(v2Entry).toContain('pageCollectionResourceData');
    expect(v2Entry).not.toContain('relatedReferenceData: pageRelatedReferenceData');
  });
});
