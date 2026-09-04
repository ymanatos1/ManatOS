import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const debuggerSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/ctx-debug.js'),
  'utf8',
);

const shellSource = readFileSync(
  resolve(process.cwd(), 'public/js/shell.js'),
  'utf8',
);

const themeSource = readFileSync(
  resolve(process.cwd(), 'public/css/theme.css'),
  'utf8',
);

const expressionFormatSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/expression-format.js'),
  'utf8',
);

const shellViewSource = readFileSync(
  resolve(process.cwd(), 'views/layout/shell.ejs'),
  'utf8',
);

const debuggerViewSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/ctx-debug.ejs'),
  'utf8',
);
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
  resolve(process.cwd(), 'views/pages/sysbo/entry.ejs'),
  'utf8',
);

const metadataDebuggingModelSource = readFileSync(
  resolve(process.cwd(), 'src/presentation/metadata-debugging-model.ts'),
  'utf8',
);

const fieldRuntimeSource = readFileSync(
  resolve(process.cwd(), 'public/js/field-components/runtime.js'),
  'utf8',
);

const fieldToolsSource = readFileSync(
  resolve(process.cwd(), 'views/field-components/field-tools-menu.ejs'),
  'utf8',
);

describe('CTX debugger presentation state', () => {


  it('shows company above system at the CTX root without mutating CTX semantics', () => {
    expect(debuggerSource).toContain("const preferred = ['company', 'system', 'entities', 'user', 'page']");
    expect(debuggerSource).toContain("const presentedEntries = path === 'ctx'");
    expect(debuggerSource).toContain('return presentedEntries.map');
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
    expect(debuggerSource).toContain("const isExpressionSourcePath = (path)");
    expect(debuggerSource).toContain("label === 'Expression' || (label === 'Value' && isExpressionSourcePath(info.path))");
    expect(debuggerSource).toContain("typeof value === 'string' && isExpressionSourcePath(path)");
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
    expect(shellSource).toContain('debugPanel.inert = !ctxActive');
    expect(shellSource).toContain('apiTrafficPanel.inert = ctxActive');
  });

  it('keeps CTX inspection developer-only and reveals the viewer before selecting a field', () => {
    expect(horizontalNavSource).toContain('app.ui?.debugTools');
    expect(shellViewSource).toContain('app.ui?.debugTools');
    expect(fieldToolsSource).toContain('showDeveloperTools');
    expect(fieldToolsSource).toContain('Inspect in CTX Viewer');
    expect(fieldRuntimeSource).toContain("manatos:ctx-viewer-show");
    expect(fieldRuntimeSource.indexOf('manatos:ctx-viewer-show')).toBeLessThan(
      fieldRuntimeSource.indexOf('manatos:ctx-viewer-select'),
    );
    expect(shellSource).toContain("window.addEventListener('manatos:ctx-viewer-show'");
    expect(shellSource).toContain('shellState.setDebugVisible(true)');
    expect(fieldRuntimeSource).toContain('expand: true');
    expect(debuggerSource).toContain('expandSelected = false');
    expect(debuggerSource).toContain('state.expanded.add(path)');
  });

  it('separates formula-definition inspection from the live calculated record value', () => {
    expect(debuggingPanelSource).toContain('Inspect formula in CTX Viewer');
    expect(debuggingPanelSource).toContain('Inspect current value in CTX Viewer');
    expect(debuggingPanelSource).toContain('data-debug-inspect-kind="formula"');
    expect(debuggingPanelSource).toContain('data-debug-inspect-kind="value"');
    expect(debuggingPanelSource).not.toContain("debugRow.inspectPath || 'ctx.page.page'");
    expect(metadataEntrySource).toContain('buildMetadataDebuggingModel({');
    expect(metadataDebuggingModelSource).toContain("entryContextPath = 'ctx.page.page'");
    expect(metadataDebuggingModelSource).toContain('`${entryContextPath}.fields.${key}.expression`');
    expect(metadataDebuggingModelSource).toContain('`${entryContextPath}.entry.${key}`');
    expect(metadataEntrySource).toContain("entryContextPath: ownerEditing ? 'ctx.page.page.page' : 'ctx.page.page'");
    expect(metadataDebuggingModelSource).toContain('definitionPath');
    expect(metadataDebuggingModelSource).toContain('valuePath');
    expect(debuggingPanelSource).toContain('const hasInspectionActions = Boolean(debugRow.definitionPath || debugRow.valuePath)');
    expect(debuggingPanelSource).toContain('<% if (hasInspectionActions) { %>');
  });


});
