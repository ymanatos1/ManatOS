import { REGISTER_POPUP, type UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from '../common/popups/PopupBase.js';

/** One auth.register instance; definition and CTX rules remain canonical in shared.UI.
 * UIS ownership: registration popup tabs/method transitions, not direct credential state storage. */
export class RegisterPopup extends PopupBase {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('auth.register', REGISTER_POPUP, invocation, host);
  }
}
