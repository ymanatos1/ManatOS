import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', path), 'utf8');

describe('external authentication provider metadata-driven list presentation', () => {
  it('declares only safe provider list columns and the one-record-per-provider rule in metadata', async () => {
    const metadata = await source('../shared/src/metadata/ui/identity.ts');
    expect(metadata).toContain("visibleFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified']");
    expect(metadata).toContain("disableWhenAllEnumValuesExistForField: 'provider'");
    expect(metadata).toContain('One configuration record per provider.');
    expect(metadata).not.toContain("visibleFields: ['provider', 'clientId'");
  });

  it('uses the generic metadata list renderer for provider labels and navigation', async () => {
    const list = await source('views/pages/sysbo/list.ejs');
    const rowCells = await source('views/components/sysbo/list/list-row-cells.ejs');
    expect(list).toContain('metadataUI.list.visibleFields');
    expect(list).toContain('const optionItem = metadataOptionItemForField');
    expect(list).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(rowCells).toContain('primaryOptionItem');
    expect(rowCells).toContain('/bo/<%= definition.key %>/<%= item.id %>');
    expect(list).not.toContain("definition.key === 'sys-ext-auth-providers'");
  });
});
