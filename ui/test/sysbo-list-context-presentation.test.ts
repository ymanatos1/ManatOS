import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('SysBO flattened page CTX data flow', () => {
  it('loads API rows and filter values directly on the list page before rendering either list engine', async () => {
    const listRenderer = await readFile(resolve(testDirectory, '../src/routes/sysbo/list-renderer.ts'), 'utf8');
    const context = await readFile(resolve(testDirectory, '../src/routes/sysbo/context.ts'), 'utf8');
    const listQuery = await readFile(resolve(testDirectory, '../src/routes/sysbo/list-query.ts'), 'utf8');

    expect(context).toContain('const runtime = pageListRuntimeContext(safeItems, filterFields, safeQuery)');
    expect(context).toContain('const { metadata, uiMetadata, items, query, ...pageValues } = values');
    expect(listRenderer).toContain('const listItems = listPage.entries ?? []');
    expect(listRenderer).toContain('metadataEntrySearchField(metadata)');
    expect(listQuery).toContain('params.set(`filter.${searchField}`, requestedSearch)');
    expect(listQuery).toContain('metadataListFilterQueryValue(sourceQuery, field)');
    const filtersTemplate = await readFile(resolve(testDirectory, '../views/components/sysbo/list/list-filters.ejs'), 'utf8');
    expect(filtersTemplate).toContain('name="filter.<%= key %>"');
    expect(context).toContain('entriesOriginal');
    expect(listRenderer).toContain('items: listItems');
    expect(context).toContain('pageEntryRuntimeContext(initialRecordValues)');
    expect(context).not.toContain('contextFields({\n      entity: entityContextName(definition.key),\n      ...pageValues');
  });

  it('keeps entry entryOriginal/entry live at one page-node level and supports id-keyed entries members', async () => {
    const context = await readFile(resolve(testDirectory, '../src/routes/sysbo/context.ts'), 'utf8');
    const runtime = await readFile(resolve(testDirectory, '../public/js/metadata-form-runtime.js'), 'utf8');
    const debuggerSource = await readFile(resolve(testDirectory, '../public/js/debugger/ctx-debug.js'), 'utf8');
    const ctxRuntime = await readFile(resolve(testDirectory, '../public/js/ctx-runtime.js'), 'utf8');

    expect(context).toContain('pageEntryRuntimeContext(initialRecordValues)');
    expect(runtime).toContain('leafPageEntryPath');
    expect(runtime).toContain('runtime.updateField(pagePath, key, value, option');
    expect(runtime).toContain('window.addEventListener(CHANGE_EVENT');
    expect(ctxRuntime).toContain('entryOriginal');
    expect(ctxRuntime).toContain('entry');
    expect(ctxRuntime).toContain('const updateField =');
    // Dotted/camelCase CTX paths such as page.page.entryOriginal must tokenize
    // one identifier at a time; an end-anchored identifier regex broke every
    // multi-segment runtime get/replace/update call.
    expect(ctxRuntime).toContain('const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;');
    expect(ctxRuntime).not.toContain('const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;');
    expect(debuggerSource).toContain('semanticArrayPath');
    expect(debuggerSource).toContain('key: uniqueSemanticKey ? `[${uniqueSemanticKey}]` : `[${index}]`');
    expect(debuggerSource).toContain("entries['<uuid>']");
  });
  it('keeps the populated parent entries alive while its child entry page is open', async () => {
    const recordRenderer = await readFile(resolve(testDirectory, '../src/routes/sysbo/record-renderer.ts'), 'utf8');
    const context = await readFile(resolve(testDirectory, '../src/routes/sysbo/context.ts'), 'utf8');
    const parentList = await readFile(resolve(testDirectory, '../src/routes/sysbo/parent-list.ts'), 'utf8');

    expect(recordRenderer).toContain('parentListContextForEntry');
    expect(context).toContain('pageListRuntimeContext(parentItems, parentFilterFields, parentQuery)');
    expect(parentList).toContain('function parentListQueryForEntry');
    expect(parentList).toContain("url.pathname !== `/bo/${definition.key}`");
    expect(recordRenderer).toContain('parentListContext,');
  });

  it('opens aggregate-owned entries from owner entries without the ordinary record GET path', async () => {
    const routes = await readFile(resolve(testDirectory, '../src/routes/sysbo-routes.ts'), 'utf8');
    const ownerManaged = await readFile(resolve(testDirectory, '../src/routes/sysbo/owner-managed-entry.ts'), 'utf8');
    const workspace = await readFile(resolve(testDirectory, '../public/js/components/hierarchy-workspace.js'), 'utf8');

    expect(routes).toContain("router.post('/:key/owned-entry/:id'");
    expect(routes).toContain('itemOverride: { ...item }');
    expect(routes).toContain('parentOwnerContext,');
    expect(ownerManaged).toContain('parentOwnerContext: {');
    expect(routes).toContain("router.post('/:key/owned/save'");
    expect(workspace).toContain("append('_ownerEntries', JSON.stringify(entries()))");
    expect(workspace).toContain('/owned-entry/');
  });


  it('exposes a consistent listExceptions filter slot in list CTX', async () => {
    const contextSource = await readFile(resolve(testDirectory, '../src/context/manatos-context.ts'), 'utf8');
    expect(contextSource).toContain('listExceptions');
    expect(contextSource).toContain('query.listExceptions');
  });
});
