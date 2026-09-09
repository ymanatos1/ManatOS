import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from '../support/source-contract.js';

const debuggerSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/ctx-debug.js'),
  'utf8',
);

const debuggerCssSource = readFileSync(
  resolve(process.cwd(), 'public/css/debugger/ctx-debug.css'),
  'utf8',
);

const pageContextSource = readFileSync(
  resolve(process.cwd(), 'src/middleware/page-context.ts'),
  'utf8',
);

const shellSource = readFileSync(resolve(process.cwd(), 'public/js/shell/shell.js'), 'utf8');

const detachedToolsSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/detached-tools.js'),
  'utf8',
);

const targetViewsSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/ctx-target-views.js'),
  'utf8',
);

const uiHostSource = readFileSync(
  resolve(process.cwd(), 'public/js/runtime/ui-host-runtime.js'),
  'utf8',
);

const themeSource = readFileSync(resolve(process.cwd(), 'public/css/theme.css'), 'utf8');

const expressionFormatSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/expression-format.js'),
  'utf8',
);

const shellViewSource = readFileSync(resolve(process.cwd(), 'views/layout/shell.ejs'), 'utf8');

const developerToolsViewSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/developer-tools.ejs'),
  'utf8',
);

const horizontalNavSource = readFileSync(
  resolve(process.cwd(), 'views/components/navigation/horizontal-nav.ejs'),
  'utf8',
);

const debuggingPanelSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/debugging-panel.ejs'),
  'utf8',
);

const metadataEntrySource = readFileSync(
  resolve(process.cwd(), 'views/components/runtime/entity-entry.ejs'),
  'utf8',
);

const metadataDebuggingModelSource = readFileSync(
  resolve(process.cwd(), 'src/presentation/metadata/debugging-model.ts'),
  'utf8',
);

const fieldRuntimeSource = readFileSync(
  resolve(process.cwd(), 'public/js/sysbo/entry/field-runtime.js'),
  'utf8',
);

const fieldToolsSource = readFileSync(
  resolve(process.cwd(), 'views/components/sysbo/entry/fields/field-tools-menu.ejs'),
  'utf8',
);

