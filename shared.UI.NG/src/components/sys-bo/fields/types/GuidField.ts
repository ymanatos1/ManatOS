import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';

/**
 * The identifier is displayed in a fixed read-only input even when the Entry itself is
 * editable. This is identity presentation, not a text editor. The actual input declares
 * generic focus/keyboard transport; changing GUID requires an explicit semantic contract,
 * not an event handler in the shell.
 * Debug: GuidField.html read-only input; inspect identityReadOnly, not a change handler.
 */
@Component({
  selector: 'manatos-guid-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './GuidField.html',
})
export class GuidField extends EntryFieldRendererBase {
  // Identifiers are never directly writable through the native Field input,
  // independently of a surrounding Entry Surface's edit mode.
  protected readonly identityReadOnly = true;
}
