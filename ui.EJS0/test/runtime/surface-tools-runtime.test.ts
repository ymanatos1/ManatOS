import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('universal surface tools runtime', () => {
  it('uses one provider/model/renderer pipeline for entry and list view tools', async () => {
    const tools = await source('public/js/runtime/surface-tools-runtime.js');
    const entry = await source('public/js/sysbo/entry/entry-view-runtime.js');
    const list = await source('public/js/sysbo/list/list-view-runtime.js');
    const entryTemplate = await source('views/components/sysbo/entry/shell/entry-tabs-nav.ejs');
    const listTemplate = await source('views/components/sysbo/list/list-toolbar.ejs');

    expect(tools).toContain('const providers = new Map()');
    expect(tools).toContain('const normalizeModel');
    expect(tools).toContain('const surfaceContext = (anchor) =>');
    expect(tools).toContain("path = 'ctx.ui.level'");
    expect(tools).toContain('const render = (anchor) =>');
    expect(tools).toContain('window.ManatOS.surfaceTools = Object.freeze');
    expect(entry).toContain("surfaceTools?.register?.('entry-ui-view'");
    expect(list).toContain("tools.register('list-ui-view'");
    expect(entryTemplate).toContain('data-surface-tools-anchor');
    expect(listTemplate).toContain('data-surface-tools-anchor');
    expect(entryTemplate).not.toContain('dropdown-menu');
    expect(listTemplate).not.toContain('ui-view-tools-menu');
  });
});
