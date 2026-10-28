import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import type { StorageView } from './StorageParts.js';
import { StorageConfigurationTab } from './StorageConfigurationTab.js';
import { StorageFilesTab } from './StorageFilesTab.js';
import { StorageConnectionTab } from './StorageConnectionTab.js';
import { StorageDatabaseTab } from './StorageDatabaseTab.js';
import { StorageSchemaTab } from './StorageSchemaTab.js';
import { StorageDataTab } from './StorageDataTab.js';
import { StorageCapabilitiesTab } from './StorageCapabilitiesTab.js';
export interface StorageTabRenderer {
  readonly id: string;
  render(view: StorageView): string;
}
/** Explicit component registrations. Unknown adapter-defined tabs use metadata fallback. */
export const storageTabComponents: ReadonlyMap<
  string,
  {
    component: StorageTabRenderer;
    layout: (snapshot: UiStorageSnapshot) => UiPopupFeatureContentDefinition[];
  }
> = new Map([
  [
    'configuration',
    { component: new StorageConfigurationTab(), layout: StorageConfigurationTab.layout },
  ],
  ['files', { component: new StorageFilesTab(), layout: StorageFilesTab.layout }],
  ['connection', { component: new StorageConnectionTab(), layout: StorageConnectionTab.layout }],
  ['database', { component: new StorageDatabaseTab(), layout: StorageDatabaseTab.layout }],
  ['schema', { component: new StorageSchemaTab(), layout: StorageSchemaTab.layout }],
  ['data', { component: new StorageDataTab(), layout: StorageDataTab.layout }],
  [
    'capabilities',
    { component: new StorageCapabilitiesTab(), layout: StorageCapabilitiesTab.layout },
  ],
]);
