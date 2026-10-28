import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';
import { StorageMetadataFields } from './StorageMetadataFields';
import { StorageSchemaOperations } from './StorageSchemaOperations';

/** Main schema tab: owns its native composition; workflow state remains shared. */
@Component({
  selector: 'manatos-storage-schema-tab',
  standalone: true,
  imports: [StorageTabStatus, StorageMetadataFields, StorageSchemaOperations],
  templateUrl: './StorageSchemaTab.html',
  styleUrl: './StorageTabBody.css',
})
export class StorageSchemaTab extends StorageTabBase {
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'schema'),
      { id: 'storage-schema-operations', kind: 'feature-content' },
    ];
  }
}