describe('CTX debugger presentation state', () => {
  it('shows company above system at the CTX root without mutating CTX semantics', () => {
    expect(debuggerSource).toContain(
      "const preferred = ['company', 'system', 'entities', 'user', 'ui']",
    );
    expect(sourceWithoutWhitespace(debuggerSource)).toContain(
      sourceWithoutWhitespace("const presentedEntries = path === 'ctx'"),
    );
    expect(debuggerSource).toContain('return presentedEntries.map');
  });

  it('keeps a canonical V2 ctx.ui root surface on every rendered page without server topology authorship', () => {
    expect(pageContextSource).not.toContain('projectGenericPageUi(req.path)');
    expect(pageContextSource).not.toContain('new SurfaceRuntime()');
    expect(pageContextSource).toContain('browser V2 host owns runtime UI topology');
    expect(uiHostSource).toContain('const staticPage = () =>');
    expect(uiHostSource).toContain("host: 'page'");
    expect(uiHostSource).toContain("kind: 'static'");
    expect(uiHostSource).toContain("mode: 'view'");
  });

  it('recognizes V2 UI levels by contract and presents them with debugger badges', () => {
    expect(debuggerSource).toContain('const isUiSurfaceLevel = (value)');
    expect(debuggerSource).toContain('UI_SURFACE_HOSTS.has(value.host)');
    expect(debuggerSource).toContain("badge.className = 'ctx-debug-ui-level-badge'");
    expect(debuggerSource).toContain("['UI level', uiSurfaceBadgeText(info.value)]");
    expect(debuggerCssSource).toContain('.ctx-debug-ui-level-badge');
  });

  it('keeps Properties visibility independent from node selection/history navigation', () => {
    const selectStart = debuggerSource.indexOf('const selectPath =');
    const selectEnd = debuggerSource.indexOf('const allRealNodePaths =', selectStart);
    const selectSource = debuggerSource.slice(selectStart, selectEnd);

    expect(selectSource).toContain("classList.toggle('d-none', !state.propertiesOpen)");
    expect(selectSource).not.toContain('state.propertiesOpen = true');

    // Tree expand/collapse must not override the same preference either.
    const renderNodeStart = debuggerSource.indexOf('const renderNode =');
    const renderNodeEnd = debuggerSource.indexOf('const render =', renderNodeStart);
    const renderNodeSource = debuggerSource.slice(renderNodeStart, renderNodeEnd);
    expect(renderNodeSource).not.toContain('state.propertiesOpen = true');
  });
  it('collects repeated CTX diagnostics into one panel and keeps the debug icon borderless', () => {
    expect(shellSource).toContain("panel.id = 'debugDiagnosticPanel'");
    expect(shellSource).toContain('const diagnosticEntries = new Map()');
    expect(shellSource).toContain('existing.count += 1');
    expect(shellSource).not.toContain("container.id = 'debugDiagnosticToasts'");

    const debugToggleStart = themeSource.indexOf('.horizontal-debug-menu-toggle {');
    const debugToggleEnd = themeSource.indexOf('}', debugToggleStart);
    const debugToggleRule = themeSource.slice(debugToggleStart, debugToggleEnd);
    expect(debugToggleRule).toContain('border: 0 !important');
    expect(debugToggleRule).toContain('background: transparent !important');
  });

  it('uses one shared lexical highlighter for entry-form and CTX expressions', () => {
    expect(expressionFormatSource).toContain('window.ManatOSDebugExpression');
    expect(expressionFormatSource).toContain("emit(identifier, 'path')");
    expect(debuggerSource).toContain('const isExpressionSourcePath = (path)');
    expect(debuggerSource).toContain('const isCompiledExpression = (value)');
    expect(debuggerSource).toContain("compiledExpression ? 'compiled-expression'");
    expect(debuggerSource).toContain("path.endsWith('.source')");
    expect(debuggerSource).toContain('highlightElement(formulaElement, value.source)');
    expect(debuggerSource).toContain(
      "label === 'Expression' || (label === 'Value' && isExpressionSourcePath(info.path))",
    );
    expect(sourceWithoutWhitespace(debuggerSource)).toContain(
      sourceWithoutWhitespace("typeof value === 'string' && isExpressionSourcePath(path)"),
    );
    expect(debuggerSource).toContain('window.ManatOSDebugExpression.highlightElement');
    expect(shellViewSource).toContain('/js/debugger/expression-format.js');
    expect(shellViewSource.indexOf('/js/debugger/expression-format.js')).toBeLessThan(
      shellViewSource.indexOf('/js/debugger/ctx-debug.js'),
    );
  });

  it('moves focus outside the unified developer dock before hiding it and uses inert for inactive tabs', () => {
    expect(developerToolsViewSource).toContain('inert');
    expect(shellSource).toContain('developerToolsDock.contains(active)');
    expect(shellSource).toContain('fallback.focus({ preventScroll: true })');
    expect(shellSource).toContain('developerToolsDock.inert = true');
    expect(shellSource).toContain("developerToolsDock.setAttribute('aria-hidden', 'true')");
    expect(shellSource.indexOf('fallback.focus({ preventScroll: true })')).toBeLessThan(
      shellSource.indexOf("developerToolsDock.setAttribute('aria-hidden', 'true')"),
    );
    expect(shellSource).toContain("querySelectorAll('[data-developer-tool-panel]')");
    expect(shellSource).toContain('panel.inert = !active');
    expect(shellSource).toContain("querySelectorAll('[data-developer-tool-tab]')");
  });

  it('moves one Developer Tools dock into a navigation-stable secondary window', () => {
    expect(developerToolsViewSource).toContain('id="detachDeveloperToolsDock"');
    expect(shellViewSource).toContain('/js/debugger/detached-tools.js');
    expect(detachedToolsSource).toContain('window.open(');
    expect(detachedToolsSource).toContain("'manatosDeveloperTools'");
    expect(detachedToolsSource).toContain('popup.document.body.appendChild(dock)');
    expect(detachedToolsSource).toContain('originalParent.insertBefore(dock, originalNextSibling)');
    expect(detachedToolsSource).toContain('manatos.debug.developerDock.detached.v2');
    expect(detachedToolsSource).toContain('manatos.debug.developerDock.geometry.v2');
    expect(detachedToolsSource).toContain('persistDetachedGeometry');
    expect(detachedToolsSource).toContain('installReconnectBridge');
    expect(detachedToolsSource).toContain('adoptDetachedWindow');
    expect(detachedToolsSource).toContain("popup.addEventListener('pagehide'");
    expect(detachedToolsSource).toContain('if (!restoring && !mainNavigating) restoreDock()');
    expect(detachedToolsSource).toContain('mainNavigating = true');
    expect(detachedToolsSource).not.toContain('detachedWindow.close();');
    expect(detachedToolsSource).toContain('window.ManatOSDeveloperToolsHost = Object.freeze');
    expect(detachedToolsSource).toContain('manatos:developer-tools-visibility-changed');
    expect(detachedToolsSource).toContain('restoreDock({ preserveDetachedRequest: true })');
    expect(detachedToolsSource).not.toContain('toggleButton?.addEventListener(');
    expect(shellSource).toContain("developerToolsDock?.classList.contains('d-none') === false");
    expect(shellSource).toContain('developerToolsDock.ownerDocument === document');
    expect(detachedToolsSource).not.toContain('dock.cloneNode');
  });

  it('opens selected CTX nodes as live targeted subtree tabs inside the same Developer Tools dock', () => {
    expect(debuggingPanelSource).toBeDefined();
    expect(developerToolsViewSource).toContain('id="developerToolsCtxViewTabAnchor"');
    expect(shellViewSource).toContain('/js/debugger/ctx-target-views.js');
    expect(debuggerSource).toContain("getElementById('ctxDebugOpenView')");
    expect(debuggerSource).toContain('manatos:ctx-target-view-open');
    expect(targetViewsSource).toContain("const STATE_KEY = 'manatos.debug.ctx.targetViews.v2'");
    expect(targetViewsSource).toContain("const ORDER_KEY = 'manatos.debug.toolTabs.order.v2'");
    expect(targetViewsSource).toContain('const tabKey = `ctxView:${viewId}`');
    expect(targetViewsSource).toContain("const title = `'${nodeNameFromPath(path)}' view`");
    expect(targetViewsSource).toContain('panel.dataset.developerToolPanel = tabKey');
    expect(targetViewsSource).toContain('window.addEventListener(CHANGE_EVENT');
    expect(targetViewsSource).toContain('createView({ path, sourceTab');
    expect(targetViewsSource).toContain('sourceItem?.nextElementSibling');
    expect(targetViewsSource).toContain('Variable not found in CTX');
    expect(targetViewsSource).toContain('ctx-target-view-properties-panel');
    expect(targetViewsSource).toContain('persistOrder');
    expect(targetViewsSource).toContain('draggable = true');
    expect(targetViewsSource).toContain('scrollAnchorPath');
    expect(targetViewsSource).toContain('restoreScrollState');
    expect(targetViewsSource).toContain('developerToolsTabOverflowToggle');
    expect(targetViewsSource).toContain('renderOverflowMenu');
    expect(targetViewsSource).toContain('refreshOverflowAffordance');
    expect(developerToolsViewSource).toContain('id="developerToolsTabOverflowToggle"');
    expect(developerToolsViewSource).toContain('id="developerToolsTabOverflowMenu"');
    expect(debuggerCssSource).toContain('flex: 0 0 auto;');
    expect(debuggerCssSource).toContain('max-width: 14rem;');
    expect(debuggerCssSource).toContain('.developer-tools-target-tab {');
    expect(debuggerCssSource).toContain('max-width: none;');
    expect(debuggerCssSource).toContain('min-width: 7.25rem;');
    expect(debuggerCssSource).toContain('min-width: 6.25rem;');
    expect(debuggerCssSource).toContain('padding-right: 1.75rem;');
    expect(debuggerCssSource).toContain('right: 0.2rem;');
    expect(debuggerCssSource).toContain('transform: translateY(-50%);');
    expect(debuggerSource).toContain('scrollAnchorPath');
    expect(debuggerSource).toContain('restoreScrollState');
    expect(targetViewsSource).toContain('runtime.get(path)');
    expect(targetViewsSource).not.toContain('structuredClone');
    expect(targetViewsSource).not.toContain('JSON.parse(JSON.stringify(runtime.value))');
    expect(shellSource).toContain("value.startsWith('ctxView:')");
    expect(shellSource).toContain('manatos:developer-tool-tab-select');
  });

  it('keeps CTX inspection developer-only and reveals the viewer before selecting a field', () => {
    expect(horizontalNavSource).toContain('app.ui?.debugTools');
    expect(shellViewSource).toContain('app.ui?.debugTools');
    expect(fieldToolsSource).toContain('showDeveloperTools');
    expect(fieldToolsSource).toContain('Inspect in CTX Viewer');
    expect(fieldRuntimeSource).toContain('manatos:ctx-viewer-show');
    expect(fieldRuntimeSource.indexOf('manatos:ctx-viewer-show')).toBeLessThan(
      fieldRuntimeSource.indexOf('manatos:ctx-viewer-select'),
    );
    expect(shellSource).toContain("window.addEventListener('manatos:ctx-viewer-show'");
    expect(shellSource).toContain('shellState.setDebugVisible(true)');
    expect(fieldRuntimeSource).toContain('expand: true');
    expect(debuggerSource).toContain('expandSelected = false');
    expect(debuggerSource).toContain('state.expanded.add(path)');
    expect(debuggerSource).toContain('revealExpandedSelectionRange');
    expect(debuggerSource).toContain("lastRow.scrollIntoView({ block: 'end'");
    expect(debuggerSource).toContain("ensureSelectedVisible({ align: 'start' })");
  });

  it('separates formula-definition inspection from the live calculated record value', () => {
    expect(debuggingPanelSource).toContain('Inspect formula in CTX Viewer');
    expect(debuggingPanelSource).toContain('Inspect current value in CTX Viewer');
    expect(debuggingPanelSource).toContain('data-debug-inspect-kind="formula"');
    expect(debuggingPanelSource).toContain('data-debug-inspect-kind="value"');
    expect(debuggingPanelSource).not.toContain("debugRow.inspectPath || 'ctx.page.page'");
    expect(metadataEntrySource).toContain('buildMetadataDebuggingModel({');
    expect(metadataDebuggingModelSource).toContain("entryContextPath = 'ctx.ui.level'");
    expect(metadataDebuggingModelSource).toContain(
      '`ctx.entities.${compiledEntityContextName}.metadata.fieldDefinition.${fieldKey}.calculation.expression`',
    );
    expect(metadataDebuggingModelSource).toContain('`${entryContextPath}.entry.${fieldKey}`');
    expect(metadataEntrySource).toContain('entryContextPath: v2LevelPath');
    expect(metadataDebuggingModelSource).toContain('definitionPath');
    expect(metadataDebuggingModelSource).toContain('valuePath');
    expect(debuggingPanelSource).toContain(
      'const hasInspectionActions = Boolean(debugRow.definitionPath || debugRow.valuePath)',
    );
    expect(debuggingPanelSource).toContain('<% if (hasInspectionActions) { %>');
  });
});
