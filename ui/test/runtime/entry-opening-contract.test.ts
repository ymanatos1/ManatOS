import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('canonical entry opening contract', () => {
  it('normalizes semantic intent once and dispatches through registered host adapters', async () => {
    const opening = await source('public/js/runtime/entry-opening.js');
    const popup = await source('public/js/popups/entry-popup.js');
    const field = await source('public/js/sysbo/entry/field-runtime.js');
    const tree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const workspace = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const shell = await source('views/layout/shell.ejs');

    expect(opening).toContain('const normalize = (input = {}) =>');
    expect(opening).toContain(
      'const composeCallerRules = (declaration = {}, sourceValues = {}) =>',
    );
    expect(opening).toContain('const transport = (input) =>');
    expect(opening).toContain('_entryHost: opening.host');
    expect(opening).toContain('_entryToken: opening.token');
    expect(opening).toContain('const hostAdapters = new Map()');
    expect(opening).toContain('const registerHost = (host, opener) =>');
    expect(opening).toContain('const open = (input = {}) =>');
    expect(opening).toContain('_entryMode: opening.mode');
    expect(opening).toContain('_entryUIView: opening.uiViewKey');
    expect(opening).toContain('_entryDefaults: JSON.stringify(opening.rules.defaults)');
    expect(opening).toContain('_entryOverrides: JSON.stringify(opening.rules.uiOverrides)');
    expect(shell.indexOf('/js/runtime/entry-opening.js')).toBeLessThan(
      shell.indexOf('/js/popups/entry-popup.js'),
    );
    expect(popup).toContain("registerHost?.('popup', openProjectedEntry)");
    expect(popup).toContain('const projected = adapter.transport(opening)');

    for (const caller of [field, tree, workspace]) {
      expect(caller).toContain('entryOpening.open');
      expect(caller).not.toContain('_entryToken');
      expect(caller).not.toContain('_entryDefaults');
      expect(caller).not.toContain('_entryOverrides');
    }
  });
  it('provides a re-entrant entry-surface installation boundary before direct hosting', async () => {
    const shell = await source('views/layout/shell.ejs');
    const surfaces = await source('public/js/sysbo/entry/entry-surface-runtime.js');
    const initialization = await source('public/js/sysbo/entry/entry-initialization-runtime.js');

    expect(shell.indexOf('/js/sysbo/entry/entry-surface-runtime.js')).toBeLessThan(
      shell.indexOf('/js/sysbo/entry/entry-initialization-runtime.js'),
    );
    expect(surfaces).toContain('const register = (name, installer) =>');
    expect(surfaces).toContain('new MutationObserver(');
    expect(surfaces).toContain('form[data-v2-entry-form]');
    expect(initialization).toContain("surfaceRuntime.register('entry-initialization', install)");
    expect(initialization).toContain('form.dataset.ctxScopePath || leafPath()');
    expect(initialization).toContain('forForm: (form) =>');
    expect(initialization).toContain('forPath: (path) =>');
  });

  it('installs reactive expression/form state per entry surface before direct hosting', async () => {
    const formRuntime = await source('public/js/sysbo/entry/form-runtime.js');

    expect(formRuntime).toContain('const entryPagePath = form.dataset.ctxScopePath || null;');
    expect(formRuntime).toContain('const instances = new WeakMap();');
    expect(formRuntime).toContain('const instancesByPath = new Map();');
    expect(formRuntime).toContain("surfaceRuntime.register('reactive-entry-form', install);");
    expect(formRuntime).toContain('window.ManatOS.expressionRuntimes = Object.freeze({');
    expect(formRuntime).toContain('forForm: (form) => instances.get(form)?.expression || null');
    expect(formRuntime).toContain('window.removeEventListener(CHANGE_EVENT, onCtxChange);');
    expect(formRuntime).not.toContain("document.querySelector('form.metadata-driven-record-form')");
    expect(formRuntime).not.toContain('const entryPagePath = leafPagePath();');
  });
  it('reconciles late-mounted field presentation and rich-text surfaces', async () => {
    const fieldRuntime = await source('public/js/sysbo/entry/field-runtime.js');
    const richTextRuntime = await source('public/js/sysbo/entry/fields/rich-text-runtime.js');

    expect(fieldRuntime).toContain("entrySurfaces?.register?.('field-presentation'");
    expect(fieldRuntime).toContain('const reconcileFieldPresentation = (root) =>');
    expect(richTextRuntime).toContain("entrySurfaces?.register?.('rich-text-fields'");
    expect(richTextRuntime).toContain('const initializeRichTextRoot = (root) =>');
    expect(richTextRuntime).toContain('states.has(root)');
  });

  it('direct-hosts readonly GET entries through the canonical surface runtime with routed fallback', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    const host = await source('public/js/runtime/ui-host-runtime.js');

    expect(popup).toContain(
      "const directReadonlyRequested = mode === 'view' && requestMethod === 'GET';",
    );
    expect(popup).toContain("headers: { 'X-ManatOS-Entry-Host': 'direct' }");
    expect(popup).toContain('hydrateEntrySurface?.(v2Surface, bootstrap)');
    expect(popup).toContain('entrySurfaces?.installForm?.(directForm)');
    expect(popup).toContain("directForm.addEventListener('manatos:form-initialization-settled'");
    expect(popup).toContain('fallbackToRoutedHost();');
    expect(popup).toContain("hostStrategy: directActive ? 'direct' : 'routed'");
    expect(host).toContain('const hydrateEntrySurface = (handle, entryBootstrap) =>');
    expect(host).toContain("action: 'hydrate-entry-surface'");
    expect(host).toContain('hydrateEntrySurface,');
  });

  it('keeps readonly entry references presentation-only instead of loading selector catalogues', async () => {
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');
    const supplemental = await source('src/routes/sysbo/entry/supplemental-data.ts');
    const dataAccess = await source('src/routes/sysbo/shared/data-access.ts');

    expect(renderer).toContain("recordMode === 'view'");
    expect(supplemental).toContain('selectionOnly: readOnlyPresentation');
    expect(supplemental).toContain('const referenceSelectorContexts = readOnlyPresentation');
    expect(supplemental).toContain('const relatedEntityPermissions = readOnlyPresentation');
    expect(dataAccess).toContain('selectionOnly?: boolean;');
    expect(dataAccess).toContain('selectedIdsByField?:');
    expect(dataAccess).toContain('if (options.selectionOnly)');
    expect(dataAccess).toContain(
      'const selection = options.selectionOnly ? undefined : field.referenceSelection;',
    );
    expect(dataAccess).toContain('targetUIMetadata?.list.visibleFields');
    expect(dataAccess).toContain('fieldKeys: selectorFieldKeys');
  });

  it('keeps list and related-collection reference hydration demand-driven', async () => {
    const renderer = await source('src/routes/sysbo/list/renderer.ts');
    const parentList = await source('src/routes/sysbo/list/parent-list.ts');
    const collections = await source('src/routes/sysbo/related/collections.ts');

    expect(renderer).toContain('entryUsesRelations ? {} : { fieldKeys: listReferenceFields }');
    expect(parentList).toContain('entryUsesRelations ? {} : { fieldKeys: referenceFields }');
    expect(collections).toContain('fieldKeys: collectionFieldKeys');
    expect(collections).toContain('selectionOnly: readOnlyPresentation');
    expect(collections).toContain('selectedIdsByField');
  });

  it('hydrates independent reference catalogues concurrently within one request', async () => {
    const dataAccess = await source('src/routes/sysbo/shared/data-access.ts');

    expect(dataAccess).toContain('await Promise.all(');
    expect(dataAccess).toContain(
      'Object.values(definition.boMetadata.fieldDefinition).map(async (field) =>',
    );
    expect(dataAccess).toContain('memoizeRequest(');
  });

  it('logs per-opening API request breakdowns through the UI runtime telemetry transport', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    const debugRoutes = await source('src/routes/debug/index.ts');
    const trafficStore = await source('src/debug/api-traffic-store.ts');

    expect(popup).toContain('/bo/debug/ui-runtime/api-request-summary?after=');
    expect(popup).toContain('apiRequests,');
    expect(debugRoutes).toContain("router.get('/ui-runtime/api-request-summary'");
    expect(trafficStore).toContain('summarizeApiTrafficAfterSequence');
    expect(trafficStore).toContain('requests: [...byRequest.entries()]');
  });

  it('keeps canonical metadata caching request-scoped until a version contract exists', async () => {
    const dataAccess = await source('src/routes/sysbo/shared/data-access.ts');
    const requestMemo = await source('src/runtime/request-memo.ts');

    expect(dataAccess).toContain('memoizeRequest(');
    expect(dataAccess).toContain('/$metadata');
    expect(dataAccess).toContain('/$metadata-ui');
    expect(requestMemo).toContain('new WeakMap<Request, Map<string, Promise<unknown>>>()');
    expect(requestMemo).toContain('requestPromises.set(req, registry)');
    expect(requestMemo).not.toContain('setInterval(');
    expect(requestMemo).not.toContain('setTimeout(');
  });
});
