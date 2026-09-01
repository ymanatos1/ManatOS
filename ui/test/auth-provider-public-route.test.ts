import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(testDirectory, '../src/app.ts');
const authRoutesPath = resolve(testDirectory, '../src/routes/auth-routes.ts');

describe('public external-authentication provider route', () => {
  it('bypasses session/page-context middleware so stale sessions cannot hide sign-in providers', async () => {
    const [appSource, authRoutesSource] = await Promise.all([
      readFile(appPath, 'utf8'),
      readFile(authRoutesPath, 'utf8'),
    ]);

    const publicRoute = appSource.indexOf("app.get('/auth/external-providers'");
    const pageContext = appSource.indexOf('app.use(pageContextMiddleware)');

    expect(publicRoute).toBeGreaterThan(-1);
    expect(pageContext).toBeGreaterThan(-1);
    expect(publicRoute).toBeLessThan(pageContext);
    expect(appSource).toContain("'/api/v1/public/external-auth-providers'");
    expect(authRoutesSource).not.toContain("router.get('/external-providers'");
  });

  it('keeps credential-test callbacks provider-neutral when OAuth state is omitted', async () => {
    const routes = await readFile(authRoutesPath, 'utf8');
    expect(routes).toContain('pendingTestIsFresh');
    expect(routes).toContain("stateTestId ?? (pendingTestIsFresh ? pendingTest?.testId ?? null : null)");
    expect(routes).not.toContain("providerKey === 'microsoft'");
  });
});
