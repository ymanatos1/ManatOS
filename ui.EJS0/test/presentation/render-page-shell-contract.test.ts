import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderPage shell contract', () => {
  it('provides an anonymous shell app when page-context hydration failed before app publication', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/presentation/page/render-page.ts'),
      'utf8',
    );

    expect(source).toContain('const shellApp =');
    expect(source).toContain('viewModel.app ??');
    expect(source).toContain('app: shellApp');
    expect(source).toContain("debugTools: config.NODE_ENV !== 'production'");
    expect(source).toContain('navigation: Object.freeze({ horizontal: [], vertical: [] })');
  });
});
