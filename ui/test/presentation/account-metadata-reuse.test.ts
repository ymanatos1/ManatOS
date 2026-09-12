import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('Account SysUser metadata reuse', () => {
  it('uses canonical SysUser calculated status values instead of recalculating status text', async () => {
    const account = await source('views/pages/account.ejs');
    const authenticationSummary = await source('views/components/auth/authentication-summary.ejs');
    const renderPage = await source('src/presentation/page/render-page.ts');

    expect(account).toContain(
      "emailVerificationStatus: ctxUserFieldValue('emailVerificationStatus')",
    );
    expect(account).toContain("localPasswordStatus: ctxUserFieldValue('localPasswordStatus')");
    expect(authenticationSummary).toContain('resolvedEmailVerificationStatus');
    expect(authenticationSummary).toContain('resolvedLocalPasswordStatus');
    expect(authenticationSummary).not.toContain(
      "authenticationUser.emailVerified ? 'Verified' : 'Not verified'",
    );
    expect(authenticationSummary).not.toContain(
      "authenticationUser.hasPassword ? 'Configured' : 'Not configured'",
    );
    expect(renderPage).toContain(
      'const ctxUserFieldValue = (key: string): unknown => ctx?.user?.fields?.[key]?.value',
    );
    expect(renderPage).not.toContain('evaluateCompiledExpression(');
    expect(renderPage).not.toContain('expressionCapabilities(');
  });

  it('reuses canonical External Identity metadata and entry-icon presentation on Account', async () => {
    const authenticationSummary = await source('views/components/auth/authentication-summary.ejs');
    const entryIcons = await source('views/components/sysbo/entry/shell/entry-icons.ejs');
    const renderPage = await source('src/presentation/page/render-page.ts');

    expect(authenticationSummary).toContain(
      "relatedCollectionMetadataFor('sys-users', 'externalIdentities')",
    );
    expect(authenticationSummary).toContain(
      'metadataOptionItemForField(externalIdentityProviderField, providerKey)',
    );
    expect(authenticationSummary).toContain(
      'entryRepresentationFor(externalIdentityCollection.entityKey, identity, externalIdentityEntityIcon)',
    );
    expect(authenticationSummary).toContain("include('../sysbo/entry/shell/entry-icons'");
    expect(authenticationSummary).not.toContain('<i class="bi bi-person-badge me-1"></i>');
    expect(entryIcons).toContain('entryRepresentation?.icons');
    expect(renderPage).toContain(
      'const relatedCollectionMetadataFor = (ownerEntityKey: string, collectionKey: string) =>',
    );
  });
  it('shows the current User Principal on Account Authentication without duplicating relationship logic', async () => {
    const account = await source('views/pages/account.ejs');
    const authenticationSummary = await source('views/components/auth/authentication-summary.ejs');
    const routes = await source('src/routes/pages/index.ts');

    expect(account).toContain('showPrincipalReference: true');
    expect(account).toContain('accountPrincipal');
    expect(routes).toContain('/api/v1/SysPrincipals/');
    expect(authenticationSummary).toContain(
      "entryRepresentationFor('sys-principals', accountPrincipal)",
    );
    expect(authenticationSummary).toContain('No Person Principal is linked to this account.');
    expect(authenticationSummary).toContain('/bo/sys-principals/');
  });

  it('uses the canonical User entry representation as the Account navigation link', async () => {
    const account = await source('views/pages/account.ejs');

    expect(account).toContain("entryRepresentationFor('sys-users', accountUserDisplayRecord)");
    expect(account).toContain('href="/bo/sys-users/');
    expect(account).toContain("include('../components/sysbo/entry/shell/entry-icons'");
    expect(account).not.toContain('Open user');
  });
  it('reuses enhanced canonical email presentation on Account', async () => {
    const account = await readFile(resolve(testDirectory, '../../views/pages/account.ejs'), 'utf8');
    const readonly = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/content/readonly-value.ejs'),
      'utf8',
    );

    expect(account).toContain("field: { type: 'email', readOnly: true }");
    expect(account).toContain('enhancedReadonlyPresentation: true');
    expect(readonly).toContain('metadata-compact-value metadata-readonly-email');
    expect(readonly).toContain('bi bi-envelope');
  });
  it('reuses enhanced canonical system-value presentation on Account', async () => {
    const account = await source('views/pages/account.ejs');

    expect(account).toContain("field: { type: 'guid', readOnly: true }");
    expect(account).toContain("presentation: { format: 'name' }");
    expect(account.match(/enhancedReadonlyPresentation: true/g)?.length).toBeGreaterThanOrEqual(4);
  });
  it('shows the canonical User photo beside the Account identity summary', async () => {
    const account = await source('views/pages/account.ejs');

    expect(account).toContain('currentUser.photo');
    expect(account).toContain('/bo/sys-users/');
    expect(account).toContain('/picture/photo?revision=');
    expect(account).toContain('account-summary-photo');
  });
  it('keeps Account fields vertically grouped beside the photo and links menu identity to the User entry', async () => {
    const account = await source('views/pages/account.ejs');
    const header = await source('views/components/layout/header.ejs');
    const css = await source('public/css/ui.css');

    expect(account).toContain('class="account-general-layout"');
    expect(account).toContain('class="account-summary-grid account-general-summary"');
    expect(css).toContain('.account-general-layout');
    expect(css).toContain('grid-template-columns: minmax(150px, 210px) minmax(16rem, 1fr)');
    expect(header).toContain('class="account-menu-user-link"');
    expect(header).toContain('href="/bo/sys-users/<%= encodeURIComponent(currentUser.id) %>"');
  });
});
