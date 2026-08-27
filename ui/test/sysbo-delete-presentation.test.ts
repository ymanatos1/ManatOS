import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getSysBODefinition } from '../src/sysbo/definitions.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('generic SysBO delete presentation', () => {
  it('uses friendly entity labels instead of implementation SysBO names', () => {
    expect(getSysBODefinition('sys-ext-auth-providers').uiMetadata.editViewModel.deleteEntityLabel).toBe('External Provider');
    expect(getSysBODefinition('sys-users').uiMetadata.editViewModel.deleteEntityLabel).toBe('User');
  });

  it('suppresses the native dirty-page warning only after destructive confirmation submits', async () => {
    const view = await readFile(resolve(testDirectory, '../views/popups/messages/bo-edit-confirmations.ejs'), 'utf8');
    const forms = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(view).toContain('data-allow-dirty-page-exit="true"');
    expect(view).toContain('deletePresentation.displayValue');
    expect(view).toContain('deletePresentation.entityLabel');
    expect(forms).toContain('form[data-allow-dirty-page-exit="true"]');
  });
});
