import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';

/**
 * Select one native single-line input, not a textarea; its HTML explicitly owns type,
 * value and read-only bindings. Generic native events are opt-in on that input, while
 * normalization/dispatch belongs to NativeFieldInteraction and state mutation stays in
 * EntryRuntime.
 * Debug: TextField.html single-line input -> NativeFieldInteraction.forward() -> EntryRuntime.
 */
@Component({
  selector: 'manatos-text-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './TextField.html',
})
export class TextField extends EntryFieldRendererBase {
  // The native input type is part of this concrete Field component, not FormField.
  protected readonly nativeInputType = 'text' as const;
}
