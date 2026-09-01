import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(testDirectory, '..');
const source = (path: string) => readFile(resolve(uiRoot, path), 'utf8');

describe('platform feature organization', () => {
  it('keeps mCRM playground routes and views under the mCRM platform boundary', async () => {
    const app = await source('src/app.ts');
    const platformRoutes = await source('src/platforms/routes.ts');
    const mcrmRoutes = await source('src/platforms/mcrm/routes.ts');
    const pageRoutes = await source('src/routes/page-routes.ts');
    const sysboRoutes = await source('src/routes/sysbo-routes.ts');
    const appPlayground = await source('views/pages/platforms/mcrm/app-playground.ejs');
    const applicationPlayground = await source('views/pages/platforms/mcrm/application-playground.ejs');

    expect(app).toContain('createPlatformRoutes');
    expect(platformRoutes).toContain('createMcrmRoutes');
    expect(mcrmRoutes).toContain("'/app-playground'");
    expect(mcrmRoutes).toContain("'/bo/sys-applications/:id/play'");
    expect(mcrmRoutes).toContain("'pages/platforms/mcrm/app-playground'");
    expect(mcrmRoutes).toContain("'pages/platforms/mcrm/application-playground'");
    expect(mcrmRoutes).toContain('requireCurrentPlatformEntitlement');
    expect(pageRoutes).not.toContain("'pages/app-playground'");
    expect(sysboRoutes).not.toContain("'pages/application-playground'");
    expect(appPlayground).toContain('/assets/platforms/mcrm/app-playground-professional.png');
    expect(applicationPlayground).toContain('app.scopes.workspace.application');
  });

  it('declares platform-specific styling through platform presentation metadata', async () => {
    const platformTypes = await source('../shared/src/platforms/types.ts');
    const mcrmPlatform = await source('../shared/src/platforms/mcrm/platform.ts');
    const shell = await source('views/layout/shell.ejs');
    const css = await source('public/css/platforms/mcrm.css');

    expect(platformTypes).toContain('stylesheet?: string');
    expect(mcrmPlatform).toContain("stylesheet: '/css/platforms/mcrm.css'");
    expect(shell).toContain('app.currentPlatform?.presentation?.stylesheet');
    expect(css).toContain('.app-playground-welcome');
  });
});
