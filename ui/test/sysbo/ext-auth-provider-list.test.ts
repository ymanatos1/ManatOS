import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tabContentKeys } from '../../../shared/src/metadata/ui/common.js';
import { resolveSysBOUIView } from '../../../shared/src/metadata/ui/view-resolution.js';
import { sysBOExtAuthProvidersUIMetadata } from '../../../shared/src/metadata/ui/auth/ui-ext-auth-providers.js';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('external authentication provider metadata-driven list presentation', () => {
  it('declares only safe provider list columns and the one-record-per-provider rule in metadata', () => {
    const list = sysBOExtAuthProvidersUIMetadata.list;
    expect(list?.visibleFields).toEqual([
      'provider',
      'enabled',
      'callbackPath',
      'credentialsVerified',
    ]);
    expect(list?.visibleFields).not.toContain('clientId');
    expect(list?.addAction?.disableWhenAllEnumValuesExistForField).toBe('provider');
    expect(list?.notice?.title).toBe('One configuration record per provider.');
  });

  it('declares a safe standard read-only Quick View without exposing credential values', () => {
    const quickView = resolveSysBOUIView(sysBOExtAuthProvidersUIMetadata, 'quickView');
    expect(quickView.viewType).toBe('quick');
    expect(quickView.metadata.record.readOnly).toBe(true);
    expect(quickView.metadata.record.tabs.map((tab) => tab.id)).toEqual([
      'general',
      'credentials',
      'system',
    ]);
    const fields = quickView.metadata.record.tabs.flatMap((tab) => tabContentKeys(tab.content));
    expect(fields).toContain('credentialsVerified');
    expect(fields).toContain('hasClientSecret');
    expect(quickView.metadata.record.tabs[0]?.representation).toBe('summary');
    expect(fields).not.toContain('clientId');
    expect(fields).not.toContain('clientSecretEncrypted');
    expect(sysBOExtAuthProvidersUIMetadata.list?.rowActions?.quickView).toMatchObject({
      kind: 'open-entry',
      iconOnly: true,
      mode: 'view',
      uiView: 'quickView',
    });
  });

  it('uses the generic metadata list renderer for provider labels and navigation', async () => {
    const list = await source('views/components/runtime/entity-list.ejs');
    const rowCells = await source('views/components/sysbo/list/list-row-cells.ejs');
    expect(list).toContain('metadataUI.list.visibleFields');
    expect(list).toContain('const optionItem = metadataOptionItemForField');
    expect(list).toContain("include('../sysbo/list/list-row-cells'");
    expect(rowCells).toContain('primaryOptionItem');
    expect(rowCells).toContain('/bo/<%= definition.key %>/<%= item.id %>');
    expect(list).not.toContain("definition.key === 'sys-ext-auth-providers'");
  });
});
