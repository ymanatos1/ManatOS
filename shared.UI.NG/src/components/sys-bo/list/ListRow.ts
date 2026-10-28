import { Component, inject, input, output } from '@angular/core';
import { ListContext } from './ListContext';
import type { MetadataLanguage } from '@manatos/shared';
import type { UiListColumn, UiFieldReferences } from '@manatos/shared-ui';
import { ListCell } from './ListCell';
/** Each row and its cells share #data.list[index] as their flat expression scope.
 * UIS ownership: one row and the ordered Cell children for the selected view; do not move cell ownership to List. */
@Component({
  selector: 'manatos-list-row',
  standalone: true,
  imports: [ListCell],
  host: {
    class: 'manatos-list-row',
    role: 'row',
    'data-list-layout': 'ListRow',
    '[attr.data-list-row-index]': 'index()',
    '[class.manatos-list-selectable-row]': 'selectable()',
    '[attr.aria-selected]': 'selectable() ? selected() : null',
    '[attr.tabindex]': 'selectable() ? 0 : null',
    '(click)': 'choose($event)',
    '(dblclick)': 'confirm($event)',
    '(keydown.enter)': 'choose($event)',
    '(keydown.space)': 'choose($event)',
  },
  templateUrl: './ListRow.html',
})
export class ListRow {
  readonly index = input.required<number>();
  protected readonly context = inject(ListContext, { optional: true });
  readonly embeddedRow = input<Readonly<Record<string, unknown>> | null>(null);
  readonly embeddedColumns = input<readonly UiListColumn[] | null>(null);
  readonly embeddedEntityKey = input('');
  readonly embeddedLanguage = input<MetadataLanguage>('EN');
  readonly embeddedReferences = input<UiFieldReferences>({});
  readonly rowSelected = output<string>();
  readonly rowConfirmed = output<string>();
  protected selectable(): boolean {
    return (
      this.embeddedRow() === null &&
      (this.context?.level()?.state.list.selectionMode ?? 'none') !== 'none'
    );
  }
  protected selected(): boolean {
    const level = this.context?.level();
    const id = level?.data.list[this.index()]?.['id'];
    return typeof id === 'string' && Boolean(level?.data.listModel.selectedIds.includes(id));
  }
  protected confirm(event: MouseEvent): void {
    if (this.embeddedRow() !== null || this.context?.level()?.control.host !== 'popup') return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, select, textarea')) return;
    const row = this.context?.level()?.data.list[this.index()];
    const id = row?.['id'];
    if (!this.selectable() || typeof id !== 'string') return;
    // Route through the same selection/validation as the popup's Select button.
    if (target instanceof Element && target.closest('a')) event.preventDefault();
    this.rowConfirmed.emit(id);
  }
  protected choose(event: Event): void {
    if (!this.selectable()) return;
    const target = event.target;
    if (target instanceof Element && target !== (event.currentTarget as Element)) {
      const interactive = target.closest('a, button, input, select, textarea');
      if (interactive) {
        // In a selector popup the whole row, including its display link, selects.
        // Ordinary List-page links keep their usual navigation behavior.
        if (interactive.tagName !== 'A' || this.context?.level()?.control.host !== 'popup') return;
        event.preventDefault();
      }
    }
    const row = this.context?.level()?.data.list[this.index()];
    const id = row?.['id'];
    if (typeof id !== 'string') return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    this.rowSelected.emit(id);
  }
}
