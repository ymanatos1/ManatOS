import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('canonical entry opening contract', () => {
  it('hydrates browser-opened entry CTX from the supplied entry bootstrap', async () => {
    const uiHost = await source('public/js/runtime/ui-host-runtime.js');
    const bridge = await source('src/browser/browser-host-bridge.ts');
    expect(uiHost).toContain('uiHostV2?.hydrateEntrySurface?.(handle, entryBootstrap)');
    expect(bridge).toContain('hydrateEntrySurface: (handle: BrowserHydrateEntryInput');
    expect(bridge).toContain('const original = structuredClone(asRecord(entry.original) ?? {})');
    expect(bridge).toContain('const currentEntry = structuredClone(asRecord(entry.current) ?? {})');
    expect(bridge).toContain(
      'const presentationDefinition = entryPresentationDefinition(resolvedUIView)',
    );
    expect(bridge).toContain('definition: presentationDefinition');
    expect(bridge).toContain('projectUiLayout(hydrated, presentationDefinition)');
    expect(bridge).not.toContain('currentPresentation.definition');
    expect(bridge).toContain("action: 'hydrate-entry-surface'");
  });

  it('normalizes semantic intent once and delegates opening to the typed runtime host bridge', async () => {
    const opening = await source('public/js/runtime/entry-opening.js');
    const popup = await source('public/js/popups/entry-popup.js');
    const field = await source('public/js/sysbo/entry/field-runtime.js');
    const tree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const workspace = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const uiHost = await source('public/js/runtime/ui-host-runtime.js');
    const shell = await source('views/layout/shell.ejs');

    expect(opening).toContain('const normalize = (input = {}) =>');
    expect(opening).toContain(
      'const composeCallerRules = (declaration = {}, sourceValues = {}) =>',
    );
    expect(opening).toContain('const transport = (input) =>');
    expect(opening).toContain('_entryHost: opening.host');
    expect(opening).toContain('_entryToken: opening.token');
    expect(opening).not.toContain('const hostAdapters = new Map()');
    expect(opening).not.toContain('const registerHost = (host, opener) =>');
    expect(opening).toContain('const open = (input = {}) =>');
    expect(opening).toContain('_entryMode: opening.mode');
    expect(opening).toContain('_entryUIView: opening.uiViewKey');
    expect(opening).toContain("if (key.startsWith('_entry')) url.searchParams.delete(key);");
    expect(opening).toContain('_entryDefaults: JSON.stringify(opening.rules.defaults)');
    expect(opening).toContain('_entryOverrides: JSON.stringify(opening.rules.uiOverrides)');
    expect(shell.indexOf('/js/runtime/entry-opening.js')).toBeLessThan(
      shell.indexOf('/js/popups/entry-popup.js'),
    );
    expect(popup).toContain('window.ManatOS.entryPopupPresenter = openProjectedEntry');
    expect(opening).toContain('window.ManatOS.entryPagePresenter = openPage');
    expect(opening).toContain('window.location.assign(projected.url)');
    expect(popup).toContain('const projected = adapter.transport(opening)');
    expect(opening).toContain('window.ManatOS?.uiHostV2');
    expect(opening).toContain('return runtimeHost.openEntry(opening)');
    expect(opening).not.toContain("host !== 'popup'");

    for (const caller of [field, tree, workspace]) {
      expect(caller).toContain('entryOpening.open');
      expect(caller).not.toContain('_entryToken');
      expect(caller).not.toContain('_entryDefaults');
      expect(caller).not.toContain('_entryOverrides');
    }
    expect(workspace).toContain('entryOpening.composeCallerRules');
    expect(workspace).toContain('organizationSurface.ownedEntryFieldRules(memberId)');
    expect(workspace).toContain("purpose: 'hierarchy-owned-entry'");
    expect(workspace).toContain('const projected = entryOpening.transport({');
    expect(uiHost).toContain('breadcrumbItems: Array.isArray(bootstrap.breadcrumbItems)');
    expect(workspace).toContain('page?.control?.presentation?.breadcrumbItems');
    expect(workspace).not.toContain('Array.isArray(page?.breadcrumbItems)');
    expect(field).toContain('ownerProviderForPath?.(pagePath)');
    expect(field).toContain('ownerSurface.canOwnEntity?.(targetEntityKey)');
    expect(field).toContain(
      'const externalOwnerSurface = ownerSurface?.canOwnEntity?.(targetEntityKey)',
    );
    expect(field).toContain('const reconcileReferenceOwnerActions = (root, control) => {');
    expect(field).toContain('item.hidden = !eligible');
    expect(field).toContain("case 'edit-owned-entry':");
    expect(field).toContain('ownerSurface.provideEntryIfPresent?.(');
    expect(field).not.toContain('_ownerEntryTransfer');
    expect(field).not.toContain('/owned-existing-entry/');
    expect(field).toContain('const ownerDraft = Boolean(existingTransfer');
    expect(field).toContain("purpose: 'edit-owned-related-entry'");
    expect(workspace).toContain('caller: { workspaceOwned: true }');
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

  it('hosts entries directly in the owning popup UiLevel without a second document runtime', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    const host = await source('public/js/runtime/ui-host-runtime.js');

    expect(popup).toContain("hostedUrl.searchParams.set('_entryDirectHost', '1')");
    expect(popup).toContain("hostedUrl.searchParams.set('_entryCtxPath', popupPath)");
    expect(popup).toContain('popupRuntime?.hydrateEntrySurface?.(v2Surface, data.bootstrap)');
    expect(popup).toContain('window.ManatOS?.entrySurfaces?.scan?.(contentHost)');
    // The empty popup shell must not announce a rendered semantic Entry. The
    // mounted Entry form publishes the canonical event after direct-host context
    // merge/hydration, so typed adoption can resolve heterogeneous entity metadata.
    expect(popup).not.toContain(
      "new CustomEvent('manatos:ui-surface-rendered', { detail: { path: popupPath } })",
    );
    expect(popup).not.toContain('<iframe');
    expect(popup).not.toContain('parent.ManatOS?.popup?.entry');
    expect(host).not.toContain('attachHostedEntrySurface');
    expect(popup).toContain("parentPopup.backdrop.style.pointerEvents = 'none'");
    expect(popup).toContain("resumedParent.backdrop.style.pointerEvents = ''");
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
      'const selection = options.selectionOnly ? undefined : relationshipSelection;',
    );
    expect(dataAccess).toContain('resolveSysBOUIListView(targetUIMetadata).metadata');
    expect(dataAccess).toContain('resolvedListMetadata?.visibleFields');
    expect(dataAccess).toContain('fieldKeys: selectorFieldKeys');
  });

  it('keeps list and related-collection reference hydration demand-driven', async () => {
    const renderer = await source('src/routes/sysbo/list/renderer.ts');
    const parentList = await source('src/routes/sysbo/list/parent-list.ts');
    const collections = await source('src/routes/sysbo/related/collections.ts');

    const listResource = await source('src/routes/sysbo/shared/list-resource.ts');

    expect(renderer).toContain('sysBOListReferenceData(');
    expect(parentList).toContain('sysBOListReferenceData(');
    expect(listResource).toContain('entryUsesRelations ? {} : { fieldKeys }');
    expect(collections).toContain('fieldKeys: referenceFieldKeys');
    expect(collections).toContain('selectionOnly: readOnlyPresentation');
    expect(collections).toContain('selectedIdsByField');
  });

  it('hydrates independent reference catalogues concurrently within one request', async () => {
    const dataAccess = await source('src/routes/sysbo/shared/data-access.ts');

    expect(dataAccess).toContain('await Promise.all(');
    expect(dataAccess).toContain(
      'Object.keys(definition.boMetadata.fieldDefinition).map(async (fieldKey) =>',
    );
    expect(dataAccess).toContain('const endpoint = referenceEndpoint(definition, fieldKey);');
    expect(dataAccess).toContain('memoizeRequest(');
  });

  it('logs direct-host opening measurements through the UI runtime telemetry transport', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    const debugRoutes = await source('src/routes/debug/index.ts');

    expect(popup).toContain("type: 'entry-opening-measurement'");
    expect(popup).toContain("fetch('/bo/debug/ui-runtime/entry-opening-measurement'");
    expect(popup).toContain('measurement: latest');
    expect(debugRoutes).toContain("router.post('/ui-runtime/entry-opening-measurement'");
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
