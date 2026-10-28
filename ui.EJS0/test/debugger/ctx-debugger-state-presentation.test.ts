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

const ctxFindRuntimeSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/ctx-find-runtime.js'),
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

const ctxPropertiesSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/ctx-properties.js'),
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

const ctxPathFormatSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/ctx-path-format.js'),
  'utf8',
);

const shellViewSource = readFileSync(resolve(process.cwd(), 'views/layout/shell.ejs'), 'utf8');
const popupRuntimeSource = readFileSync(
  resolve(process.cwd(), 'public/js/popups/popup-runtime.js'),
  'utf8',
);
const hierarchyWorkspaceSource = readFileSync(
  resolve(process.cwd(), 'public/js/sysbo/hierarchy/hierarchy-workspace.js'),
  'utf8',
);
const domIdentitySource = readFileSync(
  resolve(process.cwd(), 'src/browser/ui-dom-identity.ts'),
  'utf8',
);

const developerToolsViewSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/developer-tools.ejs'),
  'utf8',
);

const ctxDebugViewSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/ctx-debug.ejs'),
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
  it('uses a toggleable second-row CTX finder with previous/next, key/value, wildcard and regex modes', () => {
    expect(developerToolsViewSource).toContain("include('ctx-debug')");
    expect(ctxDebugViewSource).toContain('id="ctxDebugFindBox"');
    expect(ctxDebugViewSource).toContain('id="ctxDebugFindPrevious"');
    expect(ctxDebugViewSource).toContain('id="ctxDebugFindNext"');
    expect(ctxDebugViewSource).toContain('<option value="key">By key</option>');
    expect(ctxDebugViewSource).toContain('<option value="value">By value</option>');
    expect(ctxDebugViewSource).toContain('<option value="wildcard">Wildcard</option>');
    expect(ctxDebugViewSource).toContain('<option value="regex">RegExpr</option>');
    expect(ctxFindRuntimeSource).toContain("document.getElementById('ctxDebugFindSyntax')");
    expect(ctxFindRuntimeSource).toContain('const wildcardPattern = (term) =>');
    expect(ctxFindRuntimeSource).toContain('const searchableValue = (value) =>');
    expect(ctxFindRuntimeSource).toContain("const mode = findMode?.value || 'key'");
    expect(ctxFindRuntimeSource).toContain('const findMatch = (rawTerm, direction = 1) =>');
    expect(ctxFindRuntimeSource).toContain('event.shiftKey ? -1 : 1');
    expect(ctxFindRuntimeSource).toContain("new RegExp(term, 'i')");
    expect(debuggerSource).toContain('createCtxFindRuntime({');
    expect(debuggerSource).not.toContain('const findMatch = (rawTerm, direction = 1) =>');
    expect(shellViewSource).toContain('/js/debugger/ctx-find-runtime.js');
    expect(shellViewSource.indexOf('/js/debugger/ctx-find-runtime.js')).toBeLessThan(
      shellViewSource.indexOf('/js/debugger/ctx-debug.js'),
    );
    expect(debuggerCssSource).toContain('.ctx-debug-find-row');
    expect(debuggerCssSource).toContain('1.15rem 1.15rem 4.35rem 4.85rem');
    expect(debuggerCssSource).toContain('.ctx-debug-find-row > .debug-tool-button');
    expect(debuggerCssSource).toContain('padding-right: 1.15rem');
  });
  it('observes CTX through the canonical runtime path resolver instead of duplicating path semantics', () => {
    expect(debuggerSource).toContain('const getExact = (path) => runtime.get(path)');
    expect(debuggerSource).not.toContain('function getExact(path)');
    expect(debuggerSource).not.toContain('function tokenize(path)');
    expect(debuggerSource).not.toContain('const resolveMember = (container, member) =>');
    expect(debuggerSource).toContain(
      'Current lexical resolver contract used by the expression runtime',
    );
    expect(debuggerSource).not.toContain('future expression evaluator');
  });

  it('resolves #layout DOM identity inside the canonical mounted UiLevel root', () => {
    expect(debuggerSource).toContain('const highlightIsEligible =');
    expect(debuggerSource).toContain(
      'const currentLevel = window.ManatOS?.uiRuntimeV2?.currentLevel?.();',
    );
    expect(debuggerSource).not.toContain('const deepestUiLevelPath = () =>');
    expect(debuggerSource).toContain('currentLevel !== owner.typedLevel');
    expect(debuggerSource).toContain('tabContentIsActive');
    expect(debuggerSource).toContain('root.querySelectorAll(domSelector)');
    expect(debuggerSource).toContain(
      'const minimumDepth = Math.min(...visible.map(depthFromRoot));',
    );
    expect(debuggerSource).toContain('const domSelector = descriptor.properties?.domSelector');
    expect(debuggerSource).toContain('highlightLayoutNode(domSelector, rendererRef, path)');
    expect(debuggerSource).toContain("const layoutMarker = '.layout';");
    expect(debuggerSource).toContain("runtime.describe?.(ownerPath)?.kind !== 'ui-level'");
    expect(debuggerSource).toContain('const uiLevelRoots = (owner) =>');
    expect(debuggerSource).toContain('data-ui-level-id');
    expect(debuggerSource).toContain('owner.domId');
    expect(popupRuntimeSource).toContain("modal.setAttribute('data-ui-level-root', '')");
    expect(popupRuntimeSource).toContain('modal.dataset.ctxScopePath = handle.path');
    expect(popupRuntimeSource).toContain("modal.removeAttribute('data-ui-level-root')");
    expect(popupRuntimeSource).toContain('delete modal.dataset.ctxScopePath');
    expect(hierarchyWorkspaceSource).toContain("pageRoot.setAttribute('data-ui-level-root', '')");
    expect(hierarchyWorkspaceSource).toContain('workspace.dataset.ctxScopePath = pagePath');
    expect(debuggerSource).toContain('const rendererElementBelongsToRoot =');
    expect(debuggerSource).toContain("element.closest('[data-ui-level-root]') === root");
    expect(debuggerSource).not.toContain("element.closest('[data-ctx-scope-path]')");
    expect(debuggerSource).not.toContain("if (host === 'page') return document;");
    expect(debuggerSource).toContain('let layoutHighlightSuppressed = false;');
    expect(debuggerSource).toContain("window.addEventListener('manatos:ui-surface-rendered'");
    expect(debuggerSource).toContain('layoutHighlightSuppressed = true;');
    expect(debuggerSource).toContain(
      'const viewerVisible = treeElement.getClientRects().length > 0;',
    );
    expect(debuggerSource).toContain('revealOpenedUiLevel(surfacePath);');
    expect(domIdentitySource).toContain("new CustomEvent('manatos:ui-surface-mounted'");
    expect(debuggerSource).toContain(
      "window.addEventListener('manatos:ui-surface-mounted', revealMountedSurface)",
    );
    expect(debuggerSource).toContain("window.addEventListener('manatos:ui-level-disposing', () =>");
    expect(debuggerSource).toContain('expandAncestors(path);');
    expect(debuggerSource).toContain('state.expanded.add(path);');
    expect(debuggerSource).toContain(
      'if (!layoutHighlightSuppressed && state.selected && pathExists(state.selected))',
    );
  });

  it('surfaces active CTX aliases without inventing removed initialization semantics', () => {
    expect(debuggerSource).not.toContain("initialization: 'bi-hourglass-split'");
    expect(debuggerSource).toContain('const activeEntryAliasTargets = () =>');
    expect(debuggerSource).toContain("[levelPath, ['#level']]");
    expect(debuggerSource).toContain("[entityPath, ['$entity', '$level-entity']]");
    expect(debuggerSource).toContain("[fieldsPath, ['$entity-fields', '$level-entity-fields']]");
    expect(debuggerSource).toContain("[entryCurrentPath, ['$entry-current']]");
    expect(debuggerSource).not.toContain('initializationCurrentPath');
    expect(debuggerSource).toContain(
      "{ label: 'Aliases', value: aliasesForCtxPath(info.path).join(', ') }",
    );
    expect(debuggerSource).toContain('pathPresentation?.display?.(path)');
    expect(debuggerSource).not.toContain("['Path', displayCtxPath(info.path)]");
    expect(targetViewsSource).toContain('pathPresentation?.display?.(path)');
    expect(targetViewsSource).not.toContain("['Path', shownSelectionPath]");
    expect(targetViewsSource).toContain('pathPresentation?.render?.(view.rootPath, view.path)');
    expect(targetViewsSource).toContain('displayCtxPath(view.path)');
    expect(targetViewsSource).toContain('displayCtxPath(view.selected)');
    expect(debuggerSource).toContain("key: '$ (ctx)'");
    expect(targetViewsSource).toContain("view.path === 'ctx' ? '$ (ctx)'");
    expect(ctxPropertiesSource).toContain("document.createElement('span')");
    expect(ctxPropertiesSource).toContain('subscriber.match');
    expect(ctxPropertiesSource).toContain('subscriber.paths.map(displayCtxPath)');
    expect(ctxPropertiesSource).toContain('count > 0 ?');
    expect(ctxPropertiesSource).toContain('item.title = [');
    expect(ctxPropertiesSource).toContain(
      "`Path${subscriber.paths.length === 1 ? '' : 's'}: ${rawPaths}`",
    );
    expect(ctxPropertiesSource).not.toContain("const paths = document.createElement('div')");
  });

  it('shows company above system at the CTX root without mutating CTX semantics', () => {
    expect(debuggerSource).toContain(
      "preferredOrder(['company', 'system', 'enums', 'entities', 'user', 'ui'])",
    );
    expect(sourceWithoutWhitespace(debuggerSource)).toContain(
      sourceWithoutWhitespace("const presentedEntries = path === 'ctx'"),
    );
    expect(debuggerSource).toContain('return presentedEntries.map');
  });

  it('keeps a canonical V2 ctx.ui root surface on every rendered page without server topology authorship', () => {
    expect(pageContextSource).not.toContain('projectGenericPageUi(req.path)');
    expect(pageContextSource).toContain('browser V2 host owns runtime UI topology');
    expect(uiHostSource).toContain('const staticPage = () =>');
    expect(uiHostSource).toContain("host: 'page'");
    expect(uiHostSource).toContain("kind: 'static'");
    expect(uiHostSource).toContain("mode: 'view'");
  });

  it('uses one semantic UI-level badge presenter in the main and targeted CTX trees', () => {
    expect(debuggerSource).toContain('const appendUiLevelBadge = (row, path, value) =>');
    expect(debuggerSource).toContain("runtime.describe?.(path)?.kind !== 'ui-level'");
    expect(debuggerSource).toContain("badge.className = 'ctx-debug-ui-level-badge'");
    expect(debuggerSource).toContain('ctxUiLevelPresentation = Object.freeze');
    expect(debuggerSource).toContain('appendUiLevelBadge(row, path, value)');
    expect(targetViewsSource).toContain(
      'const uiLevelPresentation = window.ManatOS?.debug?.ctxUiLevelPresentation;',
    );
    expect(targetViewsSource).toContain('uiLevelPresentation?.appendBadge?.(row, path, value)');
    expect(targetViewsSource).not.toContain('const isUiSurfaceLevel = (value)');
    expect(debuggerCssSource).toContain('.ctx-debug-ui-level-badge');
    expect(debuggerSource).toContain('control.entityKey || control.name || control.kind');
  });

  it('keeps Properties visibility independent from node selection/history navigation', () => {
    const selectStart = debuggerSource.indexOf('const selectPath =');
    const selectEnd = debuggerSource.indexOf('const allRealNodePaths =', selectStart);
    const selectSource = debuggerSource.slice(selectStart, selectEnd);

    expect(selectSource).toContain('syncPropertiesPresentation()');
    expect(selectSource).not.toContain('state.propertiesOpen = true');
    expect(debuggerSource).toContain(
      "selectionPathElement?.classList.toggle('d-none', state.propertiesOpen)",
    );

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
    expect(expressionFormatSource).toContain('window.ManatOS.debug.expression');
    expect(expressionFormatSource).toContain("emit(identifier, 'path')");
    expect(debuggerSource).toContain('const isExpressionSourcePath = (path)');
    expect(debuggerSource).not.toContain('const isCompiledExpression = (value)');
    expect(debuggerSource).not.toContain('compiled-expression');
    expect(debuggerSource).not.toContain('value.requiredCapabilities');
    expect(debuggerSource).not.toContain('info.value?.ast');
    expect(debuggerSource).not.toContain('renderAst(');
    expect(debuggerSource).not.toContain('ctx-debug-ast-');
    expect(targetViewsSource).not.toContain("key === 'ast'");
    expect(themeSource).not.toContain('.ctx-debug-ast-');
    expect(debuggerSource).toContain('formula: isExpressionSourcePath(info.path)');
    expect(debuggerSource).toContain(
      "{ label: 'Expression', value: expressionSource, formula: true }",
    );
    expect(ctxPropertiesSource).toContain("if (row.formula && typeof row.value === 'string'");
    expect(sourceWithoutWhitespace(debuggerSource)).toContain(
      sourceWithoutWhitespace("typeof value === 'string' && isExpressionSourcePath(path)"),
    );
    expect(debuggerSource).toContain('window.ManatOS?.debug?.expression.highlightElement');
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
    expect(detachedToolsSource).toContain(
      'window.ManatOS.debug.developerToolsHost = Object.freeze',
    );
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
    expect(debuggerSource).toContain("getElementById('ctxDebugCopyText')");
    expect(debuggerSource).toContain(
      'const copyNodeAsJsonText = async (name, value, anchor = null) =>',
    );
    expect(debuggerSource).toContain(
      'window.ManatOS.debug.copyCtxNodeAsJsonText = copyNodeAsJsonText',
    );
    expect(ctxDebugViewSource).toContain('Copy selected node as JSON text.');
    expect(ctxDebugViewSource).toContain('bi bi-copy');
    expect(targetViewsSource).toContain('Copy selected node as JSON text.');
    expect(targetViewsSource).toContain('bi bi-copy');
    expect(targetViewsSource).toContain('copyCtxNodeAsJsonText?.(');
    expect(debuggerSource).toContain('JSON.stringify({ [nodeName]: value }, null, 2)');
    expect(debuggerSource).toContain('Node ${nodeName} successfully copied in clipboard.');
    expect(targetViewsSource).not.toContain('ctx-target-view-copy-path');
    expect(targetViewsSource).not.toContain('Copy selected CTX subtree as JSON text');
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
    expect(fieldToolsSource).toContain("metadataText('@CM.FieldToolInspect')");
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
    expect(metadataDebuggingModelSource).toContain(
      '`${entryContextPath}.data.fields.${fieldKey}.value`',
    );
    expect(metadataEntrySource).toContain('entryContextPath: v2LevelPath');
    expect(metadataDebuggingModelSource).toContain('definitionPath');
    expect(metadataDebuggingModelSource).toContain('valuePath');
    expect(debuggingPanelSource).toContain(
      'const hasInspectionActions = Boolean(debugRow.definitionPath || debugRow.valuePath)',
    );
    expect(debuggingPanelSource).toContain('<% if (hasInspectionActions) { %>');
  });

  it('keeps the main CTX viewer selection non-duplicated and separates subscriber properties', async () => {
    const template = ctxDebugViewSource;
    const runtime = debuggerSource;
    expect(template).not.toContain('id="ctxDebugSelection"');
    expect(template).toContain('id="ctxDebugSelectionPath"');
    expect(runtime).toContain('pathPresentation?.render?.(selectionPathElement, state.selected)');
    expect(template).toContain('data-properties-tab="main"');
    expect(template).toContain('data-properties-tab="properties"');
    expect(template).toContain('data-properties-tab="attributes"');
    expect(template).toContain('data-properties-tab="subscribers"');
    expect(runtime).toContain('ctxProperties?.render');
    expect(targetViewsSource).toContain('ctxProperties?.render');
    expect(targetViewsSource).toContain('data-properties-tab="properties"');
    expect(targetViewsSource).toContain('data-properties-tab="attributes"');
    expect(targetViewsSource).toContain('data-properties-tab="subscribers"');
    expect(ctxPropertiesSource).toContain("activeTab === 'properties'");
    expect(ctxPropertiesSource).toContain('renderNodeProperties');
    expect(ctxPropertiesSource).toContain("activeTab === 'attributes'");
    expect(ctxPropertiesSource).toContain("activeTab === 'subscribers'");
    expect(ctxPropertiesSource).toContain("list.className = 'ctx-debug-subscriber-list'");
    expect(ctxPropertiesSource).toContain("button.classList.toggle('has-registrations'");
    expect(ctxPropertiesSource).toContain('debug.expression.highlightElement');
    expect(runtime).toContain('pathPresentation?.render?.(propertiesTitle, info.path)');
  });
  it('uses one shared compact CTX path caption renderer for main and rooted views', () => {
    expect(ctxPathFormatSource).toContain("aliasPath(canonical, levelPath, '$level')");
    expect(ctxPathFormatSource).toContain("['ctx.ui', '$ui']");
    expect(ctxPathFormatSource).toContain('const render = (element, path) =>');
    expect(ctxPathFormatSource).toContain(
      'element.replaceChildren(document.createTextNode(shown.prefix), strong)',
    );
    expect(debuggerSource).toContain('window.ManatOS?.debug?.ctxPath');
    expect(debuggerSource).toContain(
      'pathPresentation?.render?.(selectionPathElement, state.selected)',
    );
    expect(debuggerSource).toContain('pathPresentation?.render?.(propertiesTitle, info.path)');
    expect(targetViewsSource).toContain('window.ManatOS?.debug?.ctxPath');
    expect(targetViewsSource).toContain('pathPresentation?.render?.(view.rootPath, view.path)');
    expect(targetViewsSource).toContain(
      'pathPresentation?.render?.(view.propertiesTitle, view.selected)',
    );
  });
  it('presents inspection layout immediately after control for every UI level', () => {
    expect(debuggerSource).toContain("const isUiLevel = path.startsWith('ctx.ui.level')");
    expect(sourceWithoutWhitespace(debuggerSource)).toContain(
      "isUiLevel?preferredOrder(['control','layout','data','state']):entries",
    );
  });
  it('addresses arbitrary CTX object keys with canonical bracket syntax', () => {
    expect(debuggerSource).toContain('const appendCtxPath = (path, key) =>');
    expect(debuggerSource).toContain('path: appendCtxPath(path, key)');
    expect(debuggerSource).not.toContain('path: `${path}.${key}`');
  });
});
