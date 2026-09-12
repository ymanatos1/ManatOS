import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');

describe('UI Engine V2 production cutover', () => {
  it('removes request-time engine selection and renders canonical V2 list/entry pages only', async () => {
    const app = await ui('src/app.ts');
    const list = await ui('src/routes/sysbo/list/renderer.ts');
    const entry = await ui('src/routes/sysbo/entry/renderer.ts');
    const hierarchy = await ui('src/routes/sysbo/hierarchy/renderer.ts');

    expect(app).not.toContain('uiEngineMigrationMiddleware');
    expect(list).not.toContain('enableV2Scenario');
    expect(entry).not.toContain('enableV2Scenario');
    expect(hierarchy).not.toContain('enableV2Scenario');
    expect(list).toContain("'pages/sysbo/list'");
    expect(entry).toContain("'pages/sysbo/entry'");
    expect(list).not.toContain('compareSemanticSnapshots');
    expect(entry).not.toContain('compareSemanticSnapshots');
  });

  it('removes migration controls and engine propagation from browser navigation/popup hosting', async () => {
    const titlebar = await ui('views/components/page/titlebar.ejs');
    const shell = await ui('public/js/shell/shell.js');
    const popup = await ui('public/js/popups/entry-popup.js');

    expect(titlebar).not.toContain('ui-engine-migration');
    expect(shell).not.toContain('data-ui-engine-migration');
    expect(shell).not.toContain("url.searchParams.set('uiEngine'");
    expect(popup).not.toContain('inheritUiEngine');
    expect(popup).toContain('frame.src = url');
  });
  it('keeps browser CTX free of server-built page/UI topology and boots ctx.ui in the browser', async () => {
    const renderer = await ui('src/presentation/page/render-page.ts');
    const shell = await ui('views/layout/shell.ejs');
    const browserHost = await ui('public/js/runtime/ui-host-runtime.js');
    const entryView = await ui('views/components/runtime/entity-entry.ejs');

    expect(renderer).toContain('ui: _serverRenderUi');
    expect(renderer).toContain('browserCtx');
    expect(shell).toContain('manatosUiBootstrap');
    expect(shell).toContain('/js/runtime/ui-host-runtime.js');
    expect(shell).toContain(
      "JSON.stringify(typeof browserCtx !== 'undefined' ? browserCtx : null)",
    );
    expect(browserHost).toContain('ctx.ui = { level: fromBootstrap() }');
    expect(entryView).not.toContain('name="uiEngine"');
    expect(entryView).not.toContain('?uiEngine=v2');
  });
  it('moves generic-page and hierarchy topology authorship fully to the browser host', async () => {
    const pageContext = await ui('src/middleware/page-context.ts');
    const hierarchy = await ui('src/routes/sysbo/hierarchy/renderer.ts');
    const hierarchyBrowser = await ui('public/js/sysbo/hierarchy/hierarchy-workspace.js');

    expect(pageContext).not.toContain('new SurfaceRuntime()');
    expect(pageContext).not.toContain('projectUiCtx(');
    expect(hierarchy).not.toContain('new SurfaceRuntime()');
    expect(hierarchy).not.toContain('projectUiCtx(');
    expect(hierarchy).not.toContain('currentUiLevelPath(');
    expect(hierarchyBrowser).toContain('const activeUiLevelPath = () =>');
    expect(hierarchyBrowser).not.toContain("runtime.resolve('ctx.page')");
  });

  it('stops production SysBO renderers from constructing or consuming legacy page CTX', async () => {
    const list = await ui('src/routes/sysbo/list/renderer.ts');
    const entry = await ui('src/routes/sysbo/entry/renderer.ts');
    const hierarchy = await ui('src/routes/sysbo/hierarchy/renderer.ts');
    const renderer = await ui('src/presentation/page/render-page.ts');

    for (const source of [list, entry, hierarchy]) {
      expect(source).not.toContain('applySysBOListContext');
      expect(source).not.toContain('applySysBOEntryContext');
      expect(source).not.toContain('currentPageContext(');
      expect(source).not.toContain('setPageContext(');
      expect(source).not.toContain('pageContextNode(');
    }
    expect(entry).toContain('registerContextEntity(ctx, definition.key, metadata, metadataUI)');
    expect(list).not.toContain('contextFields({');
    expect(list).not.toContain('new SurfaceRuntime()');
    expect(entry).not.toContain('new SurfaceRuntime()');
    expect(entry).not.toContain('new EntityEntryRuntime({');
    expect(entry).not.toContain('projectUiCtx(');
    expect(list).not.toContain('evaluateExpression(');
    expect(renderer).not.toContain('ctx.page');
    expect(renderer).not.toContain('baseCtx.page');
  });
});
