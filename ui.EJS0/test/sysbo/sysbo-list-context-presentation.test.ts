import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('SysBO V2 CTX data flow', () => {
  it('loads API rows and filter values directly on the list page before rendering either list engine', async () => {
    const listRenderer = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/list/renderer.ts'),
      'utf8',
    );
    const uiHostRuntime = await readFile(
      resolve(testDirectory, '../../public/js/runtime/ui-host-runtime.js'),
      'utf8',
    );
    const listQuery = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/list/query.ts'),
      'utf8',
    );

    expect(listRenderer).toContain(
      'registerContextEntity(ctx, definition.key, metadata, metadataUI, definition.icon)',
    );
    expect(listRenderer).toContain('const listItems = [...listSnapshot.entries]');
    expect(listRenderer).not.toContain("kind: 'list'");
    expect(uiHostRuntime).toContain("kind: 'list'");
    expect(uiHostRuntime).toContain("case 'browse-entity-list'");
    expect(listRenderer).toContain('list: {');
    expect(listRenderer).toContain('...listSnapshot');
    expect(listRenderer).toContain('resources: { referenceData: listReferenceData }');
    expect(listRenderer).toContain('metadataEntrySearchField(metadata)');
    expect(listQuery).toContain(
      'const search = requestedSearch && searchField ? requestedSearch : undefined;',
    );
    expect(listQuery).not.toContain('params: URLSearchParams');
    expect(listQuery).toContain('metadataListFilterQueryValue(sourceQuery, field)');
    const filtersTemplate = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/list/list-filters.ejs'),
      'utf8',
    );
    expect(filtersTemplate).toContain('name="filter.<%= key %>"');
    expect(listRenderer).toContain('items: listItems');
    expect(listRenderer).not.toContain('applySysBOListContext');
  });

  it('keeps entry entryOriginal/entry live at one page-node level and supports id-keyed entries members', async () => {
    const runtime = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/form-runtime.js'),
      'utf8',
    );
    const debuggerSource = await readFile(
      resolve(testDirectory, '../../public/js/debugger/ctx-debug.js'),
      'utf8',
    );
    const ctxRuntime = await readFile(
      resolve(testDirectory, '../../public/js/runtime/context-runtime.js'),
      'utf8',
    );

    expect(runtime).toContain('const entryPagePath = form.dataset.ctxScopePath || null;');
    expect(runtime).not.toContain('const leafPagePath =');
    expect(runtime).toContain('runtime.updateField(entryPagePath, key, value, undefined, cause)');
    expect(runtime).toContain('window.addEventListener(CHANGE_EVENT');
    expect(ctxRuntime).toContain('entryOriginal');
    expect(ctxRuntime).toContain('entry');
    expect(ctxRuntime).toContain('const updateField =');
    expect(ctxRuntime).toContain("candidate === 'ctx.ui.level'");
    expect(ctxRuntime).toContain('scopes.push(levelCandidate)');
    expect(ctxRuntime).toContain(
      'Object.prototype.hasOwnProperty.call(scopeValue.control.facts, first)',
    );
    // Field writes are canonical for every UI level; there is no root-entry-only
    // compatibility branch or parallel page.entry write authority.
    expect(ctxRuntime).not.toContain("pagePath === 'ctx.ui.level'");
    expect(ctxRuntime).toContain('fields.<key>.value is the sole live authority');
    expect(ctxRuntime).not.toContain('page.entry[key] = value');
    expect(ctxRuntime).toContain('get: () => !Object.is(field.originalValue, field.value)');
    // Dotted/camelCase CTX paths such as page.page.entryOriginal must tokenize
    // one identifier at a time; an end-anchored identifier regex broke every
    // multi-segment runtime get/replace/update call.
    expect(ctxRuntime).toContain('const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;');
    expect(ctxRuntime).not.toContain('const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;');
    expect(debuggerSource).toContain('const appendCtxPath = (path, key) =>');
    expect(debuggerSource).toContain('`${path}[${JSON.stringify(key)}]`');
    expect(debuggerSource).toContain(
      'key: uniqueSemanticKey ? `[${uniqueSemanticKey}]` : `[${index}]`',
    );
    expect(debuggerSource).toContain("entries['<uuid>']");
  });
  it('keeps the populated parent entries alive while its child entry page is open', async () => {
    const recordRenderer = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/entry/renderer.ts'),
      'utf8',
    );
    const parentList = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/list/parent-list.ts'),
      'utf8',
    );
    const uiHostRuntime = await readFile(
      resolve(testDirectory, '../../public/js/runtime/ui-host-runtime.js'),
      'utf8',
    );

    expect(recordRenderer).toContain('parentListContextForEntry');
    expect(parentList).toContain('function parentListQueryForEntry');
    expect(parentList).toContain('url.pathname !== `/bo/${definition.key}`');
    expect(recordRenderer).toContain('const parentItems = Array.isArray(parentListContext.items)');
    expect(recordRenderer).toContain('parentEntries: parentItems');
    expect(recordRenderer).not.toContain(
      'list: { entries: parentItems, originalEntries: parentItems }',
    );
    expect(uiHostRuntime).toContain('entries: bootstrap.parentEntries');
    expect(uiHostRuntime).toContain('originalEntries: bootstrap.parentEntries');
    expect(recordRenderer).not.toContain('applySysBOEntryContext');
  });

  it('opens aggregate-owned entries from owner entries without the ordinary record GET path', async () => {
    const routes = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/index.ts'),
      'utf8',
    );
    const ownerManaged = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/entry/owner-managed-entry.ts'),
      'utf8',
    );
    const workspace = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/hierarchy/hierarchy-workspace.js'),
      'utf8',
    );

    expect(routes).toContain("router.post('/:key/owned-entry/:id'");
    expect(routes).toContain('itemOverride: { ...item }');
    expect(routes).toContain('parentOwnerContext,');
    expect(ownerManaged).toContain(
      'const parentOwnerContext = ownerManagedContextFromRequest(req);',
    );
    expect(ownerManaged).toContain('normalizeMetadataFieldValues(');
    expect(routes).toContain("router.post('/:key/owned/save'");
    expect(workspace).toContain('_ownerEntries: JSON.stringify(entries())');
    expect(workspace).toContain('/owned-entry/');
    expect(workspace).toContain("form.dataset.allowDirtyPageExit = 'true'");
    expect(workspace).toContain('form.requestSubmit()');
    expect(workspace).not.toContain('form.submit()');
  });

  it('exposes a consistent listExceptions filter slot in list CTX', async () => {
    const contextSource = await readFile(
      resolve(testDirectory, '../../../shared.UI/src/components/list/data/entity-list-query.ts'),
      'utf8',
    );
    expect(contextSource).toContain('listExceptions');
    expect(contextSource).toContain(
      "params.set('listExceptions', normalized.listExceptions.source)",
    );
  });
});
