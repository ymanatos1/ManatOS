import type { ListNativeRoute } from '../ListNativeInteractions.js';
import type { MetadataLanguage } from '@manatos/shared';
import { renderNativeComponent } from '../../native-template.js';

/** EJS Pagination owns page button bounds, indicators and metadata-backed
 * PageSizeOption children. Native event routing is shared; never synthesize
 * options in List.update(). Debug: updateListPagination() and the native
 * click/value route tables below.
 */
export function renderListPagination(language: MetadataLanguage = 'EN'): string {
  const greek = language === 'EL';
  return renderNativeComponent('ListPagination', {
    Indicator: greek ? 'Σελίδα 1 από 1' : 'Page 1 of 1',
    NavigationLabel: greek ? 'Σελίδες αποτελεσμάτων' : 'Result pages',
    FirstLabel: greek ? 'Πρώτη σελίδα' : 'First page',
    PreviousLabel: greek ? 'Προηγούμενη σελίδα' : 'Previous page',
    NextLabel: greek ? 'Επόμενη σελίδα' : 'Next page',
    LastLabel: greek ? 'Τελευταία σελίδα' : 'Last page',
    RowsLabel: greek ? 'Σειρές' : 'Rows',
  });
}

/** Pagination button data-list-page-action is the sole page navigation intent.
 * Bounds and disabled states are projected by updateListPagination, not
 * recomputed inside the shared native event dispatcher.
 */
export const listPaginationClickRoutes: readonly ListNativeRoute[] = [
  {
    selector: '[data-list-page-action]',
    kind: 'list-pagination',
    actionAttribute: 'data-list-page-action',
  },
];

/** The page-size select is the separate value route; the canonical List
 * runtime owns page-size state. Keep its options/selected value in this
 * Pagination child rather than rebuilding it in List.ts.
 */
export const listPaginationValueRoutes: readonly ListNativeRoute[] = [
  { selector: '[data-list-rows-per-page]', kind: 'list-pagination' },
];

/** Pagination alone reconciles its indicators, page-size choices and action bounds.
 * The generic native event router merely forwards the buttons/select to UIS.
 * Keep the option-signature guard so changing List data does not reset selection.
 */
export function updateListPagination(
  host: HTMLElement,
  level: import('@manatos/shared-ui').UiListPageLevel,
  language: MetadataLanguage,
): void {
  const pagingFooter = host.querySelector<HTMLElement>('[data-list-layout="ListPagination"]');
  const minimum = Math.min(...level.state.list.pageSizeOptions);
  if (pagingFooter) pagingFooter.hidden = level.state.list.total < minimum;
  const navigation = host.querySelector<HTMLElement>('[data-list-pagination-nav]');
  if (navigation) navigation.hidden = level.state.list.totalPages <= 1;
  const currentPage = host.querySelector<HTMLElement>('[data-list-page-current]');
  if (currentPage) currentPage.textContent = String(level.state.list.page);
  const indicator = host.querySelector<HTMLElement>('[data-list-page-indicator]');
  if (indicator) {
    indicator.hidden = level.state.list.totalPages <= 1;
    indicator.textContent = `${language === 'EL' ? 'Σελίδα' : 'Page'} ${level.state.list.page} ${language === 'EL' ? 'από' : 'of'} ${Math.max(1, level.state.list.totalPages)}`;
  }
  const pageSize = host.querySelector<HTMLSelectElement>('[data-list-rows-per-page]');
  if (pageSize) {
    const options = level.state.list.pageSizeOptions;
    const signature = options.join(',');
    if (pageSize.dataset['options'] !== signature) {
      // The pagination component composes registered option HTML; it does not
      // synthesize controls inside the generic List Surface renderer.
      pageSize.innerHTML = options
        .map((size) => renderNativeComponent('ListPageSizeOption', { Size: size }))
        .join('');
      pageSize.dataset['options'] = signature;
    }
    pageSize.value = String(level.state.list.pageSize);
  }
  for (const action of ['first', 'previous', 'next', 'last'] as const) {
    const button = host.querySelector<HTMLButtonElement>(`[data-list-page-action="${action}"]`);
    if (button)
      button.disabled =
        level.state.list.loading ||
        (['first', 'previous'].includes(action)
          ? level.state.list.page <= 1
          : level.state.list.page >= level.state.list.totalPages);
  }
}
