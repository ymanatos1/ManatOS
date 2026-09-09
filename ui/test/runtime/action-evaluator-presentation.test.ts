import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('evaluator-backed action presentation', () => {
  it('evaluates list Add/page-action policy in the browser against client-owned list facts', async () => {
    const listRenderer = await source('src/routes/sysbo/list-renderer.ts');
    const list = await source('views/components/runtime/entity-list.ejs');
    const actionRuntime = await source('public/js/runtime/list-action-runtime.js');

    expect(listRenderer).not.toContain('evaluateExpression(');
    expect(listRenderer).not.toContain('resolvedAddAction');
    expect(listRenderer).toContain('totalEntriesUnfiltered');
    expect(list).toContain("return { kind: 'expression', source: value.expression };");
    expect(list).not.toContain('compileUIExpression(value.expression)');
    expect(list).toContain('data-v2-list-action="add"');
    expect(actionRuntime).toContain('expressionCompilerReady');
    expect(actionRuntime).toContain('compiler.ast(declaration.source)');
    expect(actionRuntime).toContain('evaluateAstWithScope');
    expect(actionRuntime).toContain('surface.resources?.listFacts');
    expect(actionRuntime).toContain('addConstraintReached');
  });

  it('lets entry action metadata own visibility/enabled policy without renderer permission gates', async () => {
    const entry = await source('views/components/runtime/entity-entry.ejs');
    const entryPolicy = await source('public/js/runtime/entry-policy-runtime.js');
    const evaluatorRuntime = await source('public/js/sysbo/entry/form-runtime.js');
    const recordRenderer = await source('src/routes/sysbo/record-renderer.ts');

    expect(entry).toContain('data-v2-entry-action="<%= v2DeleteAction.key %>"');
    expect(entry).not.toContain('permissions.delete && deleteAction');
    expect(entryPolicy).toContain('const refreshEntryActions = async () =>');
    expect(entryPolicy).toContain('window.ManatOS?.expressionRuntimeReady');
    expect(evaluatorRuntime).toContain(
      'resolveExpressionRuntimeReady?.(window.ManatOS.expression)',
    );
    expect(entryPolicy).toContain('await evaluate(action.visible, true)');
    expect(entryPolicy).toContain('await evaluate(action.enabled, true)');
    expect(entryPolicy).toContain('await evaluate(action.disabledReason, null)');
    expect(recordRenderer).toContain(
      'facts: { ...v2RuntimeFacts, permissions: effectivePermissions }',
    );
  });
});
