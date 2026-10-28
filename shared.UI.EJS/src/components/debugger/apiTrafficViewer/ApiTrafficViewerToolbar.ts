import { multilingual, type ApiTrafficRouteFilterItem } from '@manatos/shared-ui';

export interface ApiTrafficViewerToolbarState {
  readonly paused: boolean;
  readonly errorsOnly: boolean;
  readonly ignoreRoutes: boolean;
  readonly searchText: string;
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly routes: readonly ApiTrafficRouteFilterItem[];
}

export interface ApiTrafficViewerToolbarCallbacks {
  readonly pause: () => void;
  readonly clear: () => void;
  readonly errors: () => void;
  readonly toggleIgnoreRoutes: () => void;
  readonly searchChanged: (value: string) => void;
  readonly routeVisibilityChanged: (change: { key: string; visible: boolean }) => void;
  readonly showAllRoutes: () => void;
  readonly hideAllRoutes: () => void;
}

export interface ApiTrafficViewerToolbarController {
  readonly element: HTMLElement;
  update(state: ApiTrafficViewerToolbarState): void;
  refreshLanguage(): void;
  destroy(): void;
}

export function createApiTrafficViewerToolbar(
  document: Document,
  callbacks: ApiTrafficViewerToolbarCallbacks,
  language: () => 'EN' | 'EL' = () => 'EN',
): ApiTrafficViewerToolbarController {
  const abortController = new AbortController();
  const element = document.createElement('div');
  element.className = 'debug-panel-tools api-traffic-toolbar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'API traffic controls');
  element.dataset.multilingualAriaLabel = 'ApiTrafficControls';

  const primary = document.createElement('span');
  primary.className = 'debug-toolbar-group';
  const pause = toolButton(document, 'bi-pause-fill', 'Pause live updates');
  pause.dataset.apiTrafficAction = 'pause';
  const clear = toolButton(document, 'bi-trash', 'Clear captured traffic');
  clear.dataset.apiTrafficAction = 'clear';
  clear.dataset.multilingualTitle = 'ClearApiTraffic';
  clear.dataset.multilingualTooltip = 'ClearApiTraffic';
  primary.append(pause, clear);

  const filters = document.createElement('span');
  filters.className = 'debug-toolbar-group';
  const errors = toolButton(document, 'bi-exclamation-octagon', 'Show errors only');
  errors.dataset.apiTrafficAction = 'errors';
  errors.dataset.multilingualTitle = 'ShowApiErrors';
  errors.dataset.multilingualTooltip = 'ShowApiErrors';

  const routeFilter = document.createElement('details');
  routeFilter.className = 'api-traffic-route-filter-wrap';
  const routeSummary = document.createElement('summary');
  routeSummary.className = 'debug-tool-button';
  routeSummary.title = 'Choose API calls to show';
  routeSummary.dataset.multilingualTitle = 'ChooseApiCalls';
  routeSummary.innerHTML = '<i class="bi bi-filter-square" aria-hidden="true"></i>';
  const routeMenu = document.createElement('div');
  routeMenu.className = 'api-traffic-route-menu';
  const routeActions = document.createElement('div');
  routeActions.className = 'api-traffic-route-menu-actions';
  const all = document.createElement('button');
  all.type = 'button';
  all.dataset.apiTrafficAction = 'routes-all';
  all.textContent = 'All';
  all.dataset.multilingualText = 'All';
  const none = document.createElement('button');
  none.type = 'button';
  none.dataset.apiTrafficAction = 'routes-none';
  none.textContent = 'None';
  none.dataset.multilingualText = 'None';
  routeActions.append(all, none);
  const routeList = document.createElement('div');
  routeList.className = 'api-traffic-route-menu-list';
  routeMenu.append(routeActions, routeList);
  routeFilter.append(routeSummary, routeMenu);

  const ignoreRoutes = toolButton(document, 'bi-eye', 'Ignore route visibility selections');
  ignoreRoutes.dataset.apiTrafficAction = 'ignore-routes';
  ignoreRoutes.dataset.multilingualTitle = 'IgnoreRouteVisibility';
  ignoreRoutes.dataset.multilingualTooltip = 'IgnoreRouteVisibility';
  filters.append(errors, routeFilter, ignoreRoutes);

  const search = document.createElement('input');
  search.className = 'api-traffic-filter';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = 'Search traffic';
  search.dataset.multilingualPlaceholder = 'SearchTraffic';
  search.setAttribute('aria-label', 'Search captured API traffic');
  search.dataset.multilingualAriaLabel = 'SearchCapturedTraffic';

  const stats = document.createElement('span');
  stats.className = 'api-traffic-stats';
  let visibleCount = 0;
  let totalCount = 0;
  function refreshLanguage(): void {
    const text = multilingual(language(), ['Requests'] as const);
    stats.textContent = `${visibleCount}/${totalCount} ${text.Requests}`;
  }
  element.append(primary, filters, search, stats);

  element.addEventListener(
    'click',
    (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-api-traffic-action]')
        ?.dataset.apiTrafficAction;
      switch (action) {
        case 'pause':
          callbacks.pause();
          break;
        case 'clear':
          callbacks.clear();
          break;
        case 'errors':
          callbacks.errors();
          break;
        case 'ignore-routes':
          callbacks.toggleIgnoreRoutes();
          break;
        case 'routes-all':
          callbacks.showAllRoutes();
          break;
        case 'routes-none':
          callbacks.hideAllRoutes();
          break;
      }
    },
    { signal: abortController.signal },
  );
  routeList.addEventListener(
    'change',
    (event) => {
      const input = (event.target as Element).closest<HTMLInputElement>('[data-api-route-key]');
      if (!input) return;
      callbacks.routeVisibilityChanged({
        key: input.dataset.apiRouteKey ?? '',
        visible: input.checked,
      });
    },
    { signal: abortController.signal },
  );
  search.addEventListener('input', () => callbacks.searchChanged(search.value), {
    signal: abortController.signal,
  });

  return {
    element,
    refreshLanguage,
    update(state) {
      pause.dataset.multilingualTitle = state.paused ? 'ResumeLiveUpdates' : 'PauseLiveUpdates';
      pause.dataset.multilingualTooltip = pause.dataset.multilingualTitle;
      pause.classList.toggle('is-active', state.paused);
      pause.querySelector('i')!.className = `bi ${state.paused ? 'bi-play-fill' : 'bi-pause-fill'}`;
      errors.classList.toggle('is-active', state.errorsOnly);
      ignoreRoutes.classList.toggle('is-active', state.ignoreRoutes);
      if (search.value !== state.searchText) search.value = state.searchText;
      visibleCount = state.visibleCount;
      totalCount = state.totalCount;
      refreshLanguage();
      routeList.replaceChildren(
        ...(state.routes.length
          ? state.routes.map((route) => routeOption(document, route))
          : [emptyRoute(document)]),
      );
    },
    destroy() {
      abortController.abort();
      element.remove();
    },
  };
}

function toolButton(document: Document, icon: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'debug-tool-button';
  button.type = 'button';
  button.title = title;
  button.dataset.debugTooltip = title;
  button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
  return button;
}

function routeOption(document: Document, route: ApiTrafficRouteFilterItem): HTMLElement {
  const label = document.createElement('label');
  label.className = 'api-traffic-route-option';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = route.visible;
  input.dataset.apiRouteKey = route.key;
  const call = document.createElement('span');
  call.className = 'api-traffic-route-call';
  const method = document.createElement('span');
  method.className = 'api-traffic-route-method';
  method.textContent = route.method;
  const path = document.createElement('span');
  path.className = 'api-traffic-route-path';
  path.textContent = route.path;
  call.append(method, document.createTextNode(' '), path);
  const count = document.createElement('span');
  count.className = 'api-traffic-route-count';
  count.classList.toggle('is-active', route.visible);
  count.textContent = String(route.count);
  label.append(input, call, count);
  return label;
}

function emptyRoute(document: Document): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'api-traffic-route-empty';
  empty.textContent = 'No API routes captured yet.';
  empty.dataset.multilingualText = 'NoApiRoutes';
  return empty;
}
