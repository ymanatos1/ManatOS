import { Component, computed, input, output } from '@angular/core';
import { multilingual, type UiPopupActionDefinition } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../../surfaces/PopupContext';
import { PopupActions } from '../../surfaces/PopupActions';

/** One popup-level footer, independent of tab content and domain semantics. */
@Component({
  selector: 'manatos-popup-footer-actions',
  standalone: true,
  imports: [PopupActions],
  templateUrl: './PopupFooterActions.html',
  styleUrls: ['../../auth/AuthPopup.css', '../../auth/RegisterPopup.css'],
})
export class PopupFooterActions {
  readonly popup = input.required<PopupContext>();
  readonly actions = input.required<readonly UiPopupActionDefinition[]>();
  readonly language = input<MetadataLanguage>('EN');
  readonly dirty = input(false);
  readonly saveMode = input<'create' | 'update'>('create');
  readonly actionRequested = output<string>();

  protected readonly text = computed(() => multilingual(this.language(), []));

  protected actionLabel(action: UiPopupActionDefinition): string {
    if (action.id === 'cancel') {
      return this.text().resolve(
        this.dirty() ? { EN: 'Cancel', EL: 'Άκυρον' } : { EN: 'Close', EL: 'Κλείσιμο' },
      );
    }
    if (action.id === 'save') {
      return this.text().resolve(
        this.saveMode() === 'create'
          ? { EN: 'Create', EL: 'Δημιουργία' }
          : { EN: 'Update', EL: 'Ενημέρωση' },
      );
    }
    return this.text().resolve(action.label);
  }
}
