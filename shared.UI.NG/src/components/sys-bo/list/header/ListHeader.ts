import { Component, inject } from '@angular/core';
import { ListContext } from '../ListContext';
import { ListFilter } from './ListFilter';
import { ListViews } from './ListViews';
import { ListSearch } from './ListSearch';
import { ListAdd } from './ListAdd';

/** UIS ownership: the count region and the Filter, Views, Search and Add children; each child owns its own control. */
@Component({
  selector: 'manatos-list-header',
  standalone: true,
  imports: [ListFilter, ListViews, ListSearch, ListAdd],
  templateUrl: './ListHeader.html',
})
export class ListHeader {
  protected readonly context = inject(ListContext);
}
