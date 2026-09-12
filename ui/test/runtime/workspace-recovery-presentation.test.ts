import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('persistent per-user workspace recovery', () => {
  it('stores one IndexedDB package with levels in restore order and gentle-closes the live UI', async () => {
    const recovery = await source('public/js/runtime/workspace-recovery.js');
    const popup = await source('public/js/popups/entry-popup.js');
    const popupRuntime = await source('public/js/popups/popup-runtime.js');
    const host = await source('public/js/runtime/ui-host-runtime.js');

    expect(recovery).toContain("const DB_NAME = 'manatos-workspace-recovery'");
    expect(recovery).toContain("const STORE_NAME = 'packages'");
    expect(recovery).toContain('transaction.objectStore(STORE_NAME).get(userId)');
    expect(recovery).toContain(
      'const levels = [...pageLevelsInRestoreOrder(), ...popupLevelsInRestoreOrder()]',
    );
    expect(recovery).toContain('level.userChanges = level.control.supportsUserChanges');
    expect(recovery).toContain('window.ManatOS?.uiHost?.getUserChanges?.(level.path)');
    expect(recovery).toContain('await window.ManatOS?.uiHost?.prepareGentleClose?.(level.path)');
    expect(recovery).toContain('await window.ManatOS?.popup?.entry?.gentleCloseAll?.()');
    expect(recovery).toContain('gentleCloseAllRecoverableModals?.()');
    expect(recovery).toContain('await writePackage(recoveryPackage)');
    expect(recovery.indexOf('await writePackage(recoveryPackage)')).toBeLessThan(
      recovery.indexOf('await window.ManatOS?.uiHost?.prepareGentleClose?.(level.path)'),
    );
    expect(recovery).toContain("runtime.replace('ctx.user', null");
    expect(recovery).toContain('await offer(userId)');
    expect(recovery).toContain('await restoreRequestedPackage(recoveryPackage)');
    expect(recovery).toContain('await removePackage(recoveryPackage.userId)');
    expect(recovery).toContain('await waitForDomQuiescence(document)');
    expect(recovery).toContain('await window.ManatOS?.uiHost?.verifyUserChanges?.(');
    expect(recovery).toContain('window.ManatOS?.errors?.present?.(structured');
    expect(recovery).toContain("document.body.classList.contains('entry-popup-host')");

    expect(host).toContain('supportsUserChanges: supportsUserChanges === true');
    expect(host).toContain('getUserChanges(path)');
    expect(host).toContain('async applyUserChanges(path, changes)');
    expect(host).toContain('async verifyUserChanges(path, changes)');
    expect(host).toContain('prepareGentleClose(path)');
    expect(popup).toContain('const gentleCloseAll = async () =>');
    expect(popup).toContain('const restoreDescriptor = async (descriptor) =>');
    expect(popupRuntime).toContain('gentleCloseAllRecoverableModals');
  });

  it('captures only dirty fields and restores specialized fields through the component contract', async () => {
    const save = await source('public/js/sysbo/entry/save.js');
    const fields = await source('public/js/sysbo/entry/field-runtime/picture-fields.js');
    const host = await source('public/js/runtime/ui-host-runtime.js');
    const formRuntime = await source('public/js/sysbo/entry/form-runtime.js');

    expect(save).toContain('field.dirty !== true');
    expect(save).toContain("format: 'field-delta-v1'");
    expect(save).toContain('window.ManatOS?.fieldRecovery?.captureField?.(form, key)');
    expect(save).toContain('window.ManatOS?.fieldRecovery?.applyField?.(form, key, change)');
    expect(save).toMatch(
      /window\.ManatOS\?\.fieldRecovery\?\.verifyField\?\.\(\s*form,\s*key,\s*change,?\s*\)/,
    );
    expect(fields).toContain('captureField(form, key)');
    expect(fields).toContain('applyField: applyComponentRecovery');
    expect(fields).toContain('verifyField: verifyComponentRecovery');
    expect(fields).toContain('savePayload: payload.value');
    expect(formRuntime).toContain("control.dataset.ctxValueType === 'json'");
    expect(formRuntime).toContain('return JSON.parse(control.value);');
    expect(fields).toContain('pendingPicturePayload.set(item, replacement)');
    expect(host).toContain('registerRecoveryAdapter');
    expect(host).toContain('async applyUserChanges(path, changes)');
    expect(host).toContain('async verifyUserChanges(path, changes)');
  });
});
