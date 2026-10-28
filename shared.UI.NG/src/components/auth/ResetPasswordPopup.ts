import { PopupFooterActions } from '../common/popups/PopupFooterActions';
import { Component } from '@angular/core';
import { RESET_PASSWORD_POPUP, type UiPopupDefinition } from '@manatos/shared-ui';
import { PopupTitle } from '../surfaces/PopupTitle';
import { AuthPopupActions } from './AuthPopupActions';
import { PopupBase } from '../common/popups/PopupBase';

import { PopupBodyOutlet } from '../common/popups/PopupBodyOutlet';

/** Uses the same canonical semantic popup and modal lifetime as Sign In.
 * UIS ownership: reset-password popup actions and validation, delegating inputs to embedded credentials. */
@Component({
  selector: 'manatos-reset-password-popup',
  standalone: true,
  imports: [PopupTitle, PopupBodyOutlet, AuthPopupActions, PopupFooterActions],
  templateUrl: '../common/popups/Popup.html',
  styleUrls: ['./AuthPopup.css', './RegisterPopup.css'],
})
export class ResetPasswordPopup extends PopupBase {
  protected readonly definition: UiPopupDefinition = RESET_PASSWORD_POPUP;
}
