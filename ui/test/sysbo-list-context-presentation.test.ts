import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('SysBO flattened page CTX data flow', () => {
  it('loads API rows and filter values directly on the list page before rendering either list engine', async () => {
    const source = await readFile(resolve(testDirectory, '../src/routes/sysbo-routes.ts'), 'utf8');

    expect(source).toContain('const runtime = pageListRuntimeContext(safeItems, filterFields, safeQuery)');
    expect(source).toContain('const { metadata, uiMetadata, items, query, ...pageValues } = values');
    expect(source).toContain('const listItems = listPage.dataList ?? []');
    expect(source).toContain('items: listItems');
    expect(source).toContain('pageEntryRuntimeContext(initialRecordValues)');
    expect(source).not.toContain('contextFields({\n      entity: entityContextName(definition.key),\n      ...pageValues');
  });

  it('keeps entry dataOriginal/dataCurrent live at one page-node level and supports id-keyed dataList members', async () => {
    const routes = await readFile(resolve(testDirectory, '../src/routes/sysbo-routes.ts'), 'utf8');
    const forms = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    const debuggerSource = await readFile(resolve(testDirectory, '../public/js/debugger/ctx-debug.js'), 'utf8');
    const ctxRuntime = await readFile(resolve(testDirectory, '../public/js/ctx-runtime.js'), 'utf8');

    expect(routes).toContain('pageEntryRuntimeContext(initialRecordValues)');
    expect(forms).toContain('leafPageDataCurrentPath');
    expect(forms).toContain('runtime.updateField(pagePath, key, value, option');
    expect(forms).toContain('window.addEventListener(CHANGE_EVENT');
    expect(ctxRuntime).toContain('dataOriginal');
    expect(ctxRuntime).toContain('dataCurrent');
    expect(ctxRuntime).toContain('const updateField =');
    // Dotted/camelCase CTX paths such as page.page.dataOriginal must tokenize
    // one identifier at a time; an end-anchored identifier regex broke every
    // multi-segment runtime get/replace/update call.
    expect(ctxRuntime).toContain('const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;');
    expect(ctxRuntime).not.toContain('const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;');
    expect(debuggerSource).toContain('semanticArrayPath');
    expect(debuggerSource).toContain('key: uniqueSemanticKey ? `[${uniqueSemanticKey}]` : `[${index}]`');
    expect(debuggerSource).toContain("dataList['<uuid>']");
  });
  it('keeps the populated parent dataList alive while its child entry page is open', async () => {
    const routes = await readFile(resolve(testDirectory, '../src/routes/sysbo-routes.ts'), 'utf8');

    expect(routes).toContain('parentListContextForEntry');
    expect(routes).toContain('pageListRuntimeContext(parentItems, parentFilterFields, parentQuery)');
    expect(routes).toContain('parentListQueryForEntry');
    expect(routes).toContain("const expectedPath = `/bo/${definition.key}`");
    expect(routes).toContain('parentListContext,');
  });

});
