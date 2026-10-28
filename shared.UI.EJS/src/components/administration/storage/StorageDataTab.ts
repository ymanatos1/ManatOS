import type { UiPopupFeatureContentDefinition, UiStorageSnapshot } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import { type StorageView, StorageMetadataFields, StorageTabStatus, e, t } from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageDataTab {
  readonly id = 'data';
  static layout(snapshot: UiStorageSnapshot): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      StorageMetadataFields.layout(snapshot, 'data'),
      { id: 'storage-data-operations', kind: 'feature-content' },
    ];
  }
  render(view: StorageView): string {
    const step = view.workflow.stepById('data');
    const fields = step ? StorageMetadataFields.render(view, step) : '';
    return renderNativeComponent(
      'StorageDataTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'data'),
        Fields: fields,
        Operations: `<div class="alert alert-info" data-popup-layout-id="storage-data-operations">${e(t(view, 'Data migration is not implemented. Configuration and readiness checks are available.', 'Η μεταφορά δεδομένων δεν έχει υλοποιηθεί. Διατίθενται ρυθμίσεις και έλεγχοι ετοιμότητας.'))}</div>`,
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
