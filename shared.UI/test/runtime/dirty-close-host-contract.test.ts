import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('NG1/EJS1 dirty-close integration', () => {
  const hosts = ['../../../ui.NG1/src/app/app.component.ts', '../../../ui.EJS1/src/browser.ts'];

  it.each(hosts)('%s defers explicit logout until the shared decision', (path) => {
    const text = source(path);
    const signOut = text.slice(
      text.indexOf('function signOut(') >= 0
        ? text.indexOf('function signOut(')
        : text.indexOf('async signOut('),
    );
    const guard = signOut.indexOf('if (!approved &&');
    const continuation = signOut.indexOf('dirtyClose.requestExit(');
    const mutate = signOut.indexOf(
      path.includes('ui.NG1') ? 'this.pendingLogout = true' : 'accountSession.signOut()',
    );
    expect(guard).toBeGreaterThan(-1);
    expect(continuation).toBeGreaterThan(guard);
    expect(mutate).toBeGreaterThan(continuation);
  });
});
