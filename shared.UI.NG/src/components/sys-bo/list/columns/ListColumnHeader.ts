import { Component, input, inject } from '@angular/core';
import { ListContext } from '../ListContext';

/**
 * Angular ColumnHeader exposes the caption, icon and sort binding in its template. It
 * dispatches sort only when sortable metadata allows it. Debug: sort() and
 * ListColumnHeader.html; do not move this decision into ColumnsRow.
 */
@Component({
  selector: 'manatos-list-column-header',
  standalone: true,
  templateUrl: './ListColumnHeader.html',
})
export class ListColumnHeader {
  protected readonly context = inject(ListContext, { optional: true });
  readonly field = input.required<string>();
  readonly sortable = input(false);
  protected sort(): void {
    if (this.sortable()) this.context?.dispatchAction('list-column-header', 'sort', this.field());
  }
  protected readonly sortState = () => this.context?.level()?.state.list;
  readonly caption = input.required<string>();
  readonly index = input.required<number>();
}
