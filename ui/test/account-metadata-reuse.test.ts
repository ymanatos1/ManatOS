import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', path), 'utf8');

describe('Account SysUser metadata reuse', () => {
  it('uses canonical SysUser calculated status values instead of recalculating status text', async () => {
    const account = await source('views/pages/account.ejs');
    const authenticationSummary = await source('views/components/auth/authentication-summary.ejs');

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
  });

  it('reuses canonical External Identity metadata and entry-icon presentation on Account', async () => {
    const authenticationSummary = await source('views/components/auth/authentication-summary.ejs');
    const entryIcons = await source('views/components/sysbo/entry/shell/entry-icons.ejs');
    const renderPage = await source('src/presentation/render-page.ts');

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
});
