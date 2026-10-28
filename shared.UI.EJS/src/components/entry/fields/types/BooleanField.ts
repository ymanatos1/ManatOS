import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted boolean control; HTML resides in BooleanField.html.
 * UIS ownership: this Boolean Field selects its own HTML and sets the native checked state without treating it as text; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class BooleanField extends EntryFieldComponent {
  static readonly type = 'boolean' as const;
  readonly templateName = 'BooleanField';

  constructor(root: HTMLElement) {
    super(root);
  }

  override update(field: UiEntryFieldPresentation): void {
    const root = this.root;
    const input = root.querySelector<HTMLInputElement>('[data-entry-control]');
    if (input) input.checked = field.value === true || field.value === 'true';
  }
}
