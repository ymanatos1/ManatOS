import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';

/** The only home for configuration identity and adapter selection. */
@Component({
  selector: 'manatos-storage-configuration-tab',
  standalone: true,
  imports: [StorageTabStatus],
  styleUrls: ['./StorageTabBody.css'],
  templateUrl: './StorageConfigurationTab.html',
})
export class StorageConfigurationTab extends StorageTabBase {
  static layout(): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      {
        id: 'storage-configuration-form',
        kind: 'feature-content',
        children: [
          { id: 'storage-name', kind: 'feature-content' },
          { id: 'storage-adapter', kind: 'feature-content' },
        ],
      },
    ];
  }
}
