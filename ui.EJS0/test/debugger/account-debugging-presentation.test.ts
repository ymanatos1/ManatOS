import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('Account developer debugging presentation', () => {
  it('inherits debugging from the canonical V2 SysUser entry surface instead of an Account-only implementation', async () => {
    const routes = await source('src/routes/pages/index.ts');
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');

    expect(routes).toContain("purpose: 'open-account-entry'");
    expect(routes).toContain('renderMetadataDrivenRecord(');
    expect(renderer).toContain("renderPage(res, 'pages/sysbo/entry'");
    expect(routes).not.toContain("renderPage(res, 'pages/account'");
  });
});
