import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';

import type { UiPopupTabDefinition } from '@manatos/shared-ui';

import { type MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../surfaces/PopupContext';
import { PopupActions } from '../surfaces/PopupActions';

/**
 * Renders popup footer actions declared by shared.UI.
 *
 * The component neither owns enablement state nor duplicates
 * action-validation rules. It reads the PopupContext projection.
 *
 * Submit actions remain native submit buttons so Enter and
 * browser form validation preserve expected behavior.
 *
 * Other actions are routed through the popup runtime.
 */
/** UIS ownership: native popup action activation and busy/validation guards, delegating transitions to popup runtime. */
@Component({
  selector: 'manatos-auth-popup-actions',
  standalone: true,
  imports: [PopupActions],
  templateUrl: './AuthPopupActions.html',
  styleUrls: ['./AuthPopup.css', './RegisterPopup.css'],
})
export class AuthPopupActions {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly tab = input.required<UiPopupTabDefinition>();
  readonly popup = input.required<PopupContext>();
  readonly language = input<MetadataLanguage>('EN');

  readonly actionRequested = output<string>();

  protected requestAction(id: string, type: string): void {
    if (type !== 'submit') this.actionRequested.emit(id);
  }
}
