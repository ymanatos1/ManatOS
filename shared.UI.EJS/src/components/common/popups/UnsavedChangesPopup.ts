/** UIS boundary: The dirty-close decision is a separate popup with named title/body/actions; only the owner of the original Surface commits close or discard. This ownership separation is intentional; preserve it in future migrations. */
import { UNSAVED_CHANGES_POPUP, type UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from './PopupBase.js';

export class UnsavedChangesPopup extends PopupBase {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('semantic.unsavedChanges', UNSAVED_CHANGES_POPUP, invocation, host);
  }
}
