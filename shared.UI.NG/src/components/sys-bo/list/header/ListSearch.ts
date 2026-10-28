import { Component, inject } from '@angular/core';
import { ListContext } from '../ListContext';

/**
 * Angular Search owns the actual text input and its input callback; ListContext transports
 * search intent to the canonical runtime. Do not put listeners on ListHeader. Debug:
 * ListSearch.html -> onSearch().
 */
@Component({ selector: 'manatos-list-search', standalone: true, templateUrl: './ListSearch.html' })
export class ListSearch {
  protected readonly context = inject(ListContext);
  protected onSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement)
      this.context.dispatchControl('list-search', target.value);
  }
}
