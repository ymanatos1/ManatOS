import type { ListNativeRoute } from '../ListNativeInteractions.js';
import { renderNativeComponent } from '../../native-template.js';
/**
 * EJS Header selects a real sortable or passive HTML template; it never assembles icon markup
 * or mutates rendered HTML strings. Sort indication and route live here, not in List. Debug:
 * renderListColumnHeader() / updateListSortIndicators().
 */
export function renderListColumnHeader(
  caption: string,
  index: number,
  field?: string,
  sortable = false,
): string {
  // The concrete sortable/non-sortable templates own their actual controls.
  // In particular a read-only heading MUST NOT acquire a fake sort action.
  return renderNativeComponent(sortable && field ? 'ListColumnHeader' : 'ListColumnHeaderPlain', {
    Caption: caption,
    Index: index,
    SortField: sortable && field ? field : '',
  });
}

/** Only sortable Header templates expose data-list-sort-field for this route.
 * The semantic Header validates sortability before List state mutation;
 * never make a passive heading interactive in a generic route.
 */
export const listColumnHeaderClickRoutes: readonly ListNativeRoute[] = [
  {
    selector: '[data-list-sort-field]',
    kind: 'list-column-header',
    action: 'sort',
    fieldAttribute: 'data-list-sort-field',
  },
];

/** One Header's native sort indicator, driven by the canonical List sort state.
 * Do not let the List host update this Header's icon or aria-sort directly.
 */
export function updateListSortIndicators(
  host: HTMLElement,
  level: import('@manatos/shared-ui').UiListPageLevel,
): void {
  for (const column of host.querySelectorAll<HTMLElement>('[data-list-sort-field]')) {
    const sorted = column.dataset['listSortField'] === level.state.list.sort;
    column.setAttribute(
      'aria-sort',
      sorted ? (level.state.list.direction === 'asc' ? 'ascending' : 'descending') : 'none',
    );
    const icon = column.querySelector<HTMLElement>('[data-list-sort-icon]');
    if (icon)
      icon.className = `bi manatos-list-sort-icon bi-${sorted ? (level.state.list.direction === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-down-up'}`;
  }
}
