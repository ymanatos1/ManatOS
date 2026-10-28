import type { UiPopupFeatureContentDefinition } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import { type StorageView, StorageTabStatus, StorageCapabilities } from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageCapabilitiesTab {
  readonly id = 'capabilities';
  static layout(): UiPopupFeatureContentDefinition[] {
    return [...StorageTabStatus.layout(), ...StorageCapabilities.layout()];
  }
  render(view: StorageView): string {
    return renderNativeComponent(
      'StorageCapabilitiesTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'capabilities'),
        Capabilities: StorageCapabilities.render(view),
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
