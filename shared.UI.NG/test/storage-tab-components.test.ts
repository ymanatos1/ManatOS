import { describe, expect, it } from 'vitest';
import type { UiStorageSnapshot } from '@manatos/shared-ui';
import { storageTabComponents } from '../src/components/administration/storage/StorageTabComponents';
import { defineStoragePopup } from '../src/components/administration/storage/StoragePopupDefinition';

const snapshot = {
  adapters: [
    {
      id: 'sqlite',
      tabs: [
        {
          id: 'connection',
          label: 'Database file',
          fields: [{ key: 'filePath', type: 'path', label: 'File', secret: false }],
        },
      ],
    },
    {
      id: 'server',
      targetWorkflow: { databaseFieldKey: 'database' },
      tabs: [
        {
          id: 'connection',
          label: 'Connection',
          fields: [{ key: 'password', type: 'password', label: 'Password', secret: true }],
        },
        {
          id: 'database',
          label: 'Database',
          fields: [{ key: 'database', type: 'text', label: 'Database', secret: false }],
        },
      ],
    },
  ],
} as unknown as UiStorageSnapshot;

describe('independent main Storage tabs', () => {
  it('declares seven distinct concrete components with their own semantic layout', () => {
    expect(storageTabComponents.map((tab) => tab.id)).toEqual([
      'configuration',
      'files',
      'connection',
      'database',
      'schema',
      'data',
      'capabilities',
    ]);
    expect(new Set(storageTabComponents.map((tab) => tab.component)).size).toBe(7);
    for (const tab of storageTabComponents) expect(Array.isArray(tab.layout(snapshot))).toBe(true);
  });

  it('locates metadata fields under the owning tab and places database selection in the operation child', () => {
    const popup = defineStoragePopup(snapshot, false);
    const db = popup.tabs!.find((tab) => tab.id === 'database')!.content[0];
    expect(db.kind).toBe('feature-content');
    if (db.kind !== 'feature-content') return;
    const fields = db.children?.find((child) => child.id === 'storage-database-fields');
    const operations = db.children?.find((child) => child.id === 'storage-database-operations');
    expect(fields?.variants?.server).toEqual([]);
    expect(db.children?.some((child) => child.id === 'storage-tab-notices')).toBe(true);
    expect(db.children?.some((child) => child.id === 'storage-workflow-state')).toBe(true);
    expect(operations?.variants?.server?.map((child) => child.id)).toEqual([
      'storage-setting-server-database',
    ]);
  });
});
