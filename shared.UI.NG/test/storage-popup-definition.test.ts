import { describe, expect, it } from 'vitest';
import type { UiStorageSnapshot } from '@manatos/shared-ui';
import { defineStoragePopup } from '../src/components/administration/storage/StoragePopupDefinition';

const snapshot = {
  adapters: [
    {
      id: 'json',
      tabs: [
        {
          id: 'files',
          label: 'Files',
          fields: [{ key: 'path', type: 'text', label: 'Path', secret: false }],
        },
      ],
    },
    {
      id: 'sqlite',
      tabs: [
        {
          id: 'connection',
          label: 'Database file',
          fields: [{ key: 'fileName', type: 'text', label: 'File', secret: false }],
        },
        { id: 'schema', label: 'Schema', fields: [] },
      ],
    },
    {
      id: 'sqlserver',
      tabs: [
        {
          id: 'connection',
          label: 'Connection',
          fields: [{ key: 'password', type: 'text', label: 'Password', secret: true }],
        },
        { id: 'database', label: 'Database', fields: [] },
        { id: 'schema', label: 'Schema', fields: [] },
      ],
    },
  ],
} as unknown as UiStorageSnapshot;

describe('Storage popup shared contract', () => {
  it('declares one stable catalogue of adapter-reactive tabs', () => {
    const popup = defineStoragePopup(snapshot, false);
    const tabs = popup.tabs ?? [];

    expect(tabs.map((tab) => tab.id)).toEqual([
      'configuration',
      'files',
      'connection',
      'schema',
      'database',
      'capabilities',
    ]);
    expect(tabs[0]?.visibleWhen).toBeUndefined();
    expect(tabs.at(-1)?.visibleWhen).toBeUndefined();
    expect(tabs.find((tab) => tab.id === 'connection')?.visibleWhen).toContain('sqlite');
    expect(tabs.find((tab) => tab.id === 'connection')?.visibleWhen).toContain('sqlserver');
    expect(tabs.find((tab) => tab.id === 'database')?.visibleWhen).not.toContain('json');
  });

  it('owns Save/Close once at popup root, not under each tab', () => {
    const popup = defineStoragePopup(snapshot, false);
    expect(popup.actions?.map((action) => action.id)).toEqual(['cancel', 'save']);
    expect((popup.tabs ?? []).every((tab) => tab.actions.length === 0)).toBe(true);
  });

  it('keeps private fields safe and attributes semantic layout to concrete content', () => {
    const popup = defineStoragePopup(snapshot, false);
    const secret = popup.fields.find((field) => field.id === 'setting_sqlserver_password');
    expect(secret?.sensitive).toBe(true);

    const configuration = popup.tabs?.[0]?.content[0];
    expect(configuration?.kind).toBe('feature-content');
    if (configuration?.kind !== 'feature-content') return;
    expect(configuration.children?.map((child) => child.id)).toEqual([
      'storage-tab-notices',
      'storage-workflow-state',
      'storage-configuration-form',
    ]);
    expect(
      configuration.children?.find((child) => child.id === 'storage-configuration-form'),
    ).toMatchObject({
      children: [{ id: 'storage-name' }, { id: 'storage-adapter' }],
    });
  });

  it('provides read-only inspection with no Save action', () => {
    const popup = defineStoragePopup(snapshot, true);
    expect(popup.actions?.map((action) => action.id)).toEqual(['cancel']);
    expect((popup.tabs ?? []).every((tab) => tab.actions.length === 0)).toBe(true);
  });
});

describe('Storage reactive semantic composition', () => {
  it('declares adapter-specific fields as replaceable variants, not simultaneous layout nodes', () => {
    const popup = defineStoragePopup(snapshot, false);
    const connection = popup.tabs?.find((tab) => tab.id === 'connection');
    const body = connection?.content[0];
    const group =
      body?.kind === 'feature-content'
        ? body.children?.find((item) => item.id === 'storage-connection-fields')
        : undefined;
    expect(group?.variantField).toBe('adapterId');
    expect(Object.keys(group?.variants ?? {})).toEqual(['sqlite', 'sqlserver']);
    expect(group?.variants?.sqlite?.map((field) => field.id)).toEqual([
      'storage-setting-sqlite-fileName',
    ]);
    expect(group?.variants?.sqlserver?.map((field) => field.id)).toEqual([
      'storage-setting-sqlserver-password',
    ]);
    expect(connection?.requiredWhen).toContain('sqlite');
    expect(connection?.invalidateOn).toContain('setting_sqlserver_password');
  });
});
