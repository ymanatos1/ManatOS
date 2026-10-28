import { PopupFooterActions } from '../common/popups/PopupFooterActions';
import { Component } from '@angular/core';
import { CHANGE_PASSWORD_POPUP, type UiPopupDefinition } from '@manatos/shared-ui';
import { PopupTitle } from '../surfaces/PopupTitle';
import { AuthPopupActions } from './AuthPopupActions';
import { PopupBase } from '../common/popups/PopupBase';

import { PopupBodyOutlet } from '../common/popups/PopupBodyOutlet';

/** The standard semantic popup runtime, with native-only password credentials.
 * UIS ownership: current/new-password flow and popup-owned action guards, not secret projections into CTX. */
@Component({
  selector: 'manatos-change-password-popup',
  standalone: true,
  imports: [PopupTitle, PopupBodyOutlet, AuthPopupActions, PopupFooterActions],
  templateUrl: '../common/popups/Popup.html',
  styleUrls: ['./AuthPopup.css', './RegisterPopup.css'],
})
export class ChangePasswordPopup extends PopupBase {
  protected readonly definition: UiPopupDefinition = CHANGE_PASSWORD_POPUP;
}
