import { describe, expect, it, vi } from 'vitest';
import type { UiPopupTabDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageWizardPopup } from '../src/components/administration/StorageWizardPopup.js';
import { storageTabComponents } from '../src/components/administration/storage/StorageTabComponents.js';
import { defineStoragePopup } from '../src/components/administration/storage/StoragePopupDefinition.js';

const snapshot: UiStorageSnapshot = {
  currentConfigurationId: 'default-json',
  selectedConfigurationId: 'default-json',
  runningConfigurationId: 'default-json',
  configurations: [],
  debugging: { apiStorageContextEnabled: false, outputDirectory: '' },
  adapters: [
    {
      id: 'json',
      name: 'JSON',
      description: '',
      familyPath: [],
      runtimeAvailable: true,
      capabilities: [],
      tabs: [
        ...['configuration', 'files', 'connection', 'database', 'schema', 'data'].map((id) => ({
          id,
          label: id,
          fields: [],
        })),
      ],
    },
  ],
};

describe('EJS1 Storage component architecture', () => {
  it('registers every tab as an independent main component', () => {
    expect([...storageTabComponents.keys()]).toEqual([
      'configuration',
      'files',
      'connection',
      'database',
      'schema',
      'data',
      'capabilities',
    ]);
    for (const [id, { component, layout }] of storageTabComponents) {
      expect(component.id).toBe(id);
      expect(layout(snapshot).length).toBeGreaterThan(0);
    }
  });

  it('preserves one popup with metadata-driven tabs, fields and shared footer actions', () => {
    const definition = defineStoragePopup(snapshot, false);
    expect(definition.id).toBe('administration.storage');
    expect(definition.presentation?.tabNavigation).toBe('visible');
    expect(definition.tabs.map((tab) => tab.id)).toEqual([
      'configuration',
      'files',
      'connection',
      'database',
      'schema',
      'data',
      'capabilities',
    ]);
    expect(definition.actions?.map((action) => action.id)).toEqual(['cancel', 'save']);
    expect(defineStoragePopup(snapshot, true).actions?.map((action) => action.id)).toEqual([
      'cancel',
    ]);
  });
});

/** Exercise live adapter presentation/CTX projection without mounting a second popup host. */
describe('EJS1 Storage adapter switching', () => {
  it('resolves the active adapter label instead of a label from another adapter', () => {
    const popup = Object.create(StorageWizardPopup.prototype) as StorageWizardPopup;
    let label = 'Database';
    Object.defineProperty(popup, 'workflow', {
      value: { stepById: () => ({ id: 'database', label, fields: [] }) },
    });
    Object.defineProperty(popup, 'owner', { value: { language: () => 'EL' } });
    const tab = {
      id: 'database',
      title: { title: 'Database' },
      content: [],
      actions: [],
    } as UiPopupTabDefinition;
    const display = (
      popup as unknown as {
        displayTitle(tab: UiPopupTabDefinition): UiPopupTabDefinition['title'];
      }
    ).displayTitle.bind(popup);

    expect(display(tab).title).toBe('Βάση δεδομένων');
    label = 'Database file';
    expect(display(tab).title).toBe('Αρχείο βάσης δεδομένων');
  });

  it('retires old adapter values and secret-presence facts from the same CTX level', () => {
    const popup = Object.create(StorageWizardPopup.prototype) as StorageWizardPopup;
    const revealedSecrets = new Set(['password']);
    const runtime = {
      setBusy: vi.fn(),
      setFieldValue: vi.fn(),
      setSensitiveFacts: vi.fn(),
      setNotice: vi.fn(),
    };
    Object.defineProperties(popup, {
      workflow: {
        value: {
          snapshot: {
            adapters: [
              {
                id: 'previous',
                tabs: [
                  {
                    id: 'connection',
                    fields: [
                      { key: 'server', secret: false },
                      { key: 'password', secret: true },
                    ],
                  },
                ],
              },
              { id: 'current', tabs: [] },
            ],
          },
          draft: { name: 'Test', adapterId: 'current' },
          workflow: { stage: 'configuration', status: 'incomplete' },
          busy: false,
          connectionState: 'idle',
          databaseState: 'idle',
          schemaState: 'idle',
          steps: [],
          error: '',
        },
      },
      popupRuntime: { value: runtime },
      revealedSecrets: { value: revealedSecrets },
      projectedAdapterId: { value: 'previous', writable: true },
      closed: { value: false },
    });
    (popup as unknown as { syncContext(): void }).syncContext();
    expect(revealedSecrets.size).toBe(0);
    expect(runtime.setFieldValue).toHaveBeenCalledWith('setting_previous_server', '', true);
    expect(runtime.setSensitiveFacts).toHaveBeenCalledWith('setting_previous_password', {
      valid: true,
      present: false,
    });
    expect(runtime.setFieldValue).toHaveBeenCalledWith('access_connection', 'false', true);
    expect(runtime.setFieldValue).toHaveBeenCalledWith('adapterId', 'current', true);
  });
});
