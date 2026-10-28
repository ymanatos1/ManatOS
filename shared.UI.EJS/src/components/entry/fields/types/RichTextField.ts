import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted richText control; HTML resides in RichTextField.html.
 * UIS ownership: this RichText Field selects its own HTML and refreshes rich-text controls without injecting untrusted HTML; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class RichTextField extends EntryFieldComponent {
  static readonly type = 'richText' as const;
  readonly templateName = 'RichTextField';

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
