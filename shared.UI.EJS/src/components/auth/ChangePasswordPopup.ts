import { CHANGE_PASSWORD_POPUP, type UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from '../common/popups/PopupBase.js';

/** EJS adapter over the shared authenticated-password-change definition.
 * UIS ownership: current/new-password flow and popup-owned action guards, not secret projections into CTX. */
export class ChangePasswordPopup extends PopupBase {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('auth.changePassword', CHANGE_PASSWORD_POPUP, invocation, host);
  }
}
