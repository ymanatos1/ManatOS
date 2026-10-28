import type { ListNativeRoute } from '../ListNativeInteractions.js';
import { renderNativeComponent } from '../../native-template.js';
import type { MetadataLanguage } from '@manatos/shared';
import { multilingual, type UiListPageLevel } from '@manatos/shared-ui';
/**
 * EJS Search owns its input template, native value route and focus-preserving
 * search/placeholder refresh. No host-level reconciliation should reset an actively edited
 * value. Debug: listSearchValueRoutes and updateListSearch().
 */
export function renderListSearch(language: MetadataLanguage = 'EN'): string {
  return renderNativeComponent('ListSearch', { Label: language === 'EL' ? 'Αναζήτηση' : 'Search' });
}

/** Search control supplies the new value to one semantic search action.
 * updateListSearch preserves active native input edits; do not dispatch search
 * again from the List parent. Debug the value route before shared dispatch.
 */
export const listSearchValueRoutes: readonly ListNativeRoute[] = [
  { selector: '[data-list-search]', kind: 'list-search' },
];

/** Preserve active browser editing while projecting canonical search text.
 * The Search child owns its localized placeholder, not the List parent.
 */
export function updateListSearch(
  host: HTMLElement,
  level: UiListPageLevel,
  language: MetadataLanguage,
): void {
  const search = host.querySelector<HTMLInputElement>('[data-list-search]');
  if (!search) return;
  const wanted = level.data.filters.search;
  if (search !== search.ownerDocument.activeElement && search.value !== wanted)
    search.value = wanted;
  const label = multilingual(language, []).resolve(level.control.entityName);
  search.placeholder = multilingual(language, []).format(
    language === 'EL' ? 'Αναζήτηση {entity}' : 'Search {entity}',
    { entity: label.toLocaleLowerCase(language === 'EL' ? 'el' : 'en') },
  );
}
