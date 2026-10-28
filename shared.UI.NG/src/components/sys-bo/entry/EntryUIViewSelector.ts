import { Component, HostListener, computed, input, output, signal } from '@angular/core';
import type { UiEntryUIViewOption } from '@manatos/shared-ui';

/** Caption-owned control; selected view and mode remain owned by the Entry runtime. */
@Component({
  selector: 'manatos-entry-ui-view-selector',
  standalone: true,
  templateUrl: './EntryUIViewSelector.html',
})
export class EntryUIViewSelector {
  readonly views = input.required<readonly UiEntryUIViewOption[]>();
  readonly selected = input.required<string>();
  readonly language = input<'EN' | 'EL'>('EN');
  readonly busy = input(false);
  readonly error = input('');
  readonly selectedChange = output<string>();
  protected readonly open = signal(false);
  protected readonly selectedLabel = computed(
    () => this.views().find((option) => option.key === this.selected())?.label ?? this.selected(),
  );
  protected select(key: string): void {
    this.open.set(false);
    if (this.busy()) return;
    if (key !== this.selected()) this.selectedChange.emit(key);
  }
  protected toggle(): void {
    if (!this.busy()) this.open.update((value) => !value);
  }
  @HostListener('document:click', ['$event'])
  protected dismissOutside(event: MouseEvent): void {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('manatos-entry-ui-view-selector')
    )
      this.open.set(false);
  }
  @HostListener('document:keydown.escape')
  protected dismissEscape(): void {
    this.open.set(false);
  }
}
