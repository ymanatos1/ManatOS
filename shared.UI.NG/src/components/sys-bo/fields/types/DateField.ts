import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';
import { uiDateInputValue } from '@manatos/shared-ui';

/**
 * The date-only input explicitly owns a local date string; uiDateInputValue projects its
 * browser value without timezone conversion. The native transport is declared on the
 * input, not on the wrapper; canonical parsing stays in DateFieldBehavior.
 * Debug: dateValue() -> date input -> NativeFieldInteraction.forward() -> DateFieldBehavior.
 */
@Component({
  selector: 'manatos-date-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './DateField.html',
})
export class DateField extends EntryFieldRendererBase {
  protected dateValue(): string {
    return uiDateInputValue(this.field().value);
  }
}
