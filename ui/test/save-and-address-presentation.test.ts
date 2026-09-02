import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', path), 'utf8');
const shared = (path: string) => readFile(resolve(here, '..', '..', 'shared', path), 'utf8');
const api = (path: string) => readFile(resolve(here, '..', '..', 'api', path), 'utf8');

describe('metadata entry Save lifecycle and Principal addresses', () => {
  it('uses one shared split Save action and keeps Save-in-place distinct from Save-and-Close', async () => {
    const renderer = await ui('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const actionsFooter = await ui('views/pages/metadata-driven/ui-components/entry-actions-footer.ejs');
    const split = await ui('views/pages/metadata-driven/ui-components/save-split-action.ejs');
    const forms = await ui('public/js/forms.js');
    const routes = await ui('src/routes/sysbo-routes.ts');

    expect(renderer).toContain("include('ui-components/entry-actions-footer'");
    expect(actionsFooter).toContain("include('save-split-action'");
    expect(split).toContain('value="stay"');
    expect(split).toContain('Save and Close');
    expect(split).toContain('value="close"');
    expect(forms).toContain("[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]");
    expect(routes).toContain("const saveMode = req.body._saveMode === 'close' ? 'close' : 'stay';");
    expect(routes).toContain("req.get('X-Requested-With') === 'ManatOS-InPlace-Save'");
    expect(routes).toContain('const completeSave = async (');
    expect(routes).toContain('savedRecord?: Record<string, unknown>');
    expect(routes).toContain('await completeSave(savedId || undefined, savedRecord)');
    expect(forms).not.toContain('HTMLFormElement.prototype.submit.call(form)');
    expect(forms).toContain("form.addEventListener('manatos:form-saved'");
    expect(forms).toContain("'X-Requested-With': 'ManatOS-InPlace-Save'");
    expect(forms).toContain('const body = new URLSearchParams();');
    expect(forms).toContain('new FormData(form).entries()');
    expect(forms).not.toContain('const body = new FormData(form);');
    expect(forms).toContain("form.dataset.recordMode === 'create'");
  });

  it('models addresses as canonical internal SysBOs and exposes them through the reusable Contact collection editor', async () => {
    const domain = await shared('src/domain.ts');
    const metadata = await shared('src/bo-metadata.ts');
    const uiMetadata = await shared('src/bo-ui-metadata.ts');
    const service = await api('src/services/domain-services.ts');
    const collection = await ui('views/pages/metadata-driven/ui-components/collection-editor.ejs');

    expect(domain).toContain('export interface SysAddress extends SysBOEntity');
    expect(domain).toContain('export interface SysPrincipalAddress extends SysBOEntity');
    expect(metadata).toContain("key: 'sys-addresses'");
    expect(metadata).toContain("key: 'sys-principal-addresses'");
    expect(metadata).toContain('formattedAddress: {');
    expect(metadata).toContain('persisted: true');
    expect(uiMetadata).toContain("sourceKey: 'addresses'");
    expect(uiMetadata).toContain("itemEntityKey: 'sys-addresses'");
    expect(uiMetadata).toContain("displayField: 'formattedAddress'");
    expect(service).toContain('private async syncAddresses(');
    expect(service).toContain("findByUnique('name', key)");
    expect(collection).toContain('o.displayField');
    expect(collection).toContain('field.required === false');
  });


  it('keeps the split Save menu visually aligned with the primary action and sanitizes failed-save CTX re-renders', async () => {
    const save = await ui('views/pages/metadata-driven/ui-components/save-split-action.ejs');
    const pagesCss = await ui('public/css/pages.css');
    const routes = await ui('src/routes/sysbo-routes.ts');
    expect(save).toContain('metadata-save-dropdown-menu');
    expect(pagesCss).toContain('.metadata-save-dropdown-menu');
    expect(routes).toContain('Object.keys(definition.boMetadata.fieldDefinition)');
    expect(routes).not.toContain('itemOverride: { ...req.body');
    expect(pagesCss).toContain('.metadata-field-required-marker');
    expect(pagesCss).toContain('font-weight: inherit');
  });
});
