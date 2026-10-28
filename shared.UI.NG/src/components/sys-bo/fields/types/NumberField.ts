import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';

/**
 * The browser number control supplies numeric input affordances. This renderer chooses the
 * native type; NumberFieldBehavior remains the canonical numeric parser/validator. The
 * input explicitly opts into common DOM transport rather than a forwarding-only method.
 * Debug: NumberField.html numeric input -> NativeFieldInteraction.forward() -> NumberFieldBehavior.
 */
@Component({
  selector: 'manatos-number-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './NumberField.html',
})
export class NumberField extends EntryFieldRendererBase {
  // The native input type is part of this concrete Field component, not FormField.
  protected readonly nativeInputType = 'number' as const;
}
