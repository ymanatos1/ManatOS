import { PopupFooterActions } from '../common/popups/PopupFooterActions';
import { Component } from '@angular/core';

import { REGISTER_POPUP, type UiPopupDefinition } from '@manatos/shared-ui';

import { PopupTitle } from '../surfaces/PopupTitle';
import { AuthPopupActions } from './AuthPopupActions';
import { PopupBase } from '../common/popups/PopupBase';
import { PopupContext } from '../surfaces/PopupContext';

import { PopupBodyOutlet } from '../common/popups/PopupBodyOutlet';

/**
 * Registration popup with two hidden tabs sharing one CTX level.
 *
 * Methods and Email tabs, content and actions are taken from the
 * shared.UI REGISTER_POPUP definition.
 *
 * The common Angular host owns rendering, focus, lifecycle and
 * disposal. No second registration state model is introduced.
 */
/** UIS ownership: registration popup tabs/method transitions, not direct credential state storage. */
@Component({
  selector: 'manatos-register-popup',
  standalone: true,
  imports: [PopupTitle, PopupBodyOutlet, AuthPopupActions, PopupFooterActions],
  templateUrl: '../common/popups/Popup.html',
  styleUrls: ['./AuthPopup.css', './RegisterPopup.css'],
})
export class RegisterPopup extends PopupBase {
  protected readonly definition: UiPopupDefinition = REGISTER_POPUP;
  protected override onPopupOpened(popup: PopupContext, opening: number): void {
    if (!popup.level().control.flow) void this.loadPublicProviders(popup, opening);
  }

  /** Resource ownership is declarative; this adapter only invokes host transport. */
  private async loadPublicProviders(popup: PopupContext, opening: number): Promise<void> {
    const loader = this.externalProvidersLoader();
    if (!loader) {
      popup.setResourceStatus(
        'externalAuthProviders',
        'error',
        'External providers could not be loaded.',
      );
      return;
    }
    popup.setResourceStatus('externalAuthProviders', 'loading');
    try {
      const providers = await loader();
      if (!this.isCurrentOpening(popup, opening)) return;
      popup.setResource('externalAuthProviders', providers);
      popup.setResourceStatus('externalAuthProviders', 'ready');
    } catch {
      if (this.isCurrentOpening(popup, opening))
        popup.setResourceStatus(
          'externalAuthProviders',
          'error',
          'External providers could not be loaded.',
        );
    }
  }
}
