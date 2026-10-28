import { renderNativeComponent } from '../../native-template.js';
import type { UiListColumn } from '@manatos/shared-ui';
import { renderListColumnHeader } from './ListColumnHeader.js';
/**
 * EJS ColumnsRow composes its own Header children and re-renders only when the view/locale
 * signature changes. Preserve stable indices and avoid remounting Row/Cell children here.
 * Debug: renderListColumnsRow() / updateListColumnsRow().
 */
export function renderListColumnsRow(columns: readonly UiListColumn[]): string {
  return renderNativeComponent(
    'ListColumnsRow',
    {},
    {
      Headers: columns
        .map((column, index) =>
          renderListColumnHeader(column.caption, index, column.field, column.sortable),
        )
        .join(''),
    },
  );
}

/** Reconcile the column-header child set only when view/locale identity changes.
 * The List parent owns neither the individual Header markup nor sort intents.
 */
export function updateListColumnsRow(
  host: HTMLElement,
  columns: readonly UiListColumn[],
  version: string,
): void {
  const header = host.querySelector<HTMLElement>('[data-list-table-heading]');
  const rows = host.querySelector<HTMLElement>('.manatos-list-rows');
  if (header && rows && header.dataset['listVersion'] !== version) {
    header.innerHTML = renderListColumnsRow(columns);
    header.dataset['listVersion'] = version;
  }
}
