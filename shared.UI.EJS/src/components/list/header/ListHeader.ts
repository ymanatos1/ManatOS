import { renderNativeComponent } from '../../native-template.js';
import type { MetadataLanguage } from '@manatos/shared';
import { renderListFilter } from './ListFilter.js';
import { renderListViews } from './ListViews.js';
import { renderListSearch } from './ListSearch.js';
import { renderListAdd } from './ListAdd.js';
/** UIS ownership: the count region and the Filter, Views, Search and Add children; each child owns its own control. */
export function renderListHeader(language: MetadataLanguage = 'EN'): string {
  return renderNativeComponent(
    'ListHeader',
    {
      CountLabel: language === 'EL' ? 'εγγραφές' : 'entries',
    },
    {
      Filter: renderListFilter(language),
      Views: renderListViews(language),
      Search: renderListSearch(language),
      Add: renderListAdd(language),
    },
  );
}

/** Header-owned count and toolbar visibility; Search/Views/Filter/Add remain
 * distinct children and do not inherit these status projections.
 */
export function updateListHeader(
  host: HTMLElement,
  level: import('@manatos/shared-ui').UiListPageLevel,
): void {
  const controls = host.querySelector<HTMLElement>('[data-list-controls]');
  if (controls) controls.hidden = level.control.invocation.params['showControls'] === false;
  const add = host.querySelector<HTMLElement>('[data-list-layout="ListAdd"]');
  if (add) add.hidden = level.state.list.selectionMode !== 'none';
  const count = host.querySelector<HTMLElement>('[data-list-count]');
  if (count) count.textContent = String(level.state.list.total);
}
