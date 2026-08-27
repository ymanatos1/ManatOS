import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('generic SysBO form state presentation', () => {
  it('starts the shared Save button disabled and marks it for generic state management', async () => {
    const source = await readFile(resolve(testDirectory, '../views/pages/bo-edit.ejs'), 'utf8');
    expect(source).toContain('data-form-save disabled');
  });

  it('keeps Save centrally dependent on dirty, valid and entity-specific credential state', async () => {
    const source = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(source).toContain('window.manatosSysBOFormState = state');
    expect(source).toContain('queueMicrotask(() =>');
    expect(source).toContain('const changed = hasPendingCredentialSave || (sharedState.baseline !== null');
    expect(source).toContain('form.checkValidity() && credentialStateAllowsSave');
    expect(source).toContain("form.addEventListener('input', update)");
    expect(source).toContain("form.addEventListener('change', update)");
  });

  it('requires an external-provider credential pair to be tested before Save', async () => {
    const source = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(source).toContain("credentialState.value = 'required'");
    expect(source).toContain('data-provider-test-credentials');
    expect(source).toContain('dataset.providerTestUrl');
    expect(source).toContain('body.set(\'clientId\', clientId.value.trim())');
    expect(source).toContain('body.set(\'clientSecret\', clientSecret.value)');
    expect(source).toContain('providerEnabled || anyCredentialValue');
    expect(source).toContain("window.open('', 'manatos-provider-credential-test'");
    expect(source).toContain("result.type !== 'manatos:provider-credential-test-result'");
    expect(source).toContain('payload.statusUrl');
    expect(source).toContain('const pollStatus = async () =>');
    expect(source).toContain('window.manatosBusy?.show');
    expect(source).toContain("url.searchParams.set('tab', 'secrets')");
    expect(source).toContain('window.manatosAllowDirtyPageExit?.()');
  });
});
