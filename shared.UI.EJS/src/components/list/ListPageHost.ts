import { renderNativeComponent } from '../native-template.js';
import { EjsTransientMenus } from '../../runtime/transient-menu.js';
import {
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import { UiListPageRuntime, createUiBrowserSurfaceResourcePort } from '@manatos/shared-ui';
import { renderList, updateList } from './List.js';
import { mountListNativeInteractions } from './ListNativeInteractions.js';
import { renderSurfaceActions } from '../surfaces/SurfaceActions.js';

/** Page caption and breadcrumb remain owned by the already mounted Page.
 * UIS ownership: the List Surface mounting boundary and host-owned lifecycle; the List child owns toolbar/row composition. */
export function renderListPageHost(language: MetadataLanguage = 'EN'): string {
  return renderNativeComponent('ListPageHost', {}, { List: renderList(language) });
}
export interface MountedListPageHost {
  destroy(): void;
  updateLanguage(language: MetadataLanguage): void;
  readonly entityKey: string;
}

/** UIS ownership: the List Surface mounting boundary and host-owned lifecycle; the List child owns toolbar/row composition. */
export function mountListPageHost(
  scope: ParentNode,
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  entityKey: string,
  initialLanguage: MetadataLanguage = 'EN',
  options: {
    host?: 'page' | 'popup';
    parentLevelPath?: string | null;
    selectionMode?: 'none' | 'single' | 'multiple';
    onRowSelected?: (id: string) => void;
    onCancel?: () => void;
  } = {},
): MountedListPageHost {
  const host = scope.querySelector<HTMLElement>('[data-list-page-host]');
  if (!host) throw new Error('List page host is not mounted.');
  if (initialLanguage === 'EL') {
    const template = host.ownerDocument.createElement('template');
    template.innerHTML = renderList(initialLanguage);
    const localized = template.content.firstElementChild;
    const current = host.querySelector('[data-list]');
    if (localized && current) current.replaceWith(localized);
  }
  if (options.host === 'popup')
    host.insertAdjacentHTML(
      'beforeend',
      renderSurfaceActions('list', 'popup', entityKey, initialLanguage),
    );
  const overlays = EjsTransientMenus.forDocument(host.ownerDocument);
  const runtime = new UiListPageRuntime(
    context,
    entityKey,
    createUiBrowserSurfaceResourcePort(),
    options,
  );
  host.dataset.uiLevelPath = runtime.levelPath;
  let language = initialLanguage;
  // Localized List markup can be replaced without replacing its CTX Surface.
  // Rebind the observer to the live filter panel after each presentation swap.
  let observedFilterPanel: HTMLElement | null = null;
  const filterObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const panel = observedFilterPanel;
          const header = panel?.closest<HTMLElement>('.manatos-list-header');
          if (!panel || !header) return;
          const state = runtime.level.state.list;
          if (state.filtersVisible && state.filtersDocked)
            header.style.setProperty(
              '--manatos-list-docked-filter-height',
              `${panel.offsetHeight + 12}px`,
            );
        })
      : null;
  const observeFilterPanel = (): void => {
    const panel = overlays.panelFor(host, '[data-list-filter-panel]');
    if (panel === observedFilterPanel) return;
    filterObserver?.disconnect();
    observedFilterPanel = panel;
    if (panel) filterObserver?.observe(panel);
  };
  observeFilterPanel();
  const render = (): void => {
    updateList(host, runtime.level, language, (index) => runtime.fieldBehaviorForColumn(index));
    const selected = runtime.level.data.listModel.selectedIds[0];
    const valid =
      typeof selected === 'string' && runtime.level.data.list.some((row) => row.id === selected);
    const select = host.querySelector<HTMLButtonElement>('[data-surface-action="select"]');
    if (select) select.disabled = !valid || runtime.level.state.list.loading;
    const filter = overlays.panelFor(host, '[data-list-filter-panel]');
    const views = overlays.panelFor(host, '[data-list-view-menu]');
    if (
      runtime.level.state.list.filtersVisible &&
      !runtime.level.state.list.filtersDocked &&
      filter
    ) {
      const anchor = host.querySelector<HTMLElement>('[data-list-toggle-filters]');
      if (anchor && !overlays.isOpen(filter))
        overlays.open(filter, anchor, host, () => runtime.setFiltersVisible(false));
    } else if (filter && overlays.isOpen(filter)) overlays.close();
    if (runtime.level.state.list.viewsOpen && views) {
      const anchor = host.querySelector<HTMLElement>('[data-list-toggle-views]');
      if (anchor && !overlays.isOpen(views))
        overlays.open(views, anchor, host, () => runtime.setViewsOpen(false));
    } else if (views && overlays.isOpen(views)) overlays.close();
  };
  const unsubscribe = runtime.subscribe(render);
  const disposeNative = mountListNativeInteractions(host, runtime, options.onRowSelected);
  const onAction = (event: MouseEvent): void => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-surface-action]')
        : null;
    if (!target || !host.contains(target) || target.disabled) return;
    const action = target.dataset['surfaceAction'];
    if (action === 'cancel') options.onCancel?.();
    if (action === 'select') {
      const selected = runtime.level.data.listModel.selectedIds[0];
      if (
        selected &&
        runtime.level.data.list.some((row) => row.id === selected) &&
        runtime.selectRow(selected)
      )
        options.onRowSelected?.(selected);
    }
  };
  host.addEventListener('click', onAction);
  render();
  let destroyed = false;
  return {
    entityKey,
    updateLanguage(nextLanguage): void {
      if (destroyed || nextLanguage === language) return;
      language = nextLanguage;
      // Only localized presentation changes; canonical rows and Host survive.
      const originalInput = host.querySelector<HTMLInputElement>('[data-list-search]');
      const wasFocused =
        originalInput != null && host.ownerDocument.activeElement === originalInput;
      const caret = wasFocused
        ? { start: originalInput.selectionStart, end: originalInput.selectionEnd }
        : null;
      const preserved = originalInput?.value ?? '';
      const replacement = host.ownerDocument.createElement('template');
      replacement.innerHTML = renderList(language);
      const newList = replacement.content.firstElementChild;
      const currentList = host.querySelector('[data-list]');
      if (currentList && newList) currentList.replaceWith(newList);
      const search = host.querySelector<HTMLInputElement>('[data-list-search]');
      if (search) {
        search.value = preserved;
        if (wasFocused) {
          search.focus();
          if (caret && caret.start !== null && caret.end !== null)
            search.setSelectionRange(caret.start, caret.end);
        }
      }
      if (options.host === 'popup') {
        host.querySelector('.manatos-surface-actions')?.remove();
        host.insertAdjacentHTML(
          'beforeend',
          renderSurfaceActions('list', 'popup', entityKey, language),
        );
      }
      observeFilterPanel();
      render();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.removeEventListener('click', onAction);
      disposeNative();
      overlays.closeOwned(host);
      unsubscribe();
      filterObserver?.disconnect();
      runtime.dispose();
      if (host.dataset.uiLevelPath === runtime.levelPath) delete host.dataset.uiLevelPath;
    },
  };
}
