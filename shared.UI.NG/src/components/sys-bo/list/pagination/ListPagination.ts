import { Component, inject } from '@angular/core';
import { ListContext } from '../ListContext';
/**
 * Angular Pagination exposes buttons, page labels and page-size selection through its own
 * template. It forwards native intents, while canonical paging bounds stay in ListPageRuntime.
 * Debug: ListPagination.html and changePageSize().
 */
@Component({
  selector: 'manatos-list-pagination',
  standalone: true,
  templateUrl: './ListPagination.html',
})
export class ListPagination {
  readonly context = inject(ListContext);
  protected onPageSize(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement)
      this.context.dispatchControl('list-pagination', target.value);
  }
}
