import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageMetadataFields } from './StorageMetadataFields';
import { StorageTabStatus } from './StorageTabStatus';

/** Fallback for future metadata-defined tabs, not an if/else router for known tabs. */
@Component({
  selector: 'manatos-storage-metadata-tab',
  standalone: true,
  imports: [StorageMetadataFields, StorageTabStatus],
  templateUrl: './StorageMetadataTab.html',
  styleUrl: './StorageTabBody.css',
})
export class StorageMetadataTab extends StorageTabBase {
  static layout(snapshot: UiStorageSnapshot, tabId: string): UiPopupFeatureContentDefinition[] {
    return [...StorageTabStatus.layout(), StorageMetadataFields.layout(snapshot, tabId)];
  }
}
