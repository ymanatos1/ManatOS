import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { Component, computed, inject } from '@angular/core';
import {
  dispatchUiNativeComponentEvent,
  uiDurationFromParts,
  uiDurationParts,
} from '@manatos/shared-ui';
import { EntryContext } from '../../entry/EntryContext';

/**
 * The three year/month/day controls are declared here as semantic parts, not as three
 * independent Entry fields. This control assembles one ISO duration and sends
 * typed intent to its registered UIS owner. The parts never become separate
 * #data values; generic event transport stays shared.
 */
@Component({
  selector: 'manatos-duration-field',
  standalone: true,
  imports: [FieldControlShell],
  templateUrl: './DurationField.html',
})
export class DurationField extends EntryFieldRendererBase {
  private readonly entry = inject(EntryContext);
  protected readonly parts = computed(() => uiDurationParts(this.field().value));

  protected onPartInput(native: Event): void {
    if (this.field().readOnly || !(native.target instanceof HTMLInputElement)) return;
    const container = native.target.closest<HTMLElement>('[data-entry-control]');
    if (!container) return;
    const valueOf = (part: string): string =>
      container.querySelector<HTMLInputElement>(`[data-duration-part="${part}"]`)?.value ?? '';
    const value = uiDurationFromParts({
      years: valueOf('years'),
      months: valueOf('months'),
      days: valueOf('days'),
    });
    if (value === undefined) return;
    const model = this.field();
    const tab = container.closest<HTMLElement>('[data-entry-tab-index]');
    const index = tab ? Number(tab.dataset['entryTabIndex']) : NaN;
    dispatchUiNativeComponentEvent(
      native,
      model.field,
      { type: 'control-input', control: 'duration', value: value ?? '' },
      (_path, facts) =>
        this.entry.dispatchFieldInteraction(
          model.field,
          facts,
          model.layoutId,
          Number.isInteger(index) && index >= 0 ? index : undefined,
        ),
    );
  }
}
