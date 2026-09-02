import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) => readFile(resolve(testDirectory, '..', relativePath), 'utf8');
const sharedSource = (relativePath: string) => readFile(resolve(testDirectory, '..', '..', 'shared', relativePath), 'utf8');

describe('telephone field normalization and debugging CLI presentation', () => {
  it('keeps normalization metadata-driven and uses the reusable telephone field component', async () => {
    const metadata = await sharedSource('src/bo-metadata.ts');
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
    const dispatcher = await uiSource('views/pages/metadata-driven/field-components/entity-field.ejs');
    const formField = await uiSource('views/pages/metadata-driven/field-components/form-field.ejs');
    const telephone = await uiSource('views/pages/metadata-driven/field-components/telephone-field.ejs');
    const forms = await uiSource('public/js/forms.js');
    expect(metadata).toContain("normalize: { expression: 'TelephoneNbr(value)' }");
    expect(uiMetadata).toContain("field: 'telephoneNumber'");
    expect(dispatcher).toContain("field.type === 'telephone'");
    expect(formField).toContain('data-field-normalize-ast');
    expect(telephone).not.toContain('TelephoneNbr');
    expect(forms).toContain('container?.dataset.fieldNormalizeAst');
    expect(forms).toContain("syncSourceField(control, { source: 'field-normalization'");
    expect(forms).not.toContain('publish(control');
  });

  it('uses one CLI component for page and CTX-viewer instances with independent local histories', async () => {
    const panel = await uiSource('views/pages/metadata-driven/ui-components/debugging-panel.ejs');
    const cliView = await uiSource('views/pages/metadata-driven/ui-components/debugging-cli.ejs');
    const shell = await uiSource('views/layout/shell.ejs');
    const debuggerView = await uiSource('views/partials/debugger/ctx-debug.ejs');
    const cli = await uiSource('public/js/debugger/cli.js');
    const routes = await uiSource('src/routes/sysbo-routes.ts');

    expect(panel).toContain("{ id: 'cli', label: 'CLI'");
    expect(panel).toContain("instanceKey: 'page'");
    expect(shell).toContain("instanceKey: 'ctx-viewer'");
    expect(shell).toContain("startPath: 'ctx'");
    expect(cliView).toContain('data-cli-instance-key');
    expect(cliView).toContain('data-cli-start-path');
    expect(cli).toContain('manatos.debug.cli.history.${instanceKey}');
    expect(cli).toContain('localStorage.setItem(historyStorageKey');
    expect(debuggerView).toContain('id="ctxDebugCli"');
    // The shared runtime must discover the instance key from component markup;
    // it must not know about the CTX-viewer instance by name.
    expect(cli).toContain("const instanceKey = root.dataset.cliInstanceKey || 'page';");
    expect(cli).not.toContain("instanceKey: 'ctx-viewer'");
    expect(cli).toContain("'manatos:debug-cli-toggle'");
    expect(cli).toContain('owner-page');
    expect(cli).toContain('ownerPage !== currentPageKey');
    expect(routes).toContain("router.post('/debug/compile-expression'");
    expect(routes).toContain("router.post('/expression/evaluate-function'");
    expect(cli).toContain("candidate.capability === 'entityResolver'");
    expect(routes).toContain('compileExpression(expression)');
  });

  it('behaves like a compact wrapping console with keyboard execution and prompt history', async () => {
    const cliView = await uiSource('views/pages/metadata-driven/ui-components/debugging-cli.ejs');
    const cli = await uiSource('public/js/debugger/cli.js');
    const css = await uiSource('public/css/debugger/ctx-debug.css');

    expect(cliView).toContain('<textarea');
    expect(cliView).not.toContain('data-cli-run');
    expect(cliView).toContain('data-cli-history');
    expect(cli).toContain("event.key === 'Enter' && !event.shiftKey");
    expect(cli).toContain('input.style.height = \'auto\'');
    expect(cli).toContain("command === '.'");
    expect(cli).toContain("command === '..'");
    expect(cli).toContain("command === 'cls'");
    expect(cli).toContain("command === 'clear'");
    expect(css).toContain('min-height: 12rem');
    expect(css).toContain('max-height: 36rem');
    expect(css).toContain('white-space: pre-wrap');
    expect(css).toContain('.debugging-cli-history-item');
    expect(css).toContain('background: #e2e8f0');
    expect(css).toContain('background: #cbd5e1');
  });

  it('keeps the CTX dock open across navigation and lets the CTX viewer follow shorter page heights', async () => {
    const cli = await uiSource('public/js/debugger/cli.js');
    const css = await uiSource('public/css/debugger/ctx-debug.css');
    const shell = await uiSource('views/layout/shell.ejs');
    expect(cli).toContain('manatos.debug.cli.open.${instanceKey}.${bootId}');
    expect(cli).toContain('localStorage.setItem(openStorageKey');
    expect(cli).toContain('localStorage.setItem(pathStorageKey');
    expect(cli).toContain('requestedPath !== currentPath');
    expect(cli).toContain('let restoredOpen = false');
    expect(cli).toContain('refreshPath({ persist: false })');
    expect(shell).toContain('dataset.manatosDebugCliOpen');
    expect(shell).toContain('manatos.debug.cli.open.ctx-viewer.${bootId}');
    expect(css).toContain("html[data-manatos-debug-cli-open='true'] .debugging-cli-dock.d-none");
    expect(css).toContain('height: auto;');
    expect(css).toContain('max-height: calc(100vh - var(--top-header-height, 0px));');
    expect(css).not.toMatch(/^\s*height:\s*calc\(100vh - var\(--top-header-height,\s*0px\)\);\s*$/m);
  });
});
