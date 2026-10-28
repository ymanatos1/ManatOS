import { Component, computed, inject, ViewEncapsulation, output, input } from '@angular/core';
import { ListContext } from './ListContext';
import type { MetadataLanguage } from '@manatos/shared';
import {
  uiEntryRelatedViewActionColumn,
  type UiListColumn,
  type UiFieldReferences,
} from '@manatos/shared-ui';
import { ListHeader } from './header/ListHeader';
import { ListColumnsRow } from './columns/ListColumnsRow';
import { ListRow } from './ListRow';
import { ListPagination } from './pagination/ListPagination';

/** UIS ownership: the header, columns, keyed rows, pagination and optional actions; only row children are replaced when record identities change. */
@Component({
  selector: 'manatos-list',
  standalone: true,
  imports: [ListHeader, ListColumnsRow, ListRow, ListPagination],
  styleUrls: ['./List.css', '../fields/FieldDisplay.css'],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './List.html',
})
export class List {
  protected readonly context = inject(ListContext, { optional: true });
  readonly embeddedRows = input<readonly Readonly<Record<string, unknown>>[] | null>(null);
  readonly embeddedColumns = input<readonly UiListColumn[]>([]);
  readonly embeddedEntityKey = input('');
  readonly embeddedLanguage = input<MetadataLanguage>('EN');
  readonly embeddedReferences = input<UiFieldReferences>({});
  readonly embeddedLayout = input<'panel-list' | 'table-list'>('table-list');
  readonly embeddedViewAction = input(false);
  protected readonly displayColumns = computed(() =>
    this.embeddedViewAction()
      ? [...this.embeddedColumns(), uiEntryRelatedViewActionColumn(this.embeddedLanguage())]
      : this.embeddedColumns(),
  );
  readonly embeddedRowOpen = output<Readonly<Record<string, unknown>>>();
  protected openEmbedded(row: Readonly<Record<string, unknown>>, event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('a, [data-entry-related-view-row]')) return;
    event.preventDefault();
    this.embeddedRowOpen.emit(row);
  }
  readonly rowSelected = output<string>();
  readonly rowConfirmed = output<string>();
}
