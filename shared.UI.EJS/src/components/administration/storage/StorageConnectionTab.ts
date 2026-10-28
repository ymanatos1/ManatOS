import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import {
  type StorageView,
  StorageMetadataFields,
  StorageTabStatus,
  StorageConnectionOperations,
} from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageConnectionTab {
  readonly id = 'connection';
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'connection'),
      { id: 'storage-connection-operations', kind: 'feature-content' },
    ];
  }
  render(view: StorageView): string {
    const step = view.workflow.stepById('connection');
    const fields = step ? StorageMetadataFields.render(view, step) : '';
    return renderNativeComponent(
      'StorageConnectionTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'connection'),
        Fields: fields,
        Operations: StorageConnectionOperations.render(view),
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
