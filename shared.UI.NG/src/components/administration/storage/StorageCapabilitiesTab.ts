import { Component } from '@angular/core';
import type { UiPopupFeatureContentDefinition } from '@manatos/shared-ui';
import { StorageTabBase } from './StorageTabBase';
import { StorageTabStatus } from './StorageTabStatus';

/** Read-only capability metadata; category navigation remains enabled for Superusers. */
@Component({
  selector: 'manatos-storage-capabilities-tab',
  standalone: true,
  imports: [StorageTabStatus],
  styleUrls: ['./StorageTabBody.css', './StorageCapabilitiesTab.css'],
  templateUrl: './StorageCapabilitiesTab.html',
})
export class StorageCapabilitiesTab extends StorageTabBase {
  static layout(): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      {
        id: 'storage-capabilities-body',
        kind: 'feature-content',
        children: [
          { id: 'storage-capabilities-categories', kind: 'feature-content' },
          { id: 'storage-capabilities-table', kind: 'feature-content' },
        ],
      },
    ];
  }
}
