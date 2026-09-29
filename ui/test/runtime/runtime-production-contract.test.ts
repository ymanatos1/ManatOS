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
    expect(popup).toContain(
      'frame.src = `${hostedUrl.pathname}${hostedUrl.search}${hostedUrl.hash}`',
    );
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

  it('does not hydrate full page CTX for expression transport requests', async () => {
    const pageContext = await ui('src/middleware/page-context.ts');

    expect(pageContext).toContain("'/bo/expression/compile'");
    expect(pageContext).toContain("'/bo/expression/evaluate-function'");
    expect(pageContext).toContain('if (!requiresPageContext(req.path))');
    expect(pageContext).toContain('next();');
  });

  it('moves generic-page and hierarchy topology authorship fully to the browser host', async () => {
    const pageContext = await ui('src/middleware/page-context.ts');
    const hierarchy = await ui('src/routes/sysbo/hierarchy/renderer.ts');
    const hierarchyBrowser = await ui('public/js/sysbo/hierarchy/hierarchy-workspace.js');

    expect(pageContext).not.toContain('projectUiCtx(');
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
    expect(entry).not.toContain('projectUiCtx(');
    expect(list).not.toContain('evaluateExpression(');
    expect(renderer).not.toContain('ctx.page');
    expect(renderer).not.toContain('baseCtx.page');
  });
  it('keeps live page/popup/embedded host authority in the browser runtime', async () => {
    const browserHost = await ui('public/js/runtime/ui-host-runtime.js');
    const app = await ui('src/app.ts');
    const pageContext = await ui('src/middleware/page-context.ts');
    const list = await ui('src/routes/sysbo/list/renderer.ts');
    const entry = await ui('src/routes/sysbo/entry/renderer.ts');
    const hierarchy = await ui('src/routes/sysbo/hierarchy/renderer.ts');

    expect(browserHost).toContain("host: 'page'");
    expect(browserHost).toContain("host = 'popup'");
    expect(browserHost).toContain("if (!['popup', 'embedded'].includes(host))");

    for (const source of [app, pageContext, list, entry, hierarchy]) {
      expect(source).not.toMatch(/runtime\/hosts\/(?:page|popup|embedded|surface-host-runtime)/);
    }

    // The parallel TypeScript host prototype was never a production authority.
    // Keep it removed so host lifecycle cannot split across two implementations again.
    for (const obsoleteHost of [
      'src/runtime/hosts/page-host.ts',
      'src/runtime/hosts/popup-host.ts',
      'src/runtime/hosts/embedded-host.ts',
      'src/runtime/hosts/surface-host-runtime.ts',
      'src/runtime/hosts/host-contracts.ts',
    ]) {
      await expect(ui(obsoleteHost)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('keeps relationship, embedded-collection and hierarchy workspace ownership in live browser runtimes', async () => {
    const fieldRuntime = await ui('public/js/sysbo/entry/field-runtime.js');
    const collectionEditor = await ui('views/components/sysbo/entry/content/collection-editor.ejs');
    const hierarchyWorkspace = await ui('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const hierarchyModel = await ui('public/js/sysbo/hierarchy/hierarchy-workspace-model.js');

    expect(fieldRuntime).toContain('targetField: fieldKey');
    expect(fieldRuntime).toContain("source: 'record-selector'");
    expect(collectionEditor).toContain("Refresh this collection's aggregate contributor");
    expect(hierarchyWorkspace).toContain('entriesOriginal');
    expect(hierarchyWorkspace).toContain('focusedMemberId');
    expect(hierarchyModel.length).toBeGreaterThan(0);

    // These host-neutral TypeScript models were specification scaffolding only.
    // Keep them absent so semantic ownership cannot split from the live browser runtime.
    for (const obsoleteRuntime of [
      'src/runtime/relationships/relationship-composition-runtime.ts',
      'src/runtime/state/collection-draft-runtime.ts',
      'src/runtime/state/hierarchy-workspace-runtime.ts',
    ]) {
      await expect(ui(obsoleteRuntime)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('keeps child entry and selector completion authority in the live browser runtimes', async () => {
    const host = await ui('public/js/runtime/ui-host-runtime.js');
    const entryPopup = await ui('public/js/popups/entry-popup.js');
    const recordSelector = await ui('public/js/popups/record-selector.js');
    const collectionEditor = await ui('views/components/sysbo/entry/content/collection-editor.ejs');

    expect(host).toContain('const openSurface = ({');
    expect(entryPopup).toContain('window.ManatOS.popup.entry = Object.freeze({');
    expect(recordSelector).toContain('window.ManatOS.popup.recordSelector = Object.freeze({');
    expect(collectionEditor).toContain('window.ManatOS?.uiHost?.openSurface?.({');

    // These TypeScript wrappers were specification scaffolding only. Production
    // completion/lifecycle is browser-owned and must not regain a parallel authority.
    for (const obsoleteRuntime of [
      'src/runtime/relationships/entry-open-runtime.ts',
      'src/runtime/relationships/entry-selector-runtime.ts',
    ]) {
      await expect(ui(obsoleteRuntime)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
  it('keeps relationship and surface-purpose decisions out of the superseded TypeScript policy prototypes', async () => {
    const host = await ui('public/js/runtime/ui-host-runtime.js');
    const fieldRuntime = await ui('public/js/sysbo/entry/field-runtime.js');

    expect(host).toContain('openSurface');
    expect(host).toContain('purpose');
    expect(fieldRuntime).toContain("source: 'record-selector'");

    for (const obsoletePolicy of [
      'src/runtime/policies/relationship-policy.ts',
      'src/runtime/policies/surface-purpose-policy.ts',
    ]) {
      await expect(ui(obsoletePolicy)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('keeps the retired host-neutral entry/surface runtime island absent', async () => {
    const browserHost = await ui('public/js/runtime/ui-host-runtime.js');
    const browserPolicy = await ui('public/js/sysbo/entry/entry-policy-runtime.js');
    const browserContext = await ui('public/js/runtime/context-runtime.js');

    expect(browserHost).toContain('openSurface');
    expect(browserPolicy).toContain('evaluateSourceOwnedAt');
    expect(browserContext).toContain('updateField');

    for (const obsoleteRuntime of [
      'src/runtime/calculations/dependency-runtime.ts',
      'src/runtime/commands/command-contracts.ts',
      'src/runtime/commands/command-runtime.ts',
      'src/runtime/context/root-ctx-adapters.ts',
      'src/runtime/context/root-ctx-runtime.ts',
      'src/runtime/context/surface-ctx-projection.ts',
      'src/runtime/events/surface-event-runtime.ts',
      'src/runtime/policies/navigation-policy.ts',
      'src/runtime/policies/policy-contracts.ts',
      'src/runtime/resolvers/effective-field-context-resolver.ts',
      'src/runtime/resolvers/effective-ui-metadata-resolver.ts',
      'src/runtime/resolvers/expression-binding.ts',
      'src/runtime/state/entity-entry-runtime.ts',
      'src/runtime/state/entry-aggregate-state-runtime.ts',
      'src/runtime/state/entry-state-runtime.ts',
      'src/runtime/state/field-state-runtime.ts',
      'src/runtime/surface/contracts.ts',
      'src/runtime/surface/result-contracts.ts',
      'src/runtime/surface/surface-runtime.ts',
      'src/runtime/validation/validation-runtime.ts',
    ]) {
      await expect(ui(obsoleteRuntime)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('keeps field-specific browser runtimes under the entry fields boundary', async () => {
    const pictureFields = await ui('public/js/sysbo/entry/fields/picture-fields.js');
    const richText = await ui('public/js/sysbo/entry/fields/rich-text-runtime.js');

    expect(pictureFields).toContain('Picture and Pictures field-component runtime');
    expect(richText).toContain('Reusable canonical rich-text field runtime');
    await expect(ui('public/js/sysbo/entry/field-runtime/picture-fields.js')).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    await expect(ui('public/js/sysbo/entry/rich-text-runtime.js')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
