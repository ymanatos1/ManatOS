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

describe('CTX debugger presentation state', () => {
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

});
