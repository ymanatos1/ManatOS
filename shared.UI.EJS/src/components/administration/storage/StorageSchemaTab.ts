import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import {
  type StorageView,
  StorageMetadataFields,
  StorageTabStatus,
  StorageSchemaOperations,
} from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageSchemaTab {
  readonly id = 'schema';
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'schema'),
      { id: 'storage-schema-operations', kind: 'feature-content' },
    ];
  }
  render(view: StorageView): string {
    const step = view.workflow.stepById('schema');
    const fields = step ? StorageMetadataFields.render(view, step) : '';
    return renderNativeComponent(
      'StorageSchemaTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'schema'),
        Fields: fields,
        Operations: StorageSchemaOperations.render(view),
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
