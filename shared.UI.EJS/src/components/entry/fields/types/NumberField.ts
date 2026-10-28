import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted number control; HTML resides in NumberField.html.
 * UIS ownership: this Number Field selects its own HTML and refreshes the formatted numeric value; decoding remains in FieldBehavior; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class NumberField extends EntryFieldComponent {
  static readonly type = 'number' as const;
  readonly templateName = 'NumberField';

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
