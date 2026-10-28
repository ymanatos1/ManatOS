import { EntryFieldComponent } from '../EntryFieldComponent.js';
import { uiDatetimeInputValue, type UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted datetime control; HTML resides in DatetimeField.html.
 * UIS ownership: this Datetime Field selects its own HTML and refreshes the date-and-time control without determining API timezone policy; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class DatetimeField extends EntryFieldComponent {
  static readonly type = 'datetime' as const;
  readonly templateName = 'DatetimeField';

  constructor(root: HTMLElement) {
    super(root);
  }

  override update(field: UiEntryFieldPresentation): void {
    const root = this.root;
    const input = root.querySelector<HTMLInputElement>('[data-entry-control]');
    if (input) input.value = uiDatetimeInputValue(field.value);
  }
}
