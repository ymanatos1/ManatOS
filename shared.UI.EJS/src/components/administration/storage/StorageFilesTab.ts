import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import { type StorageView, StorageMetadataFields, StorageTabStatus } from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageFilesTab {
  readonly id = 'files';
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [...StorageTabStatus.layout(), StorageMetadataFields.layout(snapshot, 'files')];
  }
  render(view: StorageView): string {
    const step = view.workflow.stepById('files');
    const fields = step ? StorageMetadataFields.render(view, step) : '';
    return renderNativeComponent(
      'StorageFilesTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'files'),
        Fields: fields,
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
