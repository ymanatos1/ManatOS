import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const pageContext = readFileSync(resolve(process.cwd(), 'src/middleware/page-context.ts'), 'utf8');
const authShared = readFileSync(resolve(process.cwd(), 'src/routes/auth/shared.ts'), 'utf8');
const entryWrite = readFileSync(resolve(process.cwd(), 'src/routes/sysbo/entry-write.ts'), 'utf8');
const apiSession = readFileSync(resolve(process.cwd(), 'src/auth/api-session.ts'), 'utf8');
const entrySave = readFileSync(resolve(process.cwd(), 'public/js/sysbo/entry/save.js'), 'utf8');
const uiBootstrap = readFileSync(
  resolve(process.cwd(), 'public/js/runtime/bootstrap-runtime.js'),
  'utf8',
);
const app = readFileSync(resolve(process.cwd(), 'src/app.ts'), 'utf8');

describe('current SysUser session snapshot', () => {
  it('reuses the login result across page-context hydration instead of refetching on navigation', () => {
    expect(authShared).toContain('req.session.currentUserSnapshot = login.user');
    expect(pageContext).toContain('req.session.currentUserSnapshot?.id === req.session.userId');
    expect(pageContext).toContain('req.session.currentUserSnapshot = user');
    expect(pageContext).toContain('materializeCalculatedContextFields(');
  });

  it('refreshes the snapshot and live ctx.user fields after saving the signed-in SysUser', () => {
    expect(entryWrite).toContain("definition.key === 'sys-users'");
    expect(entryWrite).toContain(
      'req.session.currentUserSnapshot = saved.data as unknown as SysBOUser',
    );
    expect(entrySave).not.toContain('refreshAuthenticatedUserCtx');
    expect(app).toContain("app.get('/runtime/current-user-context'");
    expect(uiBootstrap).toContain("document.addEventListener('manatos:form-saved'");
    expect(uiBootstrap).toContain("form.dataset.entityKey !== 'sys-users'");
    expect(uiBootstrap).toContain("window.ManatOS?.ctx?.get?.('ctx.user.fields.id.value')");
    expect(uiBootstrap).toContain("runtime.replace('ctx.user', payload.user ?? null");
    expect(uiBootstrap).toContain("source: 'ui-bootstrap-current-user-refresh'");
    expect(apiSession).toContain('delete req.session.currentUserSnapshot');
  });
});
