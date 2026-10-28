import { describe, expect, it } from 'vitest';
import type { UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageWizardState } from '../src/components/administration/storage/StorageWizardState';

const snapshot = {
  adapters: [
    {
      id: 'json',
      tabs: [
        {
          id: 'files',
          label: 'Files',
          fields: [{ key: 'path', label: 'Path', type: 'text', secret: false }],
        },
      ],
      capabilities: [],
    },
    { id: 'sqlite', tabs: [], capabilities: [] },
  ],
} as unknown as UiStorageSnapshot;

describe('Storage wizard draft ownership', () => {
  it('does not mistake a fresh verification for an unsaved form edit', () => {
    const wizard = new StorageWizardState(snapshot, null, false, 'EN', () => {});
    expect(wizard.hasUnsavedChanges()).toBe(false);
    // Only the authoritative draft determines what will be persisted.
    wizard.rename('My storage');
    expect(wizard.hasUnsavedChanges()).toBe(true);
    wizard.rename('');
    expect(wizard.hasUnsavedChanges()).toBe(false);
    wizard.dispose();
  });

  it('treats adapter selection as a draft edit without changing popup identity', () => {
    const wizard = new StorageWizardState(snapshot, null, false, 'EN', () => {});
    wizard.switchAdapter('sqlite');
    expect(wizard.draft()?.adapterId).toBe('sqlite');
    expect(wizard.hasUnsavedChanges()).toBe(true);
    wizard.switchAdapter('json');
    expect(wizard.hasUnsavedChanges()).toBe(false);
    wizard.dispose();
  });
});
