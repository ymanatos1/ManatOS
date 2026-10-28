import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';

/**
 * The browser tel input is a native affordance, not a second telephone validator. The real
 * input opts into shared event transport; canonical text/telephone rules and #data.current
 * changes stay in the semantic Field and EntryRuntime.
 * Debug: TelephoneField.html tel input -> NativeFieldInteraction.forward().
 */
@Component({
  selector: 'manatos-telephone-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './TelephoneField.html',
})
export class TelephoneField extends EntryFieldRendererBase {
  // The native input type is part of this concrete Field component, not FormField.
  protected readonly nativeInputType = 'tel' as const;
}
