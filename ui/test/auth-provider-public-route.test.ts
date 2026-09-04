import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(testDirectory, '../src/app.ts');
const authRoutesPath = resolve(testDirectory, '../src/routes/auth-routes.ts');
const externalAuthRouterPath = resolve(testDirectory, '../src/routes/auth/external-auth-router.ts');
const externalAccountRouterPath = resolve(testDirectory, '../src/routes/auth/external-account-router.ts');

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
    const routes = await readFile(externalAuthRouterPath, 'utf8');
    expect(routes).toContain('pendingTestIsFresh');
    expect(routes).toContain("stateTestId ?? (pendingTestIsFresh ? pendingTest?.testId ?? null : null)");
    expect(routes).not.toContain("providerKey === 'microsoft'");
  });

  it('keeps auth-routes as the composer for extracted external-provider authentication', async () => {
    const [authRoutesSource, externalAuthSource] = await Promise.all([
      readFile(authRoutesPath, 'utf8'),
      readFile(externalAuthRouterPath, 'utf8'),
    ]);

    expect(authRoutesSource).toContain('createExternalAuthRouter');
    expect(authRoutesSource).toContain('router.use(createExternalAuthRouter())');
    expect(authRoutesSource).not.toContain('configureProviderCredentialTest');
    expect(authRoutesSource).not.toContain('passport.authenticate(providerKey');
    expect(externalAuthSource).toContain('configureProviderCredentialTest');
    expect(externalAuthSource).toContain('passport.authenticate(providerKey');
  });

  it('keeps auth-routes as a thin composer for external-account completion', async () => {
    const [authRoutesSource, externalAccountSource] = await Promise.all([
      readFile(authRoutesPath, 'utf8'),
      readFile(externalAccountRouterPath, 'utf8'),
    ]);

    expect(authRoutesSource).toContain('createExternalAccountRouter');
    expect(authRoutesSource).toContain('router.use(createExternalAccountRouter())');
    expect(authRoutesSource).not.toContain("'/register/existing-external'");
    expect(authRoutesSource).not.toContain("'/link/external'");
    expect(authRoutesSource).not.toContain("'/register/external'");
    expect(authRoutesSource).not.toContain('register-external');
    expect(externalAccountSource).toContain("'/register/existing-external'");
    expect(externalAccountSource).toContain("'/link/external'");
    expect(externalAccountSource).toContain("'/register/external'");
    expect(externalAccountSource).toContain('register-external');
  });

});
