import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('Account developer debugging presentation', () => {
  it('shows canonical user calculations only in developer mode and reuses shared formula highlighting', async () => {
    const source = await readFile(resolve(testDirectory, '../views/pages/account.ejs'), 'utf8');

    expect(source).toContain('const accountDebuggingEnabled = Boolean(app?.ui?.debugTools)');
    expect(source).toContain("typeof field.expression === 'string'");
    expect(source).toContain("typeof ctxUserFieldValue === 'function'");
    expect(source).toContain('id="account-debugging-tab"');
    expect(source).toContain('id="account-debugging-pane"');
    expect(source).toContain('data-readonly-tab="true"');
    expect(source).toContain('Calculation formula');
    expect(source).toContain('data-debug-expression');
    expect(source).toContain('ENTITY FIELDS');
    expect(source).toContain('FIELD VALUES');
    expect(source).toContain('DECLARED FIELDS');
  });
});
