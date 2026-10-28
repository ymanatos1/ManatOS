import { EntryFieldComponent } from '../EntryFieldComponent.js';
import {
  uiDurationParts,
  uiDurationFromParts,
  type UiEntryFieldPresentation,
  type UiEmbeddedInteractionEvent,
} from '@manatos/shared-ui';

/** One independently mounted duration control; HTML resides in DurationField.html.
 * UIS ownership: this Duration Field selects its own HTML and sets the years/months/days controls from the canonical duration representation; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class DurationField extends EntryFieldComponent {
  static readonly type = 'duration' as const;
  readonly templateName = 'DurationField';

  constructor(root: HTMLElement) {
    super(root);
  }

  override update(field: UiEntryFieldPresentation): void {
    const root = this.root;
    const parts = uiDurationParts(field.value);
    const years = root.querySelector<HTMLInputElement>('[data-duration-part="years"]');
    if (years) {
      years.readOnly = field.readOnly;
      if (years.value !== parts.years && years.ownerDocument.activeElement !== years)
        years.value = parts.years;
    }
    const months = root.querySelector<HTMLInputElement>('[data-duration-part="months"]');
    if (months) {
      months.readOnly = field.readOnly;
      if (months.value !== parts.months && months.ownerDocument.activeElement !== months)
        months.value = parts.months;
    }
    const days = root.querySelector<HTMLInputElement>('[data-duration-part="days"]');
    if (days) {
      days.readOnly = field.readOnly;
      if (days.value !== parts.days && days.ownerDocument.activeElement !== days)
        days.value = parts.days;
    }
  }

  protected override nativeInteraction(native: Event): UiEmbeddedInteractionEvent | null {
    const target = native.target;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute('data-duration-part'))
      return super.nativeInteraction(native);
    if (native.type !== 'input' || target.readOnly || target.disabled) return null;
    const part = (name: string): string =>
      this.root.querySelector<HTMLInputElement>(`[data-duration-part="${name}"]`)?.value ?? '';
    const value = uiDurationFromParts({
      years: part('years'),
      months: part('months'),
      days: part('days'),
    });
    return value === undefined
      ? null
      : { type: 'control-input', control: 'duration', value: value ?? '' };
  }
}
