import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const pageContext = readFileSync(resolve(process.cwd(), 'src/middleware/page-context.ts'), 'utf8');
const authShared = readFileSync(resolve(process.cwd(), 'src/routes/auth/shared.ts'), 'utf8');
const entryWrite = readFileSync(resolve(process.cwd(), 'src/routes/sysbo/entry-write.ts'), 'utf8');
const apiSession = readFileSync(resolve(process.cwd(), 'src/auth/api-session.ts'), 'utf8');

describe('current SysUser session snapshot', () => {
  it('reuses the login result across page-context hydration instead of refetching on navigation', () => {
    expect(authShared).toContain('req.session.currentUserSnapshot = login.user');
    expect(pageContext).toContain('req.session.currentUserSnapshot?.id === req.session.userId');
    expect(pageContext).toContain('req.session.currentUserSnapshot = user');
  });

  it('refreshes the snapshot after saving the signed-in SysUser and clears it with auth state', () => {
    expect(entryWrite).toContain("definition.key === 'sys-users'");
    expect(entryWrite).toContain('req.session.currentUserSnapshot = saved.data as unknown as SysBOUser');
    expect(apiSession).toContain('delete req.session.currentUserSnapshot');
  });
});
