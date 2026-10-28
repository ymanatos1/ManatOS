import { RESET_PASSWORD_POPUP, type UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from '../common/popups/PopupBase.js';

/** One auth.resetPassword instance; definition and CTX rules remain canonical in shared.UI.
 * UIS ownership: reset-password popup actions and validation, delegating inputs to embedded credentials. */
export class ResetPasswordPopup extends PopupBase {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('auth.resetPassword', RESET_PASSWORD_POPUP, invocation, host);
  }
}
