import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';
import { StorageMetadataFields } from './StorageMetadataFields';
import { StorageConnectionOperations } from './StorageConnectionOperations';

/** Main connection tab: owns its native composition; workflow state remains shared. */
@Component({
  selector: 'manatos-storage-connection-tab',
  standalone: true,
  imports: [StorageTabStatus, StorageMetadataFields, StorageConnectionOperations],
  templateUrl: './StorageConnectionTab.html',
  styleUrl: './StorageTabBody.css',
})
export class StorageConnectionTab extends StorageTabBase {
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'connection'),
      { id: 'storage-connection-operations', kind: 'feature-content' },
    ];
  }
}
