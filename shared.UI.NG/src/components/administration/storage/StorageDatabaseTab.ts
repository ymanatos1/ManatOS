import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';
import { StorageMetadataFields } from './StorageMetadataFields';
import { StorageDatabaseOperations } from './StorageDatabaseOperations';

/** Main database tab: owns its native composition; workflow state remains shared. */
@Component({
  selector: 'manatos-storage-database-tab',
  standalone: true,
  imports: [StorageTabStatus, StorageMetadataFields, StorageDatabaseOperations],
  templateUrl: './StorageDatabaseTab.html',
  styleUrl: './StorageTabBody.css',
})
export class StorageDatabaseTab extends StorageTabBase {
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'database', true),
      {
        id: 'storage-database-operations',
        kind: 'feature-content',
        variantField: 'adapterId',
        variants: Object.fromEntries(
          snapshot.adapters.flatMap((adapter) => {
            const key = adapter.targetWorkflow?.databaseFieldKey;
            return key && adapter.tabs.some((tab) => tab.id === 'database')
              ? [
                  [
                    adapter.id,
                    [
                      {
                        id: `storage-setting-${adapter.id}-${key}`,
                        kind: 'feature-content' as const,
                      },
                    ],
                  ],
                ]
              : [];
          }),
        ),
      },
    ];
  }
}
