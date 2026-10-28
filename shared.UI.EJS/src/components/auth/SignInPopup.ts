import { SIGN_IN_POPUP, type UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from '../common/popups/PopupBase.js';

/** One auth.signin instance; definition and CTX rules remain canonical in shared.UI.
 * UIS ownership: sign-in popup-specific tab/action wiring; credential and external-provider markup belongs to embedded children. */
export class SignInPopup extends PopupBase {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('auth.signin', SIGN_IN_POPUP, invocation, host);
  }
}
