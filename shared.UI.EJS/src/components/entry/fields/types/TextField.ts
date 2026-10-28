import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted string control; HTML resides in TextField.html.
 * UIS ownership: this Text Field selects its own HTML and refreshes the canonical single-line text input; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class TextField extends EntryFieldComponent {
  static readonly type = 'string' as const;
  readonly templateName = 'TextField';

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
