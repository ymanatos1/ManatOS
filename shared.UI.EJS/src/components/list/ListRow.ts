import { renderNativeComponent } from '../native-template.js';
import {
  multilingual,
  type UiListColumn,
  type UiFieldBehavior,
  type UiFieldReferences,
} from '@manatos/shared-ui';
import { renderListCell } from './ListCell.js';
/** The row's flat CTX scope is #data.list[index].
 * UIS ownership: one row and the ordered Cell children for the selected view; do not move cell ownership to List. */
export function renderListRow(
  row: Readonly<Record<string, unknown>>,
  index: number,
  columns: readonly UiListColumn[],
  language: import('@manatos/shared').MetadataLanguage,
  behaviorForColumn: (index: number) => UiFieldBehavior | undefined,
  references: UiFieldReferences,
): string {
  return renderNativeComponent(
    'ListRow',
    { Index: index },
    {
      Cells: columns
        .map((column, columnIndex) =>
          renderListCell(
            behaviorForColumn(columnIndex),
            column.field,
            row[column.field],
            columnIndex,
            language,
            row,
            references,
          ),
        )
        .join(''),
    },
  );
}

/** Own reconciliation of keyed Row instances and their ordered Cell children.
 * Keep the existing signature guard: rebuilding Row DOM unnecessarily loses
 * focus and selection while List filters and page actions update.
 */
export function updateListRows(
  host: HTMLElement,
  level: import('@manatos/shared-ui').UiListPageLevel,
  columns: readonly UiListColumn[],
  version: string,
  language: import('@manatos/shared').MetadataLanguage,
  behaviorForColumn: (index: number) => UiFieldBehavior | undefined,
): void {
  const rows = host.querySelector<HTMLElement>('.manatos-list-rows');
  if (!rows) return;
  const rowsSignature = JSON.stringify([version, level.data.list, level.data.references]);
  if (rows.dataset['listRowsSignature'] !== rowsSignature) {
    rows.innerHTML = level.data.list.length
      ? level.data.list
          .map((row, index) =>
            renderListRow(row, index, columns, language, behaviorForColumn, level.data.references),
          )
          .join('')
      : renderNativeComponent('ListEmpty', {
          Message: multilingual(language, []).resolve(
            level.data.filters.search ||
              Object.entries(level.data.filters).some(
                ([key, value]) => key !== 'search' && Boolean(value),
              )
              ? '@CM.NoEntriesMatchFilters'
              : '@CM.NoEntriesFound',
          ),
        });
    rows.dataset['listRowsSignature'] = rowsSignature;
    if (level.state.list.selectionMode === 'single') {
      const primaryIndex = columns.findIndex(
        (_, index) => behaviorForColumn(index)?.isPrimaryField,
      );
      if (primaryIndex >= 0) {
        for (const row of rows.querySelectorAll<HTMLElement>('[data-list-row-index]')) {
          const cell = row.querySelectorAll<HTMLElement>('[data-list-cell-index]')[primaryIndex];
          const value = cell?.querySelector<HTMLElement>('[data-list-cell-value]');
          if (!value) continue;
          const link = value.querySelector<HTMLAnchorElement>('a');
          const label = row.ownerDocument.createElement('strong');
          label.textContent = link?.textContent ?? value.textContent;
          if (link) link.replaceWith(label);
          else value.replaceChildren(label);
        }
      }
    }
  }
  const selectable = level.state.list.selectionMode !== 'none';
  for (const row of rows.querySelectorAll<HTMLElement>('[data-list-row-index]')) {
    row.classList.toggle('manatos-list-selectable-row', selectable);
    if (selectable) {
      row.tabIndex = 0;
      const rowId = level.data.list[Number(row.dataset['listRowIndex'])]?.id;
      row.setAttribute(
        'aria-selected',
        String(typeof rowId === 'string' && level.data.listModel.selectedIds.includes(rowId)),
      );
    } else {
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-selected');
    }
  }
}
