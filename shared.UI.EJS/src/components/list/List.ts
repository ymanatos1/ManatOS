import type { MetadataLanguage } from '@manatos/shared';
import {
  uiListColumns,
  uiListEntityLabel,
  multilingual,
  type UiListPageLevel,
  type UiFieldBehavior,
} from '@manatos/shared-ui';
import { renderListHeader } from './header/ListHeader.js';
import { updateListRows } from './ListRow.js';
import { renderListPagination } from './pagination/ListPagination.js';
import { updateListColumnsRow } from './columns/ListColumnsRow.js';
import { updateListSortIndicators } from './columns/ListColumnHeader.js';
import { updateListPagination } from './pagination/ListPagination.js';
import { updateListSearch } from './header/ListSearch.js';
import { updateListHeader } from './header/ListHeader.js';
import { renderNativeComponent } from '../native-template.js';
import { updateListFilter } from './header/ListFilter.js';
import { updateListViews } from './header/ListViews.js';

/** UIS ownership: the List component skeleton and explicitly delegated header/columns/rows/pagination children. */
export function renderList(language: MetadataLanguage = 'EN'): string {
  return renderNativeComponent(
    'List',
    {},
    {
      Header: renderListHeader(language),
      Pagination: renderListPagination(language),
    },
  );
}

/** Coordinate native child reconciliation in semantic child order.
 * List owns the status and list-wide column count only. Each child module
 * updates its own DOM; do not move child state back into this host. In-place
 * updates preserve the focused Search/Filter controls and native listeners.
 * Debug: updateList -> updateListColumnsRow/Rows/Sort/Header/Pagination/Filter/Views/Search.
 */
export function updateList(
  host: HTMLElement,
  level: UiListPageLevel,
  language: MetadataLanguage,
  behaviorForColumn: (index: number) => UiFieldBehavior | undefined,
): void {
  const entityKey = String(level.control.invocation.params['entityKey'] ?? '');
  const columns = uiListColumns(entityKey, language, level.state.list.view);
  const entityName = level.control.entityName;
  const entityLabel = entityName
    ? multilingual(language, []).resolve(entityName)
    : uiListEntityLabel(entityKey, language);
  host.querySelector<HTMLElement>('[data-list-table]')?.setAttribute('aria-label', entityLabel);
  host
    .querySelector<HTMLElement>('[data-list]')
    ?.style.setProperty('--manatos-list-column-count', String(columns.length));
  const version = `${entityKey}:${language}:${level.state.list.view}`;
  updateListColumnsRow(host, columns, version);
  updateListRows(host, level, columns, version, language, behaviorForColumn);
  updateListSortIndicators(host, level);
  updateListHeader(host, level);
  updateListPagination(host, level, language);
  const status = host.querySelector<HTMLElement>('[data-list-status]');
  if (status) {
    status.textContent =
      level.state.list.error ??
      (level.state.list.loading ? (language === 'EL' ? 'Φόρτωση…' : 'Loading…') : '');
    status.hidden = !status.textContent;
  }
  updateListFilter(host, level, entityKey, language);
  updateListViews(host, entityKey, language, level.state.list.view, level.state.list.viewsOpen);
  updateListSearch(host, level, language);
}
