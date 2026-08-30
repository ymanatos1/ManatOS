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

  it('persists the debugger open/closed preference across UI-server restarts', () => {
    expect(shellSource).toContain("const DEBUG_STORAGE_KEY = 'manatos.debug.panel.visible.v1'");
    expect(shellSource).toContain('localStorage.setItem(DEBUG_STORAGE_KEY, String(visible))');
    expect(shellSource).toContain("localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'");
    expect(shellSource).not.toContain('manatos.debug.panel.visible.${debugBootId}');
  });

});
