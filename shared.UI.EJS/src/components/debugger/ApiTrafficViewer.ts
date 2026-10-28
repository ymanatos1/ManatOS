import { refreshMultilingualElements } from '../../rendering/multilingual.js';
import {
  apiTrafficHistory,
  clearApiTrafficView,
  findApiTrafficEntry,
  projectApiTrafficEntries,
  projectApiTrafficRoutes,
  toggleApiTrafficPause,
  type ApiTrafficSnapshot,
  type ApplicationState,
} from '@manatos/shared-ui';

import {
  createApiTrafficViewerList,
  type ApiTrafficViewerListController,
} from './apiTrafficViewer/ApiTrafficViewerList.js';
import {
  createApiTrafficViewerProperties,
  type ApiTrafficViewerPropertiesController,
} from './apiTrafficViewer/ApiTrafficViewerProperties.js';
import {
  createApiTrafficViewerToolbar,
  type ApiTrafficViewerToolbarController,
} from './apiTrafficViewer/ApiTrafficViewerToolbar.js';

export interface ApiTrafficViewerController {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createApiTrafficViewer(
  document: Document,
  state?: ApplicationState,
): ApiTrafficViewerController {
  const element = document.createElement('section');
  element.className = 'api-traffic-panel debug-panel';
  element.setAttribute('aria-label', 'ManatOS API traffic viewer');
  element.dataset.multilingualAriaLabel = 'ApiTrafficViewer';

  let revision = apiTrafficHistory.revision;
  let selectedId: number | null = null;
  let pausedSnapshot: ApiTrafficSnapshot | null = null;
  let errorsOnly = state?.debuggerState.apiTraffic.errorsOnly ?? false;
  let ignoreRoutes = state?.debuggerState.apiTraffic.ignoreRoutes ?? false;
  let searchText = '';
  let hiddenRoutes: ReadonlySet<string> = new Set(
    state?.debuggerState.apiTraffic.hiddenRoutes ?? [],
  );
  let columnWidths = state?.debuggerState.browser.apiColumnWidths ?? [];
  let detailsHeight = state?.debuggerState.browser.apiDetailsHeight ?? null;
  let properties: ApiTrafficViewerPropertiesController | null = null;
  const language = (): 'EN' | 'EL' =>
    state?.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN';

  const toolbar: ApiTrafficViewerToolbarController = createApiTrafficViewerToolbar(
    document,
    {
      pause() {
        const next = toggleApiTrafficPause(apiTrafficHistory, { pausedSnapshot, selectedId });
        pausedSnapshot = next.pausedSnapshot;
        selectedId = next.selectedId;
        render();
      },
      clear() {
        const next = clearApiTrafficView(apiTrafficHistory, { pausedSnapshot, selectedId });
        pausedSnapshot = next.pausedSnapshot;
        selectedId = next.selectedId;
        render();
      },
      errors() {
        errorsOnly = !errorsOnly;
        state?.debuggerState.updateApiTraffic({ errorsOnly });
        render();
      },
      toggleIgnoreRoutes() {
        ignoreRoutes = !ignoreRoutes;
        state?.debuggerState.updateApiTraffic({ ignoreRoutes });
        render();
      },
      searchChanged(value) {
        searchText = value;
        render();
      },
      routeVisibilityChanged(change) {
        const next = new Set(hiddenRoutes);
        if (change.visible) next.delete(change.key);
        else next.add(change.key);
        saveHiddenRoutes(next);
      },
      showAllRoutes() {
        saveHiddenRoutes(new Set());
      },
      hideAllRoutes() {
        saveHiddenRoutes(new Set(routes().map((route) => route.key)));
      },
    },
    language,
  );

  const propertiesRegion = document.createElement('div');
  propertiesRegion.className = 'api-traffic-properties-region';
  const list: ApiTrafficViewerListController = createApiTrafficViewerList(
    document,
    (id) => {
      const openingDetails = selectedId === null;
      selectedId = id;
      render();
      if (openingDetails) queueMicrotask(() => revealSelectedEntry(id));
    },
    columnWidths,
    (widths) => {
      columnWidths = widths;
      state?.debuggerState.saveBrowserPreferences({ apiColumnWidths: widths });
    },
  );
  element.append(toolbar.element, propertiesRegion, list.element);

  function baseEntries() {
    void revision;
    return pausedSnapshot?.entries ?? apiTrafficHistory.entries();
  }

  function routes() {
    return projectApiTrafficRoutes(baseEntries(), hiddenRoutes);
  }

  function visibleEntries() {
    return projectApiTrafficEntries(baseEntries(), {
      errorsOnly,
      ignoreRoutes,
      searchText,
      hiddenRoutes,
    });
  }

  function selectedEntry() {
    return findApiTrafficEntry(baseEntries(), selectedId);
  }

  function revealSelectedEntry(id: number): void {
    list.element
      .querySelector<HTMLElement>(`[data-api-entry-id="${id}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  function saveHiddenRoutes(next: ReadonlySet<string>): void {
    hiddenRoutes = next;
    state?.debuggerState.updateApiTraffic({ hiddenRoutes: [...next] });
    render();
  }

  function loadState(): void {
    if (!state) return;
    const api = state.debuggerState.apiTraffic;
    errorsOnly = api.errorsOnly;
    ignoreRoutes = api.ignoreRoutes;
    hiddenRoutes = new Set(api.hiddenRoutes);
    columnWidths = state.debuggerState.browser.apiColumnWidths;
    detailsHeight = state.debuggerState.browser.apiDetailsHeight;
  }

  function render(): void {
    const entries = baseEntries();
    const visible = visibleEntries();
    toolbar.update({
      paused: pausedSnapshot !== null,
      errorsOnly,
      ignoreRoutes,
      searchText,
      visibleCount: visible.length,
      totalCount: entries.length,
      routes: routes(),
    });
    list.update(visible, selectedId, columnWidths);

    const entry = selectedEntry();
    if (!entry) {
      properties?.destroy();
      properties = null;
      propertiesRegion.replaceChildren();
      refreshMultilingualElements(
        element,
        state?.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
      );
      return;
    }

    if (!properties) {
      properties = createApiTrafficViewerProperties(
        document,
        entry,
        entries,
        () => {
          selectedId = null;
          render();
        },
        detailsHeight,
        language,
      );
      propertiesRegion.replaceChildren(properties.element);
    } else {
      properties.update(entry, entries, detailsHeight);
    }
    refreshMultilingualElements(
      element,
      state?.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
    );
  }

  const unsubscribeHistory = apiTrafficHistory.subscribe((nextRevision) => {
    revision = nextRevision;
    if (!pausedSnapshot) render();
  });
  const unsubscribeState = state?.subscribe((change) => {
    if (change === 'language') {
      toolbar.refreshLanguage();
      properties?.refreshLanguage();
      refreshMultilingualElements(element, language());
      return;
    }
    if (change !== 'uiState') return;
    loadState();
    render();
  });

  render();
  return {
    element,
    destroy() {
      unsubscribeHistory();
      unsubscribeState?.();
      pausedSnapshot = null;
      properties?.destroy();
      properties = null;
      toolbar.destroy();
      list.destroy();
      element.remove();
    },
  };
}
