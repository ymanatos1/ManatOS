import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
const source = async (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('generic transactional collection editor', () => {
  it('keeps Principal Contact declarative and the component entity-agnostic', async () => {
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    const component = await source('views/pages/metadata-driven/ui-components/collection-editor.ejs');
    expect(metadata).toContain("tab('contact', 'Contact', 20");
    expect(metadata).toContain("key: 'collection-editor'");
    expect(component).not.toContain('sys-principals');
    expect(component).not.toContain('SysEmailAddress');
    expect(component).not.toContain('SysTelephoneNumber');
    expect(component).toContain('relatedChanges.');
    expect(component).toContain('reference?.[o.valueField]');
    expect(component).toContain('reference?.label');
  });

  it('supports scalar and structured collection values through metadata rather than component forks', async () => {
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    const component = await source('views/pages/metadata-driven/ui-components/collection-editor.ejs');

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
    const countries = await source('../shared/src/system-country-catalog.ts');
    expect(countries).toContain("languageFlagSrc: '/assets/flags/el.svg'");
    expect(countries).toContain("languageFlagSrc: '/assets/flags/en.svg'");
    expect(component).toContain('option.flagSrc');
    expect(component).toContain('metadata-country-flag-space');
  });

  it('hydrates persisted relationship ids through canonical reference records', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    expect(routes).toContain('const referencedPrimaryField = referencedDefinition.boMetadata.primaryField');
    expect(routes).toContain('value: id');
    expect(routes).toContain('const representation = resolveEntryRepresentation(');
    expect(routes).toContain('label: representation.name || primaryValue || record.name || id');
    expect(routes).not.toContain("field.referenceBOKey === 'sys-email-addresses'");
    expect(routes).not.toContain("field.referenceBOKey === 'sys-telephone-numbers'");
  });


  it('widens country-code menus and prioritizes the active language flag before other flagged countries', async () => {
    const editor = await source('views/pages/metadata-driven/ui-components/collection-editor.ejs');
    const css = await source('public/css/debugger/ctx-debug.css');
    expect(editor).toContain("document.documentElement.dataset.uiLanguage");
    expect(editor).toContain("preferredFlag");
    expect(editor).toContain("aFlag === preferredFlag ? 0 : aFlag ? 1 : 2");
    expect(css).toContain('width: max(100%, 19rem) !important;');
  });


  it('uses the universal required-field label convention and shared country catalogue projections', async () => {
    const editor = await source('views/pages/metadata-driven/ui-components/collection-editor.ejs');
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    const countries = await source('../shared/src/system-country-catalog.ts');
    expect(editor).toContain('metadata-field-required-marker');
    expect(editor).toContain('data-collection-field-container');
    expect(editor).toContain('metadata-field-changed');
    expect(metadata).toContain('telephoneCountryOptions');
    expect(metadata).toContain('addressCountryOptions');
    expect(countries).toContain('systemCountryCatalog');
  });

  it('collapses contact collections into wrapped object summaries without disturbing an open editor', async () => {
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    const component = await source('views/pages/metadata-driven/ui-components/collection-editor.ejs');
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
    expect(component).toContain('data-entry-child-editor');
    expect(component).toContain('manatos:child-editor-state');
    expect(css).toContain('.metadata-collection-summary {');
    expect(css).toContain('flex-wrap: wrap;');
  });

});
