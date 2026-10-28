import type {
  UiPopupDefinition,
  UiPopupFeatureContentDefinition,
  UiPopupFieldDefinition,
  UiPopupTabDefinition,
  UiStorageSnapshot,
} from '@manatos/shared-ui';
import { storageTabComponents } from './StorageTabComponents.js';
import { StorageMetadataFields, StorageTabStatus } from './StorageParts.js';

/**
 * Build a stable catalogue of possible popup tabs and semantic field nodes.
 * Selecting an adapter changes availability and visible content, not tab IDs
 * or the lifetime of the owning PopupBase / nested #level.
 */
export function defineStoragePopup(
  snapshot: UiStorageSnapshot,
  readOnly: boolean,
): UiPopupDefinition {
  const tabLabels = new Map<string, string>([['configuration', 'Configuration']]);
  const adapterTabs = new Map<string, string[]>();
  const downstreamFieldIds = new Map<string, Set<string>>();
  const fields = new Map<string, UiPopupFieldDefinition>();

  function declareField(id: string, sensitive = false): void {
    if (fields.has(id)) return;
    fields.set(id, {
      id,
      label: id,
      type: sensitive ? 'password' : 'text',
      autocomplete: 'off',
      required: false,
      sensitive,
    });
  }

  declareField('name');
  declareField('adapterId');
  for (const id of ['stage', 'status', 'connectionStatus', 'databaseStatus', 'schemaStatus']) {
    declareField(id);
  }

  for (const adapter of snapshot.adapters) {
    for (const tab of adapter.tabs) {
      tabLabels.set(tab.id, tab.label);
      adapterTabs.set(tab.id, [...(adapterTabs.get(tab.id) ?? []), adapter.id]);

      for (const field of tab.fields) {
        declareField(`setting_${adapter.id}_${field.key}`, field.secret === true);
      }

      // Explicit dependency declarations stay framework-neutral: changing a
      // storage field invalidates evidence for this and downstream stages.
      const tabOrder = adapter.tabs.map((candidate) => candidate.id);
      const index = tabOrder.indexOf(tab.id);
      for (const downstream of tabOrder.slice(index)) {
        const ids = downstreamFieldIds.get(downstream) ?? new Set<string>();
        for (const field of tab.fields) ids.add(`setting_${adapter.id}_${field.key}`);
        downstreamFieldIds.set(downstream, ids);
      }
    }
  }

  tabLabels.set('capabilities', 'Capabilities');
  for (const id of tabLabels.keys()) {
    if (id !== 'configuration') declareField(`access_${id}`);
  }

  const layouts = new Map([...storageTabComponents].map(([id, entry]) => [id, entry.layout]));
  function contentChildren(tabId: string): UiPopupFeatureContentDefinition[] {
    return (
      layouts.get(tabId)?.(snapshot) ?? [
        ...StorageTabStatus.layout(),
        StorageMetadataFields.layout(snapshot, tabId),
      ]
    );
  }

  const tabs: UiPopupTabDefinition[] = [...tabLabels].map(([id, label]) => {
    const adapters = adapterTabs.get(id);
    const visibleWhen = adapters
      ?.map((adapterId) => `#data.fields.adapterId.value == ${JSON.stringify(adapterId)}`)
      .join(' || ');
    const enabledWhen =
      id !== 'configuration' && id !== 'capabilities'
        ? `#data.fields.access_${id}.value == 'true'`
        : undefined;

    return {
      id,
      title: {
        title: label,
        subtitle: {
          EN: 'Configure and verify storage without switching the running datastore.',
          EL: 'Διαμόρφωση και έλεγχος αποθήκευσης χωρίς αλλαγή της ενεργής βάσης δεδομένων.',
        },
        icon: 'bi-database-gear',
      },
      content: [
        {
          id: `storage-${id}`,
          kind: 'feature-content',
          children: contentChildren(id),
        },
      ],
      actions: [],
      ...(visibleWhen ? { visibleWhen } : {}),
      ...(enabledWhen ? { enabledWhen } : {}),
      ...(id !== 'configuration' && id !== 'capabilities'
        ? { requiredWhen: visibleWhen ?? 'false' }
        : {}),
      ...(downstreamFieldIds.has(id) ? { invalidateOn: [...downstreamFieldIds.get(id)!] } : {}),
    };
  });

  return {
    id: 'administration.storage',
    presentation: { content: 'storage', variant: 'storage', tabNavigation: 'visible' },
    initialTab: 'configuration',
    showLanguageSelection: true,
    allowFontScale: true,
    allowDebugger: true,
    /** A single root footer survives tab changes without duplicating semantic actions. */
    actions: [
      { id: 'cancel', label: { EN: 'Close', EL: 'Κλείσιμο' }, type: 'button' },
      ...(!readOnly
        ? [
            {
              id: 'save',
              label: { EN: 'Save configuration', EL: 'Αποθήκευση ρύθμισης' },
              type: 'submit' as const,
              primary: true,
              enabledWhen: '#data.fields.name.valid',
            },
          ]
        : []),
    ],
    fields: [...fields.values()],
    tabs,
    rules: [],
  };
}
