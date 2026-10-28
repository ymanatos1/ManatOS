import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import {
  type StorageView,
  StorageMetadataFields,
  StorageTabStatus,
  StorageDatabaseOperations,
} from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageDatabaseTab {
  readonly id = 'database';
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'database'),
      { id: 'storage-database-operations', kind: 'feature-content' },
    ];
  }
  render(view: StorageView): string {
    const step = view.workflow.stepById('database');
    const fields = step
      ? StorageMetadataFields.render(view, step, [view.workflow.databaseField?.key ?? ''])
      : '';
    return renderNativeComponent(
      'StorageDatabaseTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'database'),
        Fields: fields,
        Operations: StorageDatabaseOperations.render(view),
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
