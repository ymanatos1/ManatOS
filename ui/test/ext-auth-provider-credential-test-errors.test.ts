import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('external provider credential-test failure diagnostics', () => {
  it('captures OAuth callback errors into the pending test state for editor polling', async () => {
    const source = await readFile(resolve(testDirectory, '../src/routes/auth-routes.ts'), 'utf8');

    expect(source).toContain("const callbackError = String(req.query.error ?? '').trim()");
    expect(source).toContain('providerCredentialTestCallbackError(');
    expect(source).toContain("pendingTest.status = 'failed'");
    expect(source).toContain('delete pendingTest.clientSecret');
    expect(source).toContain('credential test callback rejected');
  });
});
