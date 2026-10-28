import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from '../support/source-contract.js';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');
const shared = (path: string) => readFile(resolve(here, '..', '..', '..', 'shared', path), 'utf8');
const api = (path: string) => readFile(resolve(here, '..', '..', '..', 'api', path), 'utf8');

describe('pictures replacement persistence contract', () => {
  it('replaces a dirty pictures field as one complete ordered value', async () => {
    const entryWrite = await ui('src/routes/sysbo/entry/write.ts');
    expect(entryWrite).toContain('change.changed !== true');
    expect(entryWrite).toContain('{ changed: true, pictures }');
    expect(entryWrite).not.toContain('tempToPersisted');
    expect(entryWrite).not.toContain('/$order');
  });
});

describe('metadata entry Save lifecycle and Principal addresses', () => {
  it('uses one shared split Save action and keeps Save-in-place distinct from Save-and-Close', async () => {
    const renderer = await ui('views/components/runtime/entity-entry.ejs');
    const split = await ui('views/components/sysbo/entry/shell/save-split-action.ejs');
    const entryState = await ui('public/js/sysbo/entry/state.js');
    const entrySave = await ui('public/js/sysbo/entry/save.js');
    const reauth = await ui('public/js/auth/reauth.js');
    const shell = await ui('views/layout/shell.ejs');
    const entryWrite = await ui('src/routes/sysbo/entry/write.ts');
    const runtimeEntry = await ui('src/browser/runtime-entry.ts');
    const entityEntrySurface = await ui('src/runtime/v2/entity-entry-surface.ts');

    expect(renderer).toContain("include('../sysbo/entry/shell/save-split-action'");
    expect(split).toContain('value="close"\n    data-form-save');
    expect(split).toContain("metadataText(saveAction.label || '@CM.Save')");
    expect(split).toContain("metadataText('@CM.SaveAndStay')");
    expect(split.indexOf('value="close"')).toBeLessThan(
      split.indexOf("metadataText('@CM.SaveAndStay')"),
    );
    expect(split).toContain('value="stay"');
    expect(entryState).toContain(
      '[data-form-save], [data-form-save-option], [data-form-save-menu-toggle]',
    );
    expect(entryWrite).toContain(
      "const saveMode = req.body._saveMode === 'close' ? 'close' : 'stay';",
    );
    expect(entryWrite).toContain("req.get('X-Requested-With') === 'ManatOS-InPlace-Save'");
    expect(entryWrite).toContain('export async function completeMetadataDrivenSave(');
    expect(entryWrite).toContain('savedRecord?: Record<string, unknown>');
    expect(sourceWithoutWhitespace(entryWrite)).toContain(
      sourceWithoutWhitespace('savedRecord ?? (await apiClient.get<Record<string, unknown>>'),
    );
    expect(entrySave).not.toContain('HTMLFormElement.prototype.submit.call(form)');
    expect(entrySave).toContain("surfaceRuntime.register('entry-save', install);");
    expect(entrySave).toContain('form.dataset.ctxScopePath || null');
    expect(sourceWithoutWhitespace(entrySave)).toContain(
      sourceWithoutWhitespace("form.dispatchEvent(new CustomEvent('manatos:form-saved'"),
    );
    expect(entrySave).toContain("'X-Requested-With': 'ManatOS-InPlace-Save'");
    expect(entrySave).toContain("payload?.error?.code === 'UI_API_SESSION_EXPIRED'");
    expect(entrySave).toContain('window.ManatOS?.reauthenticate?.({');
    expect(entrySave).toContain("reason: 'session-expired'");
    expect(entrySave).toContain("operation: 'save'");
    expect(entrySave).not.toContain('manatos:entry-draft:');
    expect(entrySave).not.toContain('restoreDraft');
    expect(entrySave).not.toContain('saveDraft');
    expect(entryState).not.toContain('Local draft restored');
    expect(reauth).toContain('window.ManatOS.reauthenticate = reauthenticate');
    expect(reauth).toContain("'X-ManatOS-Reauthenticate': '1'");
    expect(reauth).toContain("fetch('/auth/csrf'");
    expect(reauth).toContain('document.querySelectorAll(\'input[name="_csrf"]\')');
    expect(reauth).toContain('const reauthenticate = (invocation = {}) =>');
    expect(reauth).toContain("normalizedInvocation.reason === 'session-expired'");
    expect(reauth).toContain(
      'modalElement.dataset.popupInvocation = JSON.stringify(popupInvocation)',
    );
    expect(reauth).toContain("title.textContent = 'Your session has expired'");
    expect(reauth).toContain('delete modalElement.dataset.popupInvocation');
    expect(entrySave).toContain('const body = formBody(saveMode);');
    expect(entrySave).toContain('if (error?.manatosCancelled === true) return;');
    expect(shell).toContain('/js/auth/reauth.js');
    expect(entrySave).toContain('const body = new URLSearchParams();');
    expect(entrySave).toContain('new FormData(form).entries()');
    expect(entrySave).not.toContain('const body = new FormData(form);');
    expect(entrySave).toContain("!['stay', 'close'].includes(saveMode)");
    expect(entrySave).toContain('[data-form-save-option][value="stay"]');
    expect(entryWrite).toContain(
      "const browserSave = req.get('X-Requested-With') === 'ManatOS-InPlace-Save';",
    );
    expect(entryWrite).toContain("created: !String(req.body.id ?? '')");
    expect(entrySave).toContain(
      "const popupHost = form.querySelector('input[name=\"_entryHost\"]')?.value === 'popup';",
    );
    expect(entrySave).not.toContain("document.body.classList.contains('entry-popup-host')");
    expect(entrySave).toContain("new CustomEvent('manatos:entry-popup-saved'");
    const popup = await ui('public/js/popups/entry-popup.js');
    expect(popup).toContain("window.addEventListener('manatos:entry-popup-saved', handleSaved)");
    expect(entrySave).toContain('close: payload.data?.close === true');
    expect(entrySave).toContain("window.ManatOS?.uiHost?.surfacePath?.('entry')");
    expect(entrySave).not.toContain('runtime.replace(currentPath');
    expect(entrySave).toContain('window.ManatOS.saveEntrySurfaceForPath(');
    expect(runtimeEntry).toContain('const result = await surface.save(persistence);');
    expect(entityEntrySurface).toContain('this.#reconcileCurrent(result.record);');
    expect(entityEntrySurface).toContain('this.#promoteBaseline(result.record);');
    expect(entityEntrySurface).toContain(
      'this.context.replace(`data.fields.${key}.value`, authoritativeValue',
    );
    expect(entityEntrySurface).toContain(
      'this.context.replace(`data.fields.${key}.originalValue`, currentValue',
    );
    expect(entrySave).not.toContain('isV2Surface');
    expect(entrySave).toContain("new CustomEvent('manatos:form-save-failed'");
  });

  it('models addresses as canonical internal SysBOs and exposes them through the reusable Contact collection editor', async () => {
    const domain = await shared('src/domain/entities.ts');
    const metadata = `${await shared('src/metadata/bo/manatos/contacts/bo-addresses.ts')}\n${await shared('src/metadata/bo/manatos/principals/bo-principal-addresses.ts')}`;
    const uiMetadata = await shared('src/metadata/ui/manatos/principals/ui-principals.ts');
    const service = await api('src/services/sysbo/principal-service.ts');
    const collection = await ui('views/components/sysbo/entry/content/collection-editor.ejs');

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
    const save = await ui('views/components/sysbo/entry/shell/save-split-action.ejs');
    const pagesCss = await ui('public/css/pages.css');
    const entryWrite = await ui('src/routes/sysbo/entry/write.ts');
    expect(save).toContain('metadata-save-dropdown-menu');
    expect(pagesCss).toContain('.metadata-save-dropdown-menu');
    expect(entryWrite).toContain('Object.keys(definition.boMetadata.fieldDefinition)');
    expect(entryWrite).not.toContain('itemOverride: { ...req.body');
    expect(pagesCss).toContain('.metadata-field-required-marker');
    expect(pagesCss).toContain('font-weight: inherit');
  });
});
