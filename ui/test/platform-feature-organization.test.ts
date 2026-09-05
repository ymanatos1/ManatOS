import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(testDirectory, '..');
const source = (path: string) => readFile(resolve(uiRoot, path), 'utf8');

describe('platform feature organization', () => {
  it('keeps protoCRM playground routes and views under the protoCRM platform boundary', async () => {
    const app = await source('src/app.ts');
    const platformRoutes = await source('src/platforms/routes.ts');
    const protoCrmRoutes = await source('src/platforms/protocrm/routes.ts');
    const pageRoutes = await source('src/routes/page-routes.ts');
    const sysboRoutes = await source('src/routes/sysbo-routes.ts');
    const appPlayground = await source('views/pages/platforms/protocrm/app-playground.ejs');
    const applicationPlayground = await source(
      'views/pages/platforms/protocrm/application-playground.ejs',
    );

    expect(app).toContain('createPlatformRoutes');
    expect(platformRoutes).toContain('createProtoCrmRoutes');
    expect(protoCrmRoutes).toContain("'/app-playground'");
    expect(protoCrmRoutes).toContain("'/bo/sys-applications/:id/play'");
    expect(protoCrmRoutes).toContain("'pages/platforms/protocrm/app-playground'");
    expect(protoCrmRoutes).toContain("'pages/platforms/protocrm/application-playground'");
    expect(protoCrmRoutes).toContain('requireCurrentPlatformEntitlement');
    expect(pageRoutes).not.toContain("'pages/app-playground'");
    expect(sysboRoutes).not.toContain("'pages/application-playground'");
    expect(appPlayground).toContain('/assets/platforms/protocrm/app-playground-professional.png');
    expect(appPlayground).toContain('No applications available yet');
    expect(appPlayground).not.toContain('Ready to play?');
    expect(appPlayground).not.toContain('Complete your registration');
    expect(appPlayground).not.toContain('Application license required');
    expect(appPlayground).not.toContain("currentUser.role === 'Guest'");
    expect(applicationPlayground).toContain('app.scopes.workspace.application');
  });

  it('keeps the current-platform access decision authoritative in CTX without app mirrors', async () => {
    const pageContext = await source('src/middleware/page-context.ts');
    const access = await source('src/platforms/access.ts');
    const navigation = await source('src/navigation.ts');
    const context = await source('src/context/manatos-context.ts');

    expect(pageContext).toContain(
      '/api/v1/platforms/${encodeURIComponent(currentPlatform.id)}/$capabilities',
    );
    expect(pageContext).toContain('platformCapabilities');
    expect(pageContext).not.toContain('/api/v1/SysLicenses?pageSize=1000');
    expect(pageContext).not.toContain('licenseGrantsPlatformAccess');
    expect(pageContext).toContain('{ ctx: res.locals.ctx }');
    expect(pageContext).not.toContain('currentPlatformEntitled');
    expect(pageContext).not.toContain('platformEntitled:');
    expect(access).toContain('contextPlatformAccess(res.locals.ctx, platformId)');
    expect(access).not.toContain('app?.currentPlatformEntitled');
    expect(navigation).toContain('evaluateCompiledExpression');
    expect(navigation).toContain('const evaluationCtx = access.ctx ??');
    expect(navigation).not.toContain('contextPlatformAccess(access.ctx, platform.id)');
    expect(navigation).not.toContain('platformEntitled?:');
    expect(context).toContain('export function contextPlatformAccess');
  });

  it('declares platform-specific styling through platform presentation metadata', async () => {
    const platformTypes = await source('../shared/src/platforms/types.ts');
    const protoCrmPlatform = await source('../shared/src/platforms/protocrm/platform.ts');
    const companyPlatform = await source('../shared/src/company-platform.ts');
    const shell = await source('views/layout/shell.ejs');
    const css = await source('public/css/platforms/protocrm.css');
    const genericPagesCss = await source('public/css/pages.css');
    const genericUiCss = await source('public/css/ui.css');

    expect(platformTypes).toContain('stylesheet?: string');
    expect(platformTypes).toContain('export interface CompanyInfo');
    expect(protoCrmPlatform).toContain("stylesheet: '/css/platforms/protocrm.css'");
    expect(companyPlatform).toContain(
      "import { PROTOCRM_PLATFORM, PROTOCRM_PLATFORM_ID } from './platforms/protocrm/platform.js'",
    );
    expect(companyPlatform).toContain('platforms: [PROTOCRM_PLATFORM]');
    expect(companyPlatform).not.toContain("id: PROTOCRM_PLATFORM_ID,\n      code: 'protoCRM'");
    expect(shell).toContain('app.currentPlatform?.presentation?.stylesheet');
    expect(css).toContain('.app-playground-welcome');
    expect(genericPagesCss).not.toContain('.app-playground-welcome');
    expect(genericUiCss).not.toContain('.app-playground-welcome');
  });
});
