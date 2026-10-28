import { PopupFooterActions } from './PopupFooterActions';
/** UIS boundary: The dirty-close decision is a separate popup with named title/body/actions; only the owner of the original Surface commits close or discard. This ownership separation is intentional; preserve it in future migrations. */
import { Component } from '@angular/core';
import { UNSAVED_CHANGES_POPUP, type UiPopupDefinition } from '@manatos/shared-ui';
import { PopupTitle } from '../../surfaces/PopupTitle';
import { AuthPopupActions } from '../../auth/AuthPopupActions';
import { PopupBodyOutlet } from './PopupBodyOutlet';

import { PopupBase } from './PopupBase';

@Component({
  selector: 'manatos-unsaved-changes-popup',
  standalone: true,
  imports: [PopupTitle, AuthPopupActions, PopupBodyOutlet, PopupFooterActions],
  templateUrl: './Popup.html',
  styleUrls: ['../../auth/AuthPopup.css', '../../auth/RegisterPopup.css'],
})
export class UnsavedChangesPopup extends PopupBase {
  protected readonly definition: UiPopupDefinition = UNSAVED_CHANGES_POPUP;
}
