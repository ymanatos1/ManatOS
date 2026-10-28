import type { Type } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageConfigurationTab } from './StorageConfigurationTab';
import { StorageFilesTab } from './StorageFilesTab';
import { StorageConnectionTab } from './StorageConnectionTab';
import { StorageDatabaseTab } from './StorageDatabaseTab';
import { StorageSchemaTab } from './StorageSchemaTab';
import { StorageDataTab } from './StorageDataTab';
import { StorageCapabilitiesTab } from './StorageCapabilitiesTab';

/** The tab's concrete component defines its layout; the host only registers it. */
export const storageTabComponents: ReadonlyArray<{
  readonly id: string;
  readonly component: Type<StorageTabBase>;
  readonly layout: (snapshot: UiStorageSnapshot) => UiPopupFeatureContentDefinition[];
}> = [
  {
    id: 'configuration',
    component: StorageConfigurationTab,
    layout: () => StorageConfigurationTab.layout(),
  },
  { id: 'files', component: StorageFilesTab, layout: StorageFilesTab.layout },
  { id: 'connection', component: StorageConnectionTab, layout: StorageConnectionTab.layout },
  { id: 'database', component: StorageDatabaseTab, layout: StorageDatabaseTab.layout },
  { id: 'schema', component: StorageSchemaTab, layout: StorageSchemaTab.layout },
  { id: 'data', component: StorageDataTab, layout: StorageDataTab.layout },
  {
    id: 'capabilities',
    component: StorageCapabilitiesTab,
    layout: () => StorageCapabilitiesTab.layout(),
  },
];
