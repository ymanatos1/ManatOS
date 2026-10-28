import { PopupFooterActions } from './PopupFooterActions';
/** UIS boundary: This named popup declares the standard title/body/actions markup and delegates lifecycle to MessagePopup; do not inline Message bodies into the generic host. This ownership separation is intentional; preserve it in future migrations. */
import { Component } from '@angular/core';
import { PopupTitle } from '../../surfaces/PopupTitle';
import { AuthPopupActions } from '../../auth/AuthPopupActions';
import { PopupBodyOutlet } from './PopupBodyOutlet';

import { MessagePopup } from './MessagePopup';

/** A semantic Alert/Info surface with the standard OK action. */
@Component({
  selector: 'manatos-alert-popup',
  standalone: true,
  imports: [PopupTitle, AuthPopupActions, PopupBodyOutlet, PopupFooterActions],
  templateUrl: './Popup.html',
  styleUrls: ['../../auth/AuthPopup.css', '../../auth/RegisterPopup.css'],
})
export class AlertPopup extends MessagePopup {
  protected readonly kind = 'message.alert' as const;
}
