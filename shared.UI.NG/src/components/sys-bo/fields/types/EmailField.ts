import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';

/**
 * This native email input requests browser email affordances; the canonical FieldBehavior,
 * not this renderer, owns validation and record mutation. Its HTML opts into generic
 * native transport on the real input, never through FieldControlShell.
 * Debug: EmailField.html input -> NativeFieldInteraction.forward() -> semantic FieldBehavior.
 */
@Component({
  selector: 'manatos-email-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './EmailField.html',
})
export class EmailField extends EntryFieldRendererBase {
  // The native input type is part of this concrete Field component, not FormField.
  protected readonly nativeInputType = 'email' as const;
}
