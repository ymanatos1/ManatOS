import { UiEmbeddedComponentRegistry } from '../../../runtime/component.js';
import type { ListEmbeddedDefinition } from './base.js';
import { ListEmbedded } from './List.js';
import { ListHeaderEmbedded } from './ListHeader.js';
import { ListFilterEmbedded } from './ListFilter.js';
import { ListFilterFieldEmbedded } from './ListFilterField.js';
import { ListViewsEmbedded } from './ListViews.js';
import { ListSearchEmbedded } from './ListSearch.js';
import { ListAddEmbedded } from './ListAdd.js';
import { ListColumnsRowEmbedded } from './ListColumnsRow.js';
import { ListColumnHeaderEmbedded } from './ListColumnHeader.js';
import { ListRowEmbedded } from './ListRow.js';
import { ListCellEmbedded } from './ListCell.js';
import { ListPaginationEmbedded } from './ListPagination.js';
import { ListActionsEmbedded } from './ListActions.js';

/** One registry for every List Host, using the same runtime contract as Auth.
 * UIS ownership: all List semantic owners, including individual headers, rows, cells and filter fields. */
export function createListEmbeddedRegistry(): UiEmbeddedComponentRegistry {
  return new UiEmbeddedComponentRegistry()
    .register('list', {
      dataPath: 'data.list',
      create: (d) => new ListEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-header', {
      dataPath: 'data.list',
      create: (d) => new ListHeaderEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-filter', {
      dataPath: 'data.filters',
      statusPath: 'state.list',
      create: (d) => new ListFilterEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-filter-field', {
      dataPath: 'data.filters',
      statusPath: 'state.list',
      create: (d) => new ListFilterFieldEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-views', {
      dataPath: 'data.list',
      statusPath: 'state.list',
      create: (d) => new ListViewsEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-search', {
      dataPath: 'data.filters',
      create: (d) => new ListSearchEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-add', {
      dataPath: 'data.list',
      create: (d) => new ListAddEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-columns-row', {
      dataPath: 'data.list',
      statusPath: 'state.list',
      create: (d) => new ListColumnsRowEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-column-header', {
      dataPath: 'data.list',
      statusPath: 'state.list',
      create: (d) => new ListColumnHeaderEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-row', {
      dataPath: (d) => `data.list[${(d as ListEmbeddedDefinition).rowIndex}]`,
      statusPath: 'state.list',
      create: (d) => new ListRowEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-cell', {
      dataPath: (d) => `data.list[${(d as ListEmbeddedDefinition).rowIndex}]`,
      create: (d) => new ListCellEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-actions', {
      dataPath: 'data.list',
      statusPath: 'state.list',
      create: (d) => new ListActionsEmbedded(d as ListEmbeddedDefinition),
    })
    .register('list-pagination', {
      dataPath: 'data.list',
      statusPath: 'state.list',
      create: (d) => new ListPaginationEmbedded(d as ListEmbeddedDefinition),
    });
}
