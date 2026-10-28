import { Directive, ElementRef, inject, input } from '@angular/core';
import {
  dispatchUiNativeComponentEvent,
  uiNativeFieldInteraction,
  type UiEntryFieldPresentation,
} from '@manatos/shared-ui';
import { EntryContext } from '../entry/EntryContext';

/**
 * Generic native -> UIS event TRANSPORT, deliberately opt-in on an actual
 * input/select in each concrete Field HTML via [manatosNativeFieldInteraction].
 * The typed component owns WHICH control exists; the shared adapter owns HOW
 * standard keyboard, focus, pointer and value events are normalized and routed.
 * Do not mount this directive on the Field shell, passive previews, or credential
 * inputs: it would obscure concrete ownership or leak Auth-sensitive information.
 * Breakpoint: forward() before uiNativeFieldInteraction / EntryContext dispatch.
 */
@Directive({
  selector: '[manatosNativeFieldInteraction]',
  standalone: true,
  host: {
    '(input)': 'forward($event)',
    '(change)': 'forward($event)',
    '(keydown)': 'forward($event)',
    '(keyup)': 'forward($event)',
    '(click)': 'forward($event)',
    '(focusin)': 'forward($event)',
    '(focusout)': 'forward($event)',
    '(pointerdown)': 'forward($event)',
    '(pointerup)': 'forward($event)',
  },
})
export class NativeFieldInteraction {
  readonly manatosNativeFieldInteraction = input.required<UiEntryFieldPresentation>();
  private readonly entry = inject(EntryContext);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected forward(native: Event): void {
    const facts = uiNativeFieldInteraction(native);
    if (!facts) return;
    const field = this.manatosNativeFieldInteraction();
    if (facts.type === 'control-input' && field.readOnly) return;
    const tab = this.element.nativeElement.closest<HTMLElement>('[data-entry-tab-index]');
    const index = tab ? Number(tab.dataset['entryTabIndex']) : NaN;
    dispatchUiNativeComponentEvent(native, field.field, facts, (_target, interaction) =>
      this.entry.dispatchFieldInteraction(
        field.field,
        interaction,
        field.layoutId,
        Number.isInteger(index) && index >= 0 ? index : undefined,
      ),
    );
  }
}
