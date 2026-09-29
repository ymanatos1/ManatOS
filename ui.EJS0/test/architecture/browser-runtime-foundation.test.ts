import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('typed browser runtime foundation', () => {
  it('builds and loads the TypeScript browser runtime after canonical CTX startup', async () => {
    const packageJson = JSON.parse(await source('package.json'));
    const entry = await source('src/browser/runtime-entry.ts');
    const shell = await source('views/layout/shell.ejs');
    const app = await source('src/app.ts');

    expect(packageJson.scripts['build:browser:runtime']).toContain('src/browser/runtime-entry.ts');
    expect(packageJson.scripts['build:browser:runtime']).toContain(
      'public/dist/manatos-runtime.js',
    );
    expect(packageJson.scripts['build:browser']).toContain('build:browser:rich-text');
    expect(packageJson.scripts['build:browser']).toContain('build:browser:runtime');
    expect(entry).toContain("from '../runtime/v2/ui-runtime.js'");
    expect(entry).toContain("from '../runtime/v2/collection.js'");
    expect(entry).toContain("from '../runtime/v2/collection-entry.js'");
    expect(shell).toContain('type="module" src="/dist/manatos-runtime.js');
    expect(app).toContain("'/dist',");
    expect(app).toContain("express.static(resolve(uiRoot, 'public/dist')");
    expect(shell.indexOf('/js/runtime/context-runtime.js')).toBeLessThan(
      shell.indexOf('/dist/manatos-runtime.js'),
    );
  });

  it('keeps generated runtime bundles outside source-quality and source-archive boundaries', async () => {
    const eslintConfig = await source('../eslint.config.mjs');
    const prettierIgnore = await source('../.prettierignore');
    const gitIgnore = await source('../.gitignore');
    const sourceArchiver = await source('../ZIP_SRC.cmd');

    expect(eslintConfig).toContain("'**/public/dist/**'");
    expect(prettierIgnore).toContain('ui.EJS0/public/dist');
    expect(gitIgnore).toContain('ui.EJS0/public/dist/');
    expect(sourceArchiver).toContain('-xr!"ui.EJS0\\public\\dist"');
  });

  it('starts with open identifiers rather than closed host/surface enumerations', async () => {
    const contracts = await source('src/runtime/v2/contracts.ts');

    expect(contracts).toContain('export type UiSurfaceTypeId = string');
    expect(contracts).toContain('export type UiHostTypeId = string');
    expect(contracts).toContain('readonly surface: UiSurfaceTypeId');
    expect(contracts).toContain('readonly host: UiHostTypeId');
    expect(contracts).not.toContain("'page' | 'popup' | 'embedded'");
  });

  it('routes browser child host lifecycle through the typed UiRuntime bridge', async () => {
    const hostRuntime = await source('public/js/runtime/ui-host-runtime.js');
    const bridge = await source('src/browser/browser-host-bridge.ts');
    expect(hostRuntime).toContain('uiHostV2');
    expect(hostRuntime).toContain('typedHost.openSurface(request)');
    expect(hostRuntime).not.toContain('typedHost.openPrepared');
    expect(bridge).toContain('const prepareBrowserSurface');
    expect(bridge).toContain('const entryFields');
    const deactivateParent = bridge.indexOf("owner.deactivate(parent, 'browser-host-bridge')");
    const adoptChild = bridge.indexOf('const level = owner.adoptChild');
    const publishChild = bridge.indexOf('ctx.replace(childPath, preparedWithLayout');
    expect(deactivateParent).toBeGreaterThan(-1);
    expect(adoptChild).toBeGreaterThan(deactivateParent);
    expect(publishChild).toBeGreaterThan(adoptChild);
    expect(hostRuntime).toContain('typedHost?.close');
    expect(hostRuntime).toContain('Typed UI runtime is required to close a browser UI surface.');
    expect(hostRuntime).not.toContain('runtime.delete(handle.path');
    expect(hostRuntime).not.toContain('runtime.replace(`${handle.path}.state.lifecycle`');
    expect(bridge).toContain('runtime.open<PreparedBrowserSurface>');
    expect(bridge).toContain('runtime.requestClose(level');
    expect(bridge).not.toContain("lifecycle: 'deactivating'");
    expect(bridge).not.toContain("action: 'deactivate-parent-surface'");
    expect(bridge).toContain('disposeAll:');
    expect(hostRuntime).toContain("options?.decision === 'discard'");
    expect(hostRuntime).toContain("{ decision: 'discard' }");
    expect(hostRuntime).not.toContain('runtime.replace(`${levelPath}.state.lifecycle`');
    expect(bridge).toContain("ensureHost(runtime, ctx, 'popup')");
    expect(bridge).toContain("ensureHost(runtime, ctx, 'embedded')");
  });

  it('keeps typed popup presentation authoritative over DOM compatibility projection', async () => {
    const entry = await source('src/browser/runtime-entry.ts');
    const descriptors = await source('src/browser/popup-presentation.ts');
    const popupRuntime = await source('public/js/popups/popup-runtime.js');
    const bootstrap = await source('src/browser/runtime-bootstrap.ts');
    const authModals = await source('views/popups/auth/auth-modals.ejs');

    expect(entry).toContain('installPopupPresentationDescriptors()');
    expect(descriptors).toContain("'auth-sign-in'");
    expect(descriptors).toContain("component: 'auth-credentials'");
    expect(descriptors).toContain("action: 'sign-in'");
    expect(popupRuntime).toContain('canonicalPopupPresentation(invocation)');
    expect(popupRuntime).toContain('canonicalPresentation || {');
    expect(popupRuntime).not.toContain('popupPresentationDefinition');
    expect(authModals).not.toContain('data-popup-presentation-definition');
    expect(bootstrap).not.toContain('projectUiLayout');
    expect(bootstrap).not.toContain('publishMissingLayouts');
  });

  it('adopts bootstrap root presentation into typed layout ownership once at startup', async () => {
    const entry = await source('src/browser/runtime-entry.ts');
    const bootstrapLayout = await source('src/browser/bootstrap-layout.ts');
    const bootstrap = await source('src/browser/runtime-bootstrap.ts');

    expect(entry).toContain('installBootstrapLayouts()');
    expect(bootstrapLayout).toContain("kind === 'list'");
    expect(bootstrapLayout).toContain("componentDefinition('entity-list')");
    expect(bootstrapLayout).toContain('entryPresentationDefinition');
    expect(bootstrapLayout).toContain("action: 'adopt-bootstrap-presentation'");
    expect(bootstrapLayout).toContain('projectUiLayout(level, definition)');
    expect(bootstrap).not.toContain('projectUiLayout');
    expect(bootstrap).not.toContain('publishMissingLayouts');
  });

  it('dispatches semantic entry openings by host without making popup the universal case', async () => {
    const bridge = await source('src/browser/browser-host-bridge.ts');
    const opening = await source('public/js/runtime/entry-opening.js');

    expect(bridge).toContain('entryPagePresenter?: BrowserEntryPresenter');
    expect(bridge).toContain('entryPopupPresenter?: BrowserEntryPresenter');
    expect(bridge).toContain("opening.host === 'page'");
    expect(bridge).toContain("opening.host === 'popup'");
    expect(bridge).not.toContain("opening.host !== 'popup'");
    expect(opening).toContain('window.ManatOS.entryPagePresenter = openPage');
    expect(opening).toContain('const projected = transport(opening)');
  });
  it('restores bootstrap inspection Properties without reprojecting established ancestor layouts', async () => {
    const bootstrapLayoutSource = await source('src/browser/bootstrap-layout.ts');
    expect(bootstrapLayoutSource).toContain('const projected = projectUiLayout(level, definition)');
    expect(bootstrapLayoutSource).toContain(
      'restoreUiLayoutInspectionProperties(existingLayout, projected)',
    );
    expect(bootstrapLayoutSource).toContain('if (child && existingLayout)');
    expect(bootstrapLayoutSource).toContain("action: 'adopt-bootstrap-presentation'");
  });
});
