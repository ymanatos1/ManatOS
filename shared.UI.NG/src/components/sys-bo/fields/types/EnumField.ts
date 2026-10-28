import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { Component, signal } from '@angular/core';
import { TransientMenuDirective } from '../../../../runtime/surfaces/TransientMenu';

/** Enum/inline options share one metadata projection and one native select.
 * The rich option buttons only choose a value; they dispatch a native select
 * change through the existing directive. No second state or CTX writer.
 */
@Component({
  selector: 'manatos-enum-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction, TransientMenuDirective],
  templateUrl: './EnumField.html',
})
export class EnumField extends EntryFieldRendererBase {
  protected readonly expanded = signal(false);
  protected readonly dismissMenu = (): void => this.close();
  protected selected() {
    const current = String(this.field().value ?? '');
    return this.field().options?.find((option) => option.value === current);
  }
  protected iconClass(icon?: string): string {
    return icon && /^[a-z][a-z0-9-]*$/.test(icon) ? `bi bi-${icon}` : '';
  }
  protected toggle(): void {
    if (!this.field().readOnly && this.field().options?.length)
      this.expanded.update((value) => !value);
  }
  protected choose(value: string, select: HTMLSelectElement): void {
    if (this.field().readOnly || !this.field().options?.some((option) => option.value === value))
      return;
    this.expanded.set(false);
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  protected close(): void {
    this.expanded.set(false);
  }
}
