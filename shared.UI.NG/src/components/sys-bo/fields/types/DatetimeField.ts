import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';
import { uiDatetimeInputValue } from '@manatos/shared-ui';

/**
 * The datetime-local input must retain local-wall-time semantics. This component selects
 * that native control and projects its value; the shared transport dispatches native
 * events, while canonical normalization is downstream. Do not coerce through UTC in the
 * renderer.
 * Debug: dateTimeValue() -> datetime-local -> NativeFieldInteraction.forward().
 */
@Component({
  selector: 'manatos-datetime-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './DatetimeField.html',
})
export class DatetimeField extends EntryFieldRendererBase {
  protected dateTimeValue(): string {
    return uiDatetimeInputValue(this.field().value);
  }
}
