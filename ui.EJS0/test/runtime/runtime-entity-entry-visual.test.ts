import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('V2 EntityEntry visual runtime', () => {
  it('renders the generic entry scenario exclusively through the shared V2 component', async () => {
    const route = await source('src/routes/sysbo/entry/renderer.ts');
    const page = await source('views/pages/sysbo/entry.ejs');
    const component = await source('views/components/runtime/entity-entry.ejs');
    const saveSplitAction = await source(
      'views/components/sysbo/entry/shell/save-split-action.ejs',
    );

    expect(route).not.toContain('enableV2Scenario');
    expect(route).toContain("'pages/sysbo/entry'");
    expect(page).toContain('components/runtime/entity-entry');
    expect(page).toContain('components/page/entry-page');
    expect(page).toContain("entryContentPartial: '../runtime/entity-entry'");
    expect(component).toContain('data-v2-entity-entry');
    expect(component).toContain('data-v2-field-container');
    expect(component).not.toContain('v2Surface');
    expect(component).not.toContain('data-v2-surface-id');
    expect(component).toContain("include('../sysbo/entry/shell/save-split-action'");
    expect(saveSplitAction).toContain('data-form-save');
    expect(component).toContain('data-form-close-cancel-label');
    expect(component).toContain(
      "const isEntryPopupHost = typeof entryPopupHost !== 'undefined' && entryPopupHost",
    );
    expect(component).toContain('<% if (isEntryPopupHost) { %>');
    expect(component).toContain("<%= compactEntryDensity ? 'Cancel' : 'Close' %>");
    expect(component).toContain('const v2DeleteAction = isViewMode');
    expect(component).toContain('const v2CommandActions = isViewMode');
  });

  it('initializes V2 from authoritative server values instead of the legacy ctx.page field projection', async () => {
    const route = await source('src/routes/sysbo/entry/renderer.ts');
    expect(route).toContain('buildEntryInitializationSeed');
    expect(route).toContain('const v2ServerValues = v2InitializationSeed.fields');
    expect(route).not.toContain('v2Entry.initialize({ server: v2ServerValues })');
    expect(route).toContain("purpose: surface.purpose ?? 'open-entity-entry'");
    expect(route).toContain('current: v2ServerValues');
    expect(route).toContain('const v2RuntimeFacts = v2InitializationSeed.facts');
    expect(route).toContain('facts: { ...v2RuntimeFacts, permissions: effectivePermissions }');
    expect(route).not.toContain('original: legacyOriginalValues');
    expect(route).not.toContain('current: legacyFieldValues');
  });

  it('preserves readonly tab cues, reusable metadata components and V2 calculation debugging', async () => {
    const component = await source('views/components/runtime/entity-entry.ejs');
    const sharedComponentHost = await source(
      'views/components/sysbo/entry/shell/metadata-component.ejs',
    );

    expect(component).toContain('entity-readonly-tab');
    expect(component).toContain('data-readonly-tab');
    expect(component).toContain('buildMetadataDebuggingModel');
    expect(component).toContain("typeof v2Bootstrap?.levelPath === 'string'");
    expect(component).not.toContain('ctx.ui.level.level.level');
    expect(component).toContain('uiDebuggingDisplayRows');
    expect(component).toContain("include('../sysbo/entry/content/summary'");
    expect(component).toContain('metadataUI,');
    expect(component).not.toContain('compiledUIRecord,');
    expect(component).not.toContain('compileUIExpression');
    expect(component).toContain("include('../sysbo/entry/shell/metadata-component'");
    expect(component).toContain("tab.layout === 'component' && tab.component");
    expect(component).toContain("content.kind === 'component' && content.component?.key");
    expect(sharedComponentHost).toContain('data-metadata-component');
    expect(sharedComponentHost).toContain('data-metadata-component-binding-expressions');
    expect(sharedComponentHost).toContain('componentPartial');
    expect(component).toContain('componentBindingContractFor');
    expect(component).not.toContain("purpose: 'resolve metadata component binding'");
    expect(component).toContain(
      'entryFieldValuePath: (fieldKey) => `${v2LevelPath}.data.fields.${fieldKey}.value`',
    );
  });

  it('tracks V2 tab navigation directly in the active UI-level CTX', async () => {
    const component = await source('views/components/runtime/entity-entry.ejs');
    const tabNavigation = await source('views/components/sysbo/entry/shell/entry-tabs-nav.ejs');
    const commonMetadata = await source('../shared/src/metadata/ui/common.ts');
    const shell = await source('public/js/shell/shell.js');

    expect(component).not.toContain('v2EntryView');
    expect(component).toContain("const activeTabId = visibleTabs[0]?.id || ''");
    expect(tabNavigation).toContain('data-v2-tab-id');
    expect(commonMetadata).toContain("statePath: 'activeTabId'");
    expect(tabNavigation).toContain('data-navigation-track-path');
    expect(commonMetadata).toContain("statePath: 'activeInternalTabIds.debugging'");
    expect(shell).toContain("runtime.get('ctx.ui.level')");
    expect(shell).toContain("document.addEventListener('shown.bs.tab'");
    expect(shell).toContain('writeNormalNavigationToCtx(event.target)');
    expect(shell).not.toContain('data-ui-engine-migration');
    expect(shell).not.toContain("url.searchParams.set('uiEngine'");
  });

  it('keeps developer capability gating on the server but composes the V2 Debugging tab in the browser', async () => {
    const route = await source('src/routes/sysbo/entry/renderer.ts');
    const v2 = await source('views/components/runtime/entity-entry.ejs');
    const runtime = await source('public/js/sysbo/entry/entry-policy-runtime.js');

    expect(route).not.toContain('effectiveRecordTabs(');
    expect(route).not.toContain('developerMode');
    expect(v2).toContain('const debuggingTabEnabled = Boolean(app?.ui?.debugTools)');
    expect(v2).toContain('data-v2-developer-debugging-tab-template');
    expect(v2).toContain('data-v2-developer-debugging-nav');
    expect(v2).toContain('data-v2-developer-debugging-pane');
    expect(v2).not.toContain("tab.layout === 'debug-calculations'");
    expect(runtime).toContain('installDeveloperDebuggingTab');
    expect(runtime).toContain('nav.querySelector(\'[data-v2-tab-id="debugging"]\')');
    expect(runtime).toContain("content.querySelector('[data-v2-developer-debugging-pane]')");
  });
  it('propagates expression diagnostics to the host Debugging tab and owning CTX mirrors', async () => {
    const component = await source('views/components/runtime/entity-entry.ejs');
    const shell = await source('public/js/shell/shell.js');
    const css = await source('public/css/ui.css');

    expect(component).toContain('data-debugging-host-tab');
    expect(component).toContain('data-debugging-host-errors-count');
    expect(shell).toContain("tab.classList.toggle('debugging-host-errors-present', count > 0)");
    expect(shell).toContain('fieldOwnersForDiagnostic');
    expect(shell).toContain('ctx-expression-error-owner');
    expect(shell).toContain('data-ctx-expression-error-indicator');
    expect(css).toContain('[data-debugging-host-tab].debugging-host-errors-present');
    expect(css).toContain('.ctx-debug-row.ctx-expression-error-owner .ctx-debug-key');
  });

  it('uses the runtime option domain for V2 render/debug expression scope', async () => {
    const component = await source('views/components/runtime/entity-entry.ejs');

    // Debugging UI must inspect the same effective option domain that drove the
    // live V2 entry runtime. Otherwise a caller-restricted provider can render
    // correctly while inspection falsely evaluates FirstCtx()/field.option
    // against the unrestricted canonical enum catalogue.
    expect(component).toContain(
      'const runtimeOptions = Array.isArray(references[key]) ? references[key] : [];',
    );
    expect(component).toContain('const options = runtimeOptions.length');
    expect(component).toContain('...item,');
    expect(component).toContain(
      'option: options.find((item) => item?.value === valueFor(key)) ?? null',
    );
  });

  it('carries host-neutral invocation tokens in V2 so hosted Close uses the owning surface lifecycle', async () => {
    const component = await source('views/components/runtime/entity-entry.ejs');

    expect(component).toContain("typeof entryPopupHost !== 'undefined' && entryPopupHost");
    expect(component).toContain('name="_entryHost" value="popup"');
    expect(component).toContain('name="_entryToken"');
    expect(component).toContain("entryPopupToken || ''");
    expect(component).toContain(
      "const tabSurfaceToken = String(entryPopupToken || v2Bootstrap?.levelToken || v2Bootstrap?.token || 'page')",
    );
    expect(component).toContain('tabSurfaceToken,');
  });

  it('evaluates dynamic summary presentation in the browser-owned V2 entry scope', async () => {
    const summary = await source('views/components/sysbo/entry/content/summary.ejs');
    const runtime = await source('public/js/sysbo/entry/entry-policy-runtime.js');

    expect(summary).not.toContain('dynamicUIValue(');
    expect(summary).not.toContain('ctxExpressionValue(');
    expect(summary).toContain('data-v2-summary-tone-expression');
    expect(summary).toContain('data-v2-summary-icon-expression');
    expect(runtime).toContain('refreshSummaryPresentation');
    expect(runtime).toContain(
      'evaluateSourceOwnedAt(host.dataset.v2SummaryToneExpression, path, null)',
    );
    expect(runtime).toContain('const ast = await expressions.loadAstForSource(source);');
    expect(runtime).toContain('return expressions.evaluateAstOwnedAt(ast, ownerPath);');
  });
  it('never evaluates V2 UI expressions during SSR and emits authored source without per-element AST transport', async () => {
    const component = await source('views/components/runtime/entity-entry.ejs');
    const runtime = await source('public/js/sysbo/entry/form-runtime.js');

    expect(component).not.toContain('ctxExpressionValue(');
    expect(component).toContain('const contentSpanContractFor = (content, fallback) => {');
    expect(component).not.toContain('compileUIExpression(expression)?.ast ?? null');
    expect(component).toContain('data-ui-grid-span-expression');
    expect(component).toContain('data-ui-grid-span-fallback');
    expect(component).toContain("content.kind === 'spacer'");
    expect(runtime).toContain("kind: 'grid-span'");
    expect(runtime).toContain('await evaluateOwned(spanAst, null, evaluationPass)');
    expect(runtime).toContain(
      'const canonicalFieldDefinitions = entryEntity?.metadata?.fieldDefinition || {}',
    );
    expect(runtime).toContain("compileAttribute(container, 'data-ui-visible-expression')");
    expect(runtime).toContain("compileAttribute(container, 'data-ui-editable-expression')");
    expect(component).not.toContain('data-field-calculation-ast');
    expect(component).not.toContain('data-ui-visible-ast');
    expect(component).not.toContain('data-ui-editable-ast');
    expect(runtime).toContain('astForSource');
  });
});
