import type { ListNativeRoute } from '../ListNativeInteractions.js';
import { renderNativeComponent } from '../../native-template.js';
import { uiListFilterFields, type UiListPageLevel } from '@manatos/shared-ui';
import { renderListFilterField, updateListFilterField } from './ListFilterField.js';
import type { MetadataLanguage } from '@manatos/shared';
import { EjsTransientMenus } from '../../../runtime/transient-menu.js';
/**
 * Native Filter owns panel visibility/docking and the registered filter Field child set.
 * Reconcile by metadata signature, not by rebuilding List or discarding active input. Debug:
 * updateListFilter() and renderListFilterField(); intents route through
 * ListNativeInteractions.
 */
export function renderListFilter(language: MetadataLanguage = 'EN'): string {
  const el = language === 'EL';
  return renderNativeComponent('ListFilter', {
    Label: el ? 'Φίλτρα' : 'Filters',
    RefreshTitle: el ? 'Ανανέωση' : 'Refresh',
    RefreshLabel: el ? 'Ανανέωση λίστας' : 'Refresh list',
  });
}

/** Filter owns docking/visibility and the collection of metadata-defined
 * child Fields; their individual values and focus preservation belong to
 * ListFilterField. Do not reintroduce native child value updates here. */
export function updateListFilter(
  host: HTMLElement,
  level: UiListPageLevel,
  entityKey: string,
  language: MetadataLanguage,
): void {
  const filter = host.querySelector<HTMLElement>('[data-list-layout="ListFilter"]');
  if (!filter) return;
  const refresh = filter.querySelector<HTMLButtonElement>('[data-list-refresh]');
  if (refresh) {
    refresh.disabled = level.state.list.loading;
    const label = refresh.querySelector<HTMLElement>('[data-list-refresh-label]');
    if (label) label.textContent = language === 'EL' ? 'Ανανέωση' : 'Refresh';
  }
  const toggle = filter.querySelector<HTMLButtonElement>('[data-list-toggle-filters]');
  if (toggle) toggle.setAttribute('aria-expanded', String(level.state.list.filtersVisible));
  filter.classList.toggle('is-docked', level.state.list.filtersDocked);
  const panel = EjsTransientMenus.forDocument(host.ownerDocument).panelFor(
    host,
    '[data-list-filter-panel]',
  );
  if (!panel) return;
  panel.hidden = !level.state.list.filtersVisible;
  const definitions = uiListFilterFields(entityKey, language, level.state.list.view);
  const version = `${entityKey}:${language}:${level.state.list.view}`;
  if (panel.dataset['filterVersion'] !== version) {
    // Keep the dock action declared by ListFilter.html; only this Filter's
    // concrete Field children are replaced when their definitions change.
    panel
      .querySelectorAll('[data-list-layout="ListFilterField"]')
      .forEach((child) => child.remove());
    panel.insertAdjacentHTML(
      'beforeend',
      definitions.map((field) => renderListFilterField(field, language)).join(''),
    );
    panel.dataset['filterVersion'] = version;
  }
  const dock = panel.querySelector<HTMLButtonElement>('[data-list-filter-dock]');
  if (dock) {
    dock.setAttribute(
      'aria-label',
      level.state.list.filtersDocked ? 'Undock filters' : 'Dock filters',
    );
    dock.title = level.state.list.filtersDocked ? 'Open floating filters' : 'Dock filters';
    const icon = dock.querySelector('i');
    if (icon)
      icon.className = level.state.list.filtersDocked
        ? 'bi bi-arrows-angle-contract'
        : 'bi bi-layout-sidebar-inset';
  }
  for (const definition of definitions)
    updateListFilterField(panel, definition.field, level.data.filters[definition.field] ?? '');
  const header = filter.closest<HTMLElement>('.manatos-list-header');
  if (!header) return;
  if (level.state.list.filtersVisible && level.state.list.filtersDocked)
    header.style.setProperty('--manatos-list-docked-filter-height', `${panel.offsetHeight + 12}px`);
  else header.style.removeProperty('--manatos-list-docked-filter-height');
}

/** Toggle and dock selectors belong to this Filter, not its Field children.
 * Native routing delivers only action intent; updateListFilter owns DOM state.
 * Debug the route before ListNativeInteractions dispatch; never mutate query state here.
 */
export const listFilterClickRoutes: readonly ListNativeRoute[] = [
  { selector: '[data-list-refresh]', kind: 'list-filter', action: 'refresh' },
  { selector: '[data-list-toggle-filters]', kind: 'list-filter', action: 'toggle' },
  { selector: '[data-list-filter-dock]', kind: 'list-filter', action: 'dock' },
];
