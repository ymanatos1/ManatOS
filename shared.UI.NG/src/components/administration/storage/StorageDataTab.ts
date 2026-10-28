import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';
import { StorageMetadataFields } from './StorageMetadataFields';

/** Main data tab: owns its native composition; workflow state remains shared. */
@Component({
  selector: 'manatos-storage-data-tab',
  standalone: true,
  imports: [StorageTabStatus, StorageMetadataFields],
  templateUrl: './StorageDataTab.html',
  styleUrl: './StorageTabBody.css',
})
export class StorageDataTab extends StorageTabBase {
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'data'),
      { id: 'storage-data-operations', kind: 'feature-content' },
    ];
  }
}
