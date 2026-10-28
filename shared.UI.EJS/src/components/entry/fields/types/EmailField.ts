import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted email control; HTML resides in EmailField.html.
 * UIS ownership: this Email Field selects its own HTML and refreshes the email-address control from prepared presentation; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class EmailField extends EntryFieldComponent {
  static readonly type = 'email' as const;
  readonly templateName = 'EmailField';

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
