import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { Component } from '@angular/core';

/**
 * Present untrusted rich content as text only; never bind decoded text to innerHTML or
 * create an editor by accident. This preview has no editable control, so no simulated
 * native event method is justified.
 * Debug: safePreviewText() -> RichTextField.html [textContent] safe binding.
 */
@Component({
  selector: 'manatos-richtext-field',
  standalone: true,
  imports: [FieldControlShell],
  templateUrl: './RichTextField.html',
})
export class RichTextField extends EntryFieldRendererBase {
  // Native preview binds through textContent: never interpolate the value
  // as trusted innerHTML or bypass canonical rich-text sanitization policy.
  protected safePreviewText(): string {
    return this.displayText() || '—';
  }
}
