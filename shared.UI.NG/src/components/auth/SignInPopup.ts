import { PopupFooterActions } from '../common/popups/PopupFooterActions';
import { Component } from '@angular/core';

import { SIGN_IN_POPUP, type UiPopupDefinition } from '@manatos/shared-ui';

import { PopupTitle } from '../surfaces/PopupTitle';
import { AuthPopupActions } from './AuthPopupActions';
import { PopupBase } from '../common/popups/PopupBase';
import { PopupContext } from '../surfaces/PopupContext';

import { PopupBodyOutlet } from '../common/popups/PopupBodyOutlet';

/**
 * Sign-in popup using shared.UI's semantic definition.
 *
 * All popup structure, inputs, rules, actions and initial tab
 * are declared in SIGN_IN_POPUP.
 *
 * Common Angular lifecycle and rendering are inherited from
 * PopupBase. This class introduces no competing state.
 */
/** UIS ownership: sign-in popup-specific tab/action wiring; credential and external-provider markup belongs to embedded children. */
@Component({
  selector: 'manatos-sign-in-popup',
  standalone: true,
  imports: [PopupTitle, PopupBodyOutlet, AuthPopupActions, PopupFooterActions],
  templateUrl: '../common/popups/Popup.html',
  styleUrls: ['./AuthPopup.css', './RegisterPopup.css'],
})
export class SignInPopup extends PopupBase {
  protected readonly definition: UiPopupDefinition = SIGN_IN_POPUP;
  /** Flow-mapped submission stays with the caller; only legacy local sign-in runs here. */
  protected override onPopupAction(popup: PopupContext, actionId: string): void {
    if (actionId === 'signin' && !popup.level().control.flow?.events.signin)
      void this.performLocalSignIn(popup);
    if (actionId === 'sendInstructions' && !popup.level().control.flow?.events.sendInstructions)
      popup.setNotice(
        'Password recovery is not connected in NG1 yet. No instructions have been sent.',
      );
  }

  private async performLocalSignIn(popup: PopupContext): Promise<void> {
    if (!popup.rule('canSubmit') || popup.busy()) return;
    const signIn = this.signInHandler();
    const values = this.readSignInCredentials();
    if (!signIn || !values) {
      popup.setNotice('Enter your user name/email and password.');
      return;
    }
    popup.setNotice(null);
    popup.setBusy(true);
    try {
      await signIn(values.identity, values.password);
      if (this.popupContext() === popup) {
        popup.setBusy(false);
        this.close();
      }
    } catch (error) {
      if (this.popupContext() === popup)
        popup.setNotice(error instanceof Error ? error.message : 'Sign in was not completed.');
    } finally {
      if (this.popupContext() === popup) popup.setBusy(false);
    }
  }
}
