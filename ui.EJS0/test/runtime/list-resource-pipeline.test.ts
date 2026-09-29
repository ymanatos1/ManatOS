import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');

describe('canonical SysBO list resource pipeline', () => {
  it('keeps HTTP acquisition and calculated projection behind one EntityList data-source adapter', async () => {
    const resource = await ui('src/routes/sysbo/shared/list-resource.ts');

    expect(resource).toContain('export function sysBOEntityListDataSource(');
    expect(resource).toContain('entityListQueryParams(query)');
    expect(resource).toContain('createCalculatedRecordProjector(metadata, ctx');
    expect(resource).toContain('export function sysBOEntityListRuntime(');
    expect(resource).toContain('initialQuery: options.query');
    expect(resource).not.toContain('options.query[`filter.');
    expect(resource).not.toContain('Number(options.query.page');
  });

  it('reuses the canonical pipeline for browse lists, parent snapshots and related entity-query collections', async () => {
    const browse = await ui('src/routes/sysbo/list/renderer.ts');
    const parent = await ui('src/routes/sysbo/list/parent-list.ts');
    const related = await ui('src/routes/sysbo/related/collections.ts');

    expect(browse).toContain('sysBOEntityListRuntime(req, definition, metadata, ctx');
    expect(parent).toContain('sysBOEntityListRuntime(req, definition, metadata, ctx');
    expect(related).toContain('sysBOEntityListDataSource(');

    expect(parent).not.toContain('apiClient.get<SysBOListData');
    expect(parent).not.toContain('createCalculatedRecordProjector');
    expect(related).not.toContain('apiClient.get<SysBOListData');
  });

  it('centralizes metadata-driven reference-resource planning for list presentation', async () => {
    const resource = await ui('src/routes/sysbo/shared/list-resource.ts');
    const browse = await ui('src/routes/sysbo/list/renderer.ts');
    const parent = await ui('src/routes/sysbo/list/parent-list.ts');

    expect(resource).toContain('export async function sysBOListReferenceData(');
    expect(resource).toContain('entryUsesRelations');
    expect(browse).toContain('sysBOListReferenceData(');
    expect(parent).toContain('sysBOListReferenceData(');
    expect(parent).not.toContain('entryTypeSource');
  });
});
