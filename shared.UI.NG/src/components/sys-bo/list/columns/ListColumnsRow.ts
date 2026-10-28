import { Component, inject, input } from '@angular/core';
import { ListContext } from '../ListContext';
import type { UiListColumn } from '@manatos/shared-ui';
import { ListColumnHeader } from './ListColumnHeader';

/**
 * Angular ColumnsRow composes one ListColumnHeader child per metadata column in its own HTML.
 * List owns the outer table only; sortable intent is delegated to each Header. Debug:
 * ListColumnsRow.html -> ListColumnHeader.sort().
 */
@Component({
  selector: 'manatos-list-columns-row',
  standalone: true,
  imports: [ListColumnHeader],
  templateUrl: './ListColumnsRow.html',
})
export class ListColumnsRow {
  protected readonly context = inject(ListContext, { optional: true });
  readonly embeddedColumns = input<readonly UiListColumn[] | null>(null);
}
