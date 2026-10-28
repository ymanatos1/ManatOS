import { EntryFieldComponent } from '../EntryFieldComponent.js';
import { uiDateInputValue, type UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted date control; HTML resides in DateField.html.
 * UIS ownership: this Date Field selects its own HTML and refreshes the date-only control from prepared presentation; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class DateField extends EntryFieldComponent {
  static readonly type = 'date' as const;
  readonly templateName = 'DateField';

  constructor(root: HTMLElement) {
    super(root);
  }

  override update(field: UiEntryFieldPresentation): void {
    const root = this.root;
    const input = root.querySelector<HTMLInputElement>('[data-entry-control]');
    if (input) input.value = uiDateInputValue(field.value);
  }
}
