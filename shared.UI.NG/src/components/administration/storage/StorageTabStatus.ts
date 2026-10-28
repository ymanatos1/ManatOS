import { Component, input } from '@angular/core';
import type { UiPopupFeatureContentDefinition, UiStorageTab } from '@manatos/shared-ui';
import type { PopupContext } from '../../surfaces/PopupContext';
import { StorageWizardState } from './StorageWizardState';

/** Shared workflow feedback; the concrete tab still owns its semantic children. */
@Component({
  selector: 'manatos-storage-tab-status',
  standalone: true,
  templateUrl: './StorageTabStatus.html',
})
export class StorageTabStatus {
  readonly wizard = input.required<StorageWizardState>();
  readonly popup = input.required<PopupContext>();
  readonly step = input.required<UiStorageTab>();
  readonly footer = input(false);

  static layout(): UiPopupFeatureContentDefinition[] {
    return [
      { id: 'storage-tab-notices', kind: 'feature-content' },
      { id: 'storage-workflow-state', kind: 'feature-content' },
    ];
  }
}
