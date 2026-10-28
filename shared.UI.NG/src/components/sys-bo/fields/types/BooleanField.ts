import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component } from '@angular/core';

/**
 * The checkbox owns checked-state presentation (not a text value). Native
 * change/keyboard/focus events go through the visibly attached UIS transport directive;
 * BooleanFieldBehavior and EntryRuntime remain responsible for canonical edits. Never
 * place checkbox interpretation in FieldControlShell.
 * Debug: isChecked() -> BooleanField.html checkbox -> NativeFieldInteraction.forward().
 */
@Component({
  selector: 'manatos-boolean-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction],
  templateUrl: './BooleanField.html',
})
export class BooleanField extends EntryFieldRendererBase {
  // A boolean is a checked state, not the string representation of a value.
  protected isChecked(): boolean {
    const value = this.field().value;
    return value === true || value === 'true';
  }
}
