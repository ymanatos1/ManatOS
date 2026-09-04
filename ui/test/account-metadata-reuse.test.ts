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

    expect(account).toContain("emailVerificationStatus: ctxUserFieldValue('emailVerificationStatus')");
    expect(account).toContain("localPasswordStatus: ctxUserFieldValue('localPasswordStatus')");
    expect(authenticationSummary).toContain('resolvedEmailVerificationStatus');
    expect(authenticationSummary).toContain('resolvedLocalPasswordStatus');
    expect(authenticationSummary).not.toContain("authenticationUser.emailVerified ? 'Verified' : 'Not verified'");
    expect(authenticationSummary).not.toContain("authenticationUser.hasPassword ? 'Configured' : 'Not configured'");
  });
});
