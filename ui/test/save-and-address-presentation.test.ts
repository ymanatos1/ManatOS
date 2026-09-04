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
    const renderer = await ui('views/pages/sysbo/entry.ejs');
    const actionsFooter = await ui('views/components/sysbo/entry/entry-actions-footer.ejs');
    const split = await ui('views/components/sysbo/entry/save-split-action.ejs');
    const forms = await ui('public/js/forms.js');
    const entryWrite = await ui('src/routes/sysbo/entry-write.ts');

    expect(renderer).toContain("include('../../components/sysbo/entry/entry-actions-footer'");
    expect(actionsFooter).toContain("include('save-split-action'");
    expect(split).toContain('value="stay"');
    expect(split).toContain('Save and Close');
    expect(split).toContain('value="close"');
    expect(forms).toContain("[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]");
    expect(entryWrite).toContain("const saveMode = req.body._saveMode === 'close' ? 'close' : 'stay';");
    expect(entryWrite).toContain("req.get('X-Requested-With') === 'ManatOS-InPlace-Save'");
    expect(entryWrite).toContain('export async function completeMetadataDrivenSave(');
    expect(entryWrite).toContain('savedRecord?: Record<string, unknown>');
    expect(entryWrite).toContain('savedRecord ?? (await apiClient.get<Record<string, unknown>>');
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
    const metadata = await shared('src/metadata/bo/contact.ts');
    const uiMetadata = await shared('src/metadata/ui/business.ts');
    const service = await api('src/services/sysbo-principal-service.ts');
    const collection = await ui('views/components/sysbo/collections/collection-editor.ejs');

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
    const save = await ui('views/components/sysbo/entry/save-split-action.ejs');
    const pagesCss = await ui('public/css/pages.css');
    const entryWrite = await ui('src/routes/sysbo/entry-write.ts');
    expect(save).toContain('metadata-save-dropdown-menu');
    expect(pagesCss).toContain('.metadata-save-dropdown-menu');
    expect(entryWrite).toContain('Object.keys(definition.boMetadata.fieldDefinition)');
    expect(entryWrite).not.toContain('itemOverride: { ...req.body');
    expect(pagesCss).toContain('.metadata-field-required-marker');
    expect(pagesCss).toContain('font-weight: inherit');
  });
});
