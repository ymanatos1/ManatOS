import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('rich-text browser dependency boundary', () => {
  it('bundles the pinned Crepe dependency locally instead of constructing a CDN module graph', async () => {
    const packageJson = JSON.parse(await source('package.json'));
    const entry = await source('browser/rich-text-crepe-entry.js');
    const runtime = await source('public/js/sysbo/entry/rich-text-runtime.js');
    const app = await source('src/app.ts');

    expect(packageJson.dependencies['@milkdown/crepe']).toBe('7.22.1');
    expect(packageJson.devDependencies.esbuild).toBe('^0.28.2');
    expect(packageJson.scripts['build:browser']).toContain('rich-text-crepe-entry.js');
    expect(packageJson.scripts['build:browser']).toContain('--loader:.woff=file');
    expect(packageJson.scripts['build:browser']).toContain('--loader:.woff2=file');
    expect(packageJson.scripts['build:browser']).toContain('--loader:.ttf=file');
    expect(packageJson.scripts['build:browser']).toContain('--asset-names=fonts/[name]-[hash]');
    expect(packageJson.scripts['build:browser']).toContain('--define:__VUE_OPTIONS_API__=true');
    expect(packageJson.scripts['build:browser']).toContain('--define:__VUE_PROD_DEVTOOLS__=false');
    expect(packageJson.scripts.build).toContain('npm run build:browser');
    expect(packageJson.scripts.dev).toContain('npm run build:browser');

    expect(entry).toContain("export { Crepe } from '@milkdown/crepe'");
    expect(entry).toContain('@milkdown/crepe/theme/common/style.css');
    expect(entry).toContain('@milkdown/crepe/theme/frame.css');

    expect(runtime).toContain('import(MILKDOWN_CREPE_MODULE)');
    expect(runtime).toContain("'/vendor/milkdown-crepe.js'");
    expect(runtime).toContain("'/vendor/milkdown-crepe.css'");
    expect(runtime).not.toContain('https://');
    expect(runtime).not.toContain('cdn.jsdelivr.net');
    expect(app).toContain("app.use(\n    '/vendor'");
    expect(app).toContain("express.static(resolve(uiRoot, 'public/vendor')");
  });

  it('serializes visual-editor creation and invalidates stale asynchronous instances', async () => {
    const runtime = await source('public/js/sysbo/entry/rich-text-runtime.js');

    expect(runtime).toContain('state.editorGeneration += 1');
    expect(runtime).toContain('if (state.createPromise) await state.createPromise');
    expect(runtime).toContain('if (generation !== state.editorGeneration)');
    expect(runtime).toContain('await crepe.destroy?.()');
    expect(runtime).toContain('state.visualReadyValue === requestedMarkdown');
  });

  it('shares source resize height across Visual, Markdown and Preview surfaces', async () => {
    const runtime = await source('public/js/sysbo/entry/rich-text-runtime.js');
    const css = await source('public/css/pages.css');

    expect(runtime).toContain('new ResizeObserver');
    expect(runtime).toContain("root.style.setProperty('--manatos-rich-text-height'");
    expect(runtime).toContain('state.resizeObserver?.disconnect()');
    expect(css).toContain('height: var(--manatos-rich-text-height, 160px)');
    expect(css).toContain('min-height: var(--manatos-rich-text-min-height, 100px)');
    expect(css).toContain('max-height: var(--manatos-rich-text-max-height, 800px)');
  });

  it('keeps generated browser vendor output outside source-quality and archive boundaries', async () => {
    const eslintConfig = await source('../eslint.config.mjs');
    const prettierIgnore = await source('../.prettierignore');
    const gitIgnore = await source('../.gitignore');
    const sourceArchiver = await source('../ZIP_SRC.cmd');

    expect(eslintConfig).toContain("'**/public/vendor/**'");
    expect(prettierIgnore).toContain('ui/public/vendor');
    expect(gitIgnore).toContain('ui/public/vendor/');
    expect(sourceArchiver).toContain('-xr!"ui\\public\\vendor"');
  });
});
