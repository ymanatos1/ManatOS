import type { ListNativeRoute } from '../ListNativeInteractions.js';
import { renderNativeComponent } from '../../native-template.js';
import type { MetadataLanguage } from '@manatos/shared';
import { EjsTransientMenus } from '../../../runtime/transient-menu.js';
import { uiListAvailableViews } from '@manatos/shared-ui';
/**
 * EJS Views owns menu open state projection and metadata-derived ViewOption children. The
 * native route exports only action identity, not state mutation. Debug: updateListViews() /
 * listViewsClickRoutes.
 */
export function renderListViews(language: MetadataLanguage = 'EN'): string {
  const el = language === 'EL';
  return renderNativeComponent('ListViews', { Label: el ? 'Προβολή' : 'View' });
}

/** UIS ownership: ListViews alone updates its menu and each named option button.
 * Keep view metadata and escaping in this component; List only invokes reconciliation.
 */
export function updateListViews(
  host: HTMLElement,
  entityKey: string,
  language: MetadataLanguage,
  selected: string,
  expanded: boolean,
): void {
  const toggle = host.querySelector<HTMLButtonElement>('[data-list-toggle-views]');
  if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
  const menu = EjsTransientMenus.forDocument(host.ownerDocument).panelFor(
    host,
    '[data-list-view-menu]',
  );
  if (!menu) return;
  menu.hidden = !expanded;
  const views = uiListAvailableViews(entityKey, language);
  const signature = JSON.stringify([views, selected]);
  if (menu.dataset['viewSignature'] === signature) return;
  menu.innerHTML = views
    .map((view) =>
      renderNativeComponent('ListViewOption', {
        Key: view.key,
        Label: view.label,
        Selected: view.key === selected ? 'true' : 'false',
      }),
    )
    .join('');
  menu.dataset['viewSignature'] = signature;
}

/** Views exposes distinct toggle and view-key actions from its own template.
 * The shared router only transports intent to semantic ListViews; do not
 * duplicate canonical view selection in this native menu owner.
 */
export const listViewsClickRoutes: readonly ListNativeRoute[] = [
  { selector: '[data-list-toggle-views]', kind: 'list-views', action: 'toggle' },
  { selector: '[data-list-view-key]', kind: 'list-views', actionAttribute: 'data-list-view-key' },
];
