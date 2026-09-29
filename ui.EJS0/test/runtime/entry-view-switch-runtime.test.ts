import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('entry ui-view switching', () => {
  it('keeps pending scalar-picture bytes outside CTX but projects them into every rematerialized view', async () => {
    const fieldRuntime = await source('public/js/sysbo/entry/field-runtime.js');
    const pictureRuntime = await source('public/js/sysbo/entry/fields/picture-fields.js');

    expect(pictureRuntime).not.toContain('const pendingScalarPictures = new Map()');
    expect(pictureRuntime).toContain('const owningEntryPath = (element) =>');
    expect(pictureRuntime).toContain('const pendingResourceKey = (descriptor) =>');
    expect(pictureRuntime).toContain('window.ManatOS?.uiRuntimeResourceForPath?.(path, key)');
    expect(pictureRuntime).toContain('window.ManatOS?.setUiRuntimeResourceForPath?.(path, key, {');
    expect(pictureRuntime).toContain('payload.value = JSON.stringify({');
    expect(pictureRuntime).toContain('dataBase64: pending.dataBase64');
    expect(fieldRuntime).toContain('pictureRuntime.projectScalarPictureValue(control, value)');
  });

  it('switches semantic presentation through typed runtime and rematerializes only physical markup', async () => {
    const runtime = await source('public/js/sysbo/entry/entry-view-runtime.js');
    const bridge = await source('src/browser/browser-host-bridge.ts');

    expect(runtime).toContain('uiHostV2?.switchEntryView?.({ path, viewKey: key })');
    expect(runtime).toContain('await rematerialize(form, switched.viewKey, path)');
    expect(runtime).toContain("url.searchParams.set('_entryUIView', viewKey)");
    expect(runtime).toContain(
      "form.dispatchEvent(new CustomEvent('manatos:entry-view-disposing'))",
    );
    expect(runtime).toContain('form.replaceWith(nextForm)');
    expect(runtime).toContain('surfaceRuntime.scan(nextForm)');
    expect(runtime).not.toContain('DOMParser');

    expect(bridge).toContain('switchEntryView: ({ path, viewKey }');
    expect(bridge).toContain('resolveSysBOUIView');
    expect(bridge).toContain('entryPresentationDefinition(resolved)');
    expect(bridge).toContain("action: 'switch-entry-view'");
    expect(bridge).toContain('projectUiLayout(next, definition)');
  });

  it('tracks the selected tab in the canonical UI-level state', async () => {
    const shell = await source('public/js/shell/shell.js');
    expect(shell).toContain('`${path}.state.navigation`');
    expect(shell).not.toContain('`${path}.control.state.navigation`');
    expect(shell).toContain("reason: 'navigation-selected'");

    const policy = await source('public/js/sysbo/entry/entry-policy-runtime.js');
    expect(policy).toContain('surface.state?.navigation?.activeTabId');
  });

  it('keeps popup entry state in the same canonical UiLevel during view rematerialization', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    expect(popup).toContain('popupRuntime?.hydrateEntrySurface?.(v2Surface, data.bootstrap)');
    expect(popup).toContain('window.ManatOS?.entrySurfaces?.scan?.(contentHost)');
    expect(popup).not.toContain('attachHostedEntrySurface');
    expect(popup).not.toContain('hostedWindow');
    const host = await source('public/js/runtime/ui-host-runtime.js');
    expect(host).not.toContain('attachHostedEntrySurface');
  });

  it('keeps no-tab view switching reachable through the universal surface-tools host', async () => {
    const runtime = await source('public/js/sysbo/entry/entry-view-runtime.js');
    const popup = await source('public/js/popups/entry-popup.js');
    const tools = await source('public/js/runtime/surface-tools-runtime.js');

    expect(runtime).toContain(
      ':scope > div:not([data-entry-view-tools-caption-source]) > .entity-tabs',
    );
    expect(runtime).toContain("surfaceTools?.register?.('entry-ui-view'");
    expect(runtime).toContain("new CustomEvent('manatos:entry-ui-view-request'");
    expect(runtime).toContain('surfaceTools?.render?.(tools)');
    expect(popup).toContain('data-entry-popup-view-tools');
    expect(popup).toContain('captionTools.dataset.surfaceToolsAnchor');
    expect(popup).toContain('surfaceTools?.render?.(captionTools)');
    expect(tools).toContain('const providers = new Map()');
    expect(tools).toContain('const normalizeModel');
    expect(tools).toContain('data-surface-tools-anchor');
  });

  it('keeps view metadata surface-local while one generic tools renderer owns menu population', async () => {
    const policy = await source('public/js/sysbo/entry/entry-policy-runtime.js');
    const tabs = await source('views/components/sysbo/entry/shell/entry-tabs-nav.ejs');
    const runtime = await source('public/js/sysbo/entry/entry-view-runtime.js');
    const tools = await source('public/js/runtime/surface-tools-runtime.js');
    expect(policy).toContain("form.querySelector('[data-entry-ui-view-metadata]')");
    expect(tabs).toContain('data-surface-tools-anchor');
    expect(tabs).toContain('data-entry-ui-view-catalog');
    expect(tabs).not.toContain('data-entry-ui-view-action');
    expect(tabs).not.toContain('dropdown-submenu ui-view-tools-submenu');
    expect(runtime).toContain('view?.readOnly === currentView.readOnly');
    expect(runtime).toContain("title: compatible ? '' : 'Different read-only view type'");
    expect(tools).toContain('group.label');
    expect(tools).toContain('dataset.surfaceToolGroup');
  });
});
