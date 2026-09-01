import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('generic SysBO delete presentation', () => {
  it('derives friendly delete labels from canonical metadata instead of legacy EJS view-model metadata', async () => {
    const routes = await readFile(resolve(testDirectory, '../src/routes/sysbo-routes.ts'), 'utf8');
    expect(routes).toContain('definition.boMetadata.name');
    expect(routes).not.toContain('editViewModel.deleteEntityLabel');
  });

  it('suppresses the native dirty-page warning only after destructive confirmation submits', async () => {
    const view = await readFile(resolve(testDirectory, '../views/popups/messages/bo-edit-confirmations.ejs'), 'utf8');
    const forms = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(view).toContain('data-allow-dirty-page-exit="true"');
    expect(view).toContain('deletePresentation.displayValue');
    expect(view).toContain('deletePresentation.entityLabel');
    expect(view).toContain("impact.action === 'retain'");
    expect(view).toContain('related record(s) will be retained');
    expect(forms).toContain('form[data-allow-dirty-page-exit="true"]');
    expect(view).toContain('data-delete-unsaved-warning');
    expect(view).toContain('Unsaved changes will also be lost');
    expect(forms).toContain("deleteModal?.addEventListener('show.bs.modal'");
    expect(forms).toContain("warning?.classList.toggle('d-none', !dirty())");
  });
});
