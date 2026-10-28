import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted telephone control; HTML resides in TelephoneField.html.
 * UIS ownership: this Telephone Field selects its own HTML and refreshes the telephone control from prepared presentation; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class TelephoneField extends EntryFieldComponent {
  static readonly type = 'telephone' as const;
  readonly templateName = 'TelephoneField';

  constructor(root: HTMLElement) {
    super(root);
  }

  override update(field: UiEntryFieldPresentation): void {
    const root = this.root;
    const control = root.querySelector<HTMLElement>('[data-entry-control]');
    if (!control) return;
    const text = this.displayText(field);
    const display = text || '—';
    if (control instanceof HTMLInputElement) {
      if (control.value !== text) control.value = text;
    } else if (control.textContent !== display) control.textContent = display;
  }
}
