import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';
import { StorageMetadataFields } from './StorageMetadataFields';

/** Main files tab: owns its native composition; workflow state remains shared. */
@Component({
  selector: 'manatos-storage-files-tab',
  standalone: true,
  imports: [StorageTabStatus, StorageMetadataFields],
  templateUrl: './StorageFilesTab.html',
  styleUrl: './StorageTabBody.css',
})
export class StorageFilesTab extends StorageTabBase {
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [...StorageTabStatus.layout(), StorageMetadataFields.layout(snapshot, 'files')];
  }
}
