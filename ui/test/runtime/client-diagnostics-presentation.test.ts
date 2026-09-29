import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (path: string) => readFile(resolve(root, path), 'utf8');

describe('client surface diagnostics', () => {
  it('measures every rendered page and Bootstrap popup through one developer channel', async () => {
    const [runtime, shell, routes, sink] = await Promise.all([
      source('public/js/runtime/client-diagnostics.js'),
      source('views/layout/shell.ejs'),
      source('src/routes/debug/index.ts'),
      source('src/debug/client-runtime-log.ts'),
    ]);

    expect(shell).toContain('/js/runtime/client-diagnostics.js');
    expect(shell).toContain('window.ManatOSDeveloperDiagnostics');
    expect(runtime).toContain("type: 'page-opening-measurement'");
    expect(runtime).toContain("document.addEventListener('show.bs.modal'");
    expect(runtime).toContain("document.addEventListener('shown.bs.modal'");
    expect(runtime).toContain("type: 'popup-opening-measurement'");
    expect(runtime).toContain("fetch('/bo/debug/ui-runtime/diagnostic'");
    expect(routes).toContain("router.post('/ui-runtime/diagnostic'");
    expect(sink).toContain("'../data/logs/client/ui-runtime.jsonl'");
    expect(sink).toContain('appendFileSync(');
    expect(routes).not.toContain('console.info(`[UI runtime]');
  });
});
