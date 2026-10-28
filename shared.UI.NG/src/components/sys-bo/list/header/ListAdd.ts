import { Component, inject } from '@angular/core';
import { ListContext } from '../ListContext';

/**
 * The Angular Add placeholder owns the disabled control visible in ListAdd.html. No click
 * handler is intentional until a canonical add-entry effect exists; do not fake one to make
 * this class longer. Debug: ListAdd.html and ListPageRuntime action policy.
 */
@Component({ selector: 'manatos-list-add', standalone: true, templateUrl: './ListAdd.html' })
export class ListAdd {
  protected readonly context = inject(ListContext);
}
