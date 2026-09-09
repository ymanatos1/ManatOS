import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('V2 EntityList visual contract', () => {
  it('routes V2 SysBO lists through EntityListRuntime and a dedicated shared visual renderer', async () => {
    const route = await uiSource('src/routes/sysbo/list-renderer.ts');
    const page = await uiSource('views/pages/sysbo/list.ejs');
    const renderer = await uiSource('views/components/runtime/entity-list.ejs');

    expect(route).not.toContain('enableV2Scenario');
    expect(route).toContain('new EntityListRuntime<Record<string, unknown>>');
    expect(route).toContain("'pages/sysbo/list'");
    expect(page).toContain("include('../../components/runtime/entity-list')");
    expect(renderer).toContain('data-v2-entity-list');
    expect(renderer).toContain("include('../sysbo/list/list-toolbar'");
    expect(renderer).toContain("include('../sysbo/list/list-row-cells'");
  });

  it('leaves list UI topology and action-policy interpretation to the browser V2 host', async () => {
    const route = await uiSource('src/routes/sysbo/list-renderer.ts');
    const host = await uiSource('public/js/runtime/ui-host-runtime.js');
    const actions = await uiSource('public/js/runtime/list-action-runtime.js');

    expect(route).not.toContain('new SurfaceRuntime()');
    expect(route).not.toContain('projectUiCtx(');
    expect(route).not.toContain('evaluateExpression(');
    expect(route).toContain('totalEntriesUnfiltered');
    expect(host).toContain('resources:');
    expect(actions).toContain('evaluateAstWithScope');
    expect(actions).toContain('addConstraintReached');
    expect(route).not.toContain('engineSelection');
    expect(route).not.toContain('compareSemanticSnapshots');
    expect(route).toContain("'pages/sysbo/list'");
  });
});
