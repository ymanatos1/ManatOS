import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

const read = (relative: string) => readFile(resolve(root, relative), 'utf8');

describe('calculated CTX record projection', () => {
  it('projects records at their canonical server/UI-host ingress boundaries', async () => {
    const shell = await read('views/layout/shell.ejs');
    const projector = await read('src/runtime/projection/calculated-record-projector.ts');
    const pageContext = await read('src/middleware/page-context.ts');
    const listRenderer = await read('src/routes/sysbo/list/renderer.ts');
    const entryWrite = await read('src/routes/sysbo/entry/write.ts');
    const dataAccess = await read('src/routes/sysbo/shared/data-access.ts');

    expect(shell).not.toContain('/js/runtime/ctx-record-projection-runtime.js');
    expect(projector).toContain('const source = closeMetadataRecordShape(metadata, entry)');
    expect(projector).toContain('projectCalculatedRecord(');
    expect(projector).toContain('return closeMetadataRecordShape(metadata, projected)');
    expect(projector).toContain('materializeCalculatedContextFields');
    expect(projector).toContain('closeMetadataRecordShape');
    expect(projector).toContain('entry[fieldKey] === undefined ? null : entry[fieldKey]');
    expect(projector).toContain(
      'target.value = projected[field.key] === undefined ? null : projected[field.key]',
    );
    expect(pageContext).toContain('materializeCalculatedContextFields(');
    expect(listRenderer).toContain('createCalculatedRecordProjector(metadata, ctx');
    expect(entryWrite).toContain('projectSavedRecordForCtx');
    expect(dataAccess).toContain('project calculated reference-selector candidate field');
  });

  it('keeps entry representation downstream of canonical calculated-record projection', async () => {
    const source = await read('../shared/src/presentation/entry-representation.ts');
    expect(source).not.toContain('calculatedContextField');
    expect(source).toContain('return entry[source.field]');
    expect(source).toContain('must never run a second');
  });
});
