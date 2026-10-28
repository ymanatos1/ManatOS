import { multilingual } from '@manatos/shared-ui';
import { refreshMultilingualElements } from '../../rendering/multilingual.js';
import {
  formatCtxPath,
  type ApplicationState,
  type CtxCliCommandInput,
  type UiDebuggerMainView,
} from '@manatos/shared-ui';

import { createApiTrafficViewer, type ApiTrafficViewerController } from './ApiTrafficViewer.js';
import { createCtxViewer, type CtxViewerController } from './CtxViewer.js';
import { DebuggerHost } from './DebuggerHost.js';
import { DebuggerVerticalLayout, type DebuggerVerticalPanelKey } from './DebuggerVerticalLayout.js';
import { mountDebugTooltipHost } from './DebugTooltipHost.js';

let debuggerSequence = 0;

interface TargetCtxView {
  readonly id: `ctx:${string}`;
  readonly path: string;
  readonly label: string;
  readonly panelId: string;
  readonly controller: CtxViewerController;
}

export interface DebuggerController {
  readonly element: HTMLElement;
  focusDetached(): void;
  focusMain(): void;
  revealCtxPath(path: string): void;
  /** Keep a detached Global CLI running when the main debugger is hidden. */
  setMainVisible(visible: boolean): void;
  destroy(): void;
}

export interface DebuggerOptions {
  readonly state: ApplicationState;
  readonly expressionCapabilityDelegate?: CtxCliCommandInput['expressionCapabilityDelegate'];
  readonly closeRequested: () => void;
}

export function renderDebugger(): string {
  return '<div class="manatos-debugger-host" data-manatos-debugger-host></div>';
}

export function createDebugger(document: Document, options: DebuggerOptions): DebuggerController {
  const abortController = new AbortController();
  const hostController = new DebuggerHost({
    loadPlacement: () => options.state.debuggerWindowPlacement,
    savePlacement: (placement) => options.state.saveDebuggerWindowPlacement(placement),
  });
  const debuggerId = `manatos-debugger-${++debuggerSequence}`;
  const rootPanelId = `${debuggerId}-panel-ctx`;
  const apiTrafficPanelId = `${debuggerId}-panel-api-traffic`;
  const dock = document.createElement('aside');
  dock.className = 'developer-tools-dock';
  dock.setAttribute('aria-label', 'Debugging tools');
  dock.dataset.multilingualAriaLabel = 'DebuggingTools';
  const verticalLayout = new DebuggerVerticalLayout({
    dock,
    heightChanged: saveVerticalHeight,
  });

  const resize = document.createElement('div');
  resize.className = 'developer-tools-resize';
  resize.title = 'Drag to resize Debugging Tools; double-click to reset';
  resize.dataset.multilingualTitle = 'ResizeDebuggingTools';

  const tabs = document.createElement('div');
  tabs.className = 'developer-tools-tabs';
  const tabStrip = document.createElement('div');
  tabStrip.className = 'developer-tools-tab-strip';
  tabStrip.setAttribute('role', 'tablist');
  tabStrip.setAttribute('aria-label', 'Debugging tools');
  tabStrip.dataset.multilingualAriaLabel = 'DebuggingTools';

  const detach = document.createElement('button');
  detach.className = 'debug-tool-button developer-tools-detach';
  detach.type = 'button';
  const detachIcon = document.createElement('i');
  detachIcon.setAttribute('aria-hidden', 'true');
  detach.appendChild(detachIcon);

  const close = document.createElement('button');
  close.className = 'developer-tools-close';
  close.type = 'button';
  close.title = 'Close Debugging Tools';
  close.dataset.multilingualTitle = 'CloseDebuggingTools';
  close.setAttribute('aria-label', 'Close Debugging Tools');
  close.dataset.multilingualAriaLabel = 'CloseDebuggingTools';
  close.textContent = '×';
  tabs.append(tabStrip, detach, close);

  const body = document.createElement('div');
  body.className = 'developer-tools-body';
  dock.append(resize, tabs, body);

  let persistedActiveView = options.state.debuggerActiveView;
  let persistedWidth = options.state.developerToolsWidth;
  let activeTab: UiDebuggerMainView = 'ctx';
  let width = resolveWidth(persistedWidth, document.defaultView);
  let detached = false;
  let resizing = false;
  let targetSequence = 0;
  let resizeStartX = 0;
  let resizeStartWidth = width;
  const targetViews: TargetCtxView[] = [];
  let apiTrafficViewer: ApiTrafficViewerController | null = null;

  const rootViewer = createCtxViewer(document, {
    state: options.state,
    context: options.state.context,
    rootPath: 'ctx',
    expressionCapabilityDelegate: options.expressionCapabilityDelegate,
    openPathRequested: openPath,
  });
  configurePanel(rootViewer.element, rootPanelId, 'ctx');
  body.appendChild(rootViewer.element);

  const tooltipHost = mountDebugTooltipHost(dock);
  hostController.setDetachedChanged((value) => {
    detached = value;
    verticalLayout.ownerDocumentChanged();
    rootViewer.ownerDocumentChanged();
    for (const view of targetViews) view.controller.ownerDocumentChanged();
    updateDetachButton();
    applyWidth();
  });

  function saveVerticalHeight(key: DebuggerVerticalPanelKey, height: number | null): void {
    if (key === 'ctx-properties') {
      options.state.debuggerState.saveBrowserPreferences({ ctxPropertiesHeight: height });
    } else if (key === 'cli') {
      options.state.debuggerState.saveBrowserPreferences({ cliHeight: height });
    } else {
      options.state.debuggerState.saveBrowserPreferences({ apiDetailsHeight: height });
    }
  }

  function defaultWidth(view: Window | null): number {
    if (!view) return 520;
    return Math.max(420, Math.min(640, Math.floor(view.innerWidth * 0.28)));
  }

  function resolveWidth(value: number | null, view: Window | null): number {
    if (value === null) return defaultWidth(view);
    const viewportWidth = view?.innerWidth ?? 1920;
    return Math.max(420, Math.min(Math.floor(viewportWidth * 0.75), Math.round(value)));
  }

  function restorableView(view: UiDebuggerMainView): UiDebuggerMainView {
    if (view === 'ctx' || view === 'apiTraffic') return view;
    return targetViews.some((target) => target.id === view) ? view : 'ctx';
  }

  function selectView(view: UiDebuggerMainView): void {
    if (view !== 'ctx' && view !== 'apiTraffic' && !targetViews.some((item) => item.id === view)) {
      view = 'ctx';
    }
    activeTab = view;
    persistedActiveView = view;
    options.state.selectDebuggerView(view);
    renderTabs();
    renderActiveView();
  }

  function openPath(path: string): void {
    if (path === 'ctx') {
      selectView('ctx');
      return;
    }

    options.state.debuggerState.openCtxView(path);
    syncTargetViews();
    persistedActiveView = options.state.debuggerActiveView;
    activeTab = restorableView(persistedActiveView);
    renderTabs();
    renderActiveView();
  }

  function createTarget(path: string): TargetCtxView {
    const id = `ctx:${path}` as const;
    const controller = createCtxViewer(document, {
      state: options.state,
      context: options.state.context,
      rootPath: path,
      expressionCapabilityDelegate: options.expressionCapabilityDelegate,
      openPathRequested: openPath,
    });
    const panelId = `${debuggerId}-panel-target-${++targetSequence}`;
    configurePanel(controller.element, panelId, id);
    setPanelActive(controller.element, false);
    body.appendChild(controller.element);
    return Object.freeze({ id, path, label: formatCtxPath(path), panelId, controller });
  }

  function syncTargetViews(): void {
    const desired = options.state.debuggerState.ctxViews
      .filter((view) => view.rootPath !== 'ctx')
      .map((view) => view.rootPath);
    const desiredSet = new Set(desired);

    for (let index = targetViews.length - 1; index >= 0; index -= 1) {
      const view = targetViews[index]!;
      if (desiredSet.has(view.path)) continue;
      targetViews.splice(index, 1);
      view.controller.destroy();
    }

    const ordered = desired.map(
      (path) => targetViews.find((view) => view.path === path) ?? createTarget(path),
    );
    targetViews.splice(0, targetViews.length, ...ordered);
  }

  function closeTarget(view: TargetCtxView): void {
    options.state.debuggerState.closeCtxView(view.path);
    syncTargetViews();
    persistedActiveView = options.state.debuggerActiveView;
    activeTab = restorableView(persistedActiveView);
    renderTabs();
    renderActiveView();
  }

  function panelIdForTab(id: string): string {
    if (id === 'ctx') return rootPanelId;
    if (id === 'apiTraffic') return apiTrafficPanelId;
    return targetViews.find((view) => view.id === id)?.panelId ?? `${debuggerId}-panel-missing`;
  }

  function tabIdForPanel(panelId: string): string {
    return `${panelId}-tab`;
  }

  function configurePanel(element: HTMLElement, panelId: string, tabId: string): void {
    element.id = panelId;
    element.setAttribute('role', 'tabpanel');
    element.setAttribute('aria-labelledby', tabIdForPanel(panelId));
    element.dataset.debuggerPanel = tabId;
  }

  function setPanelActive(element: HTMLElement, active: boolean): void {
    element.hidden = !active;
    element.setAttribute('aria-hidden', String(!active));
    element.toggleAttribute('inert', !active);
  }

  function createTab(
    id: UiDebuggerMainView,
    caption: string,
    subtitle: string,
    tooltip: string,
    tooltipDetail: string,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    const active = activeTab === id;
    const panelId = panelIdForTab(id);
    button.className = 'developer-tools-tab';
    button.id = tabIdForPanel(panelId);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    button.dataset.debugTooltip = tooltip;
    button.dataset.debugTooltipDetail = tooltipDetail;

    const captionElement = document.createElement('span');
    captionElement.className = 'developer-tools-tab-caption';
    captionElement.textContent = caption;
    button.appendChild(captionElement);

    if (subtitle) {
      const subtitleElement = document.createElement('span');
      subtitleElement.className = 'developer-tools-tab-subtitle';
      subtitleElement.textContent = subtitle;
      button.appendChild(subtitleElement);
    }

    button.dataset.debuggerTab = id;
    return button;
  }

  function renderTabs(): void {
    const labels = multilingual(
      options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
      [
        'CtxViewerTitle',
        'LiveContextTree',
        'CtxViewerTooltip',
        'CtxViewerDescription',
        'ApiTrafficTitle',
        'UiToApi',
        'ApiTrafficTooltip',
        'ApiTrafficDescription',
        'CloseCtxView',
      ],
    );
    const rootTab = createTab(
      'ctx',
      labels.CtxViewerTitle,
      `(${labels.LiveContextTree})`,
      labels.CtxViewerTooltip,
      labels.CtxViewerDescription,
    );

    const targetTabs = targetViews.map((view) => {
      const wrap = document.createElement('span');
      wrap.className = 'developer-tools-target-tab-wrap';
      const button = createTab(
        view.id,
        view.label,
        '',
        view.label,
        multilingual(
          options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
          [],
        ).format('@CM.DedicatedCtxRoot', { path: view.label }),
      );
      button.classList.add('developer-tools-target-tab');
      const closeTargetButton = document.createElement('button');
      closeTargetButton.className = 'developer-tools-target-tab-close';
      closeTargetButton.type = 'button';
      closeTargetButton.title = labels.CloseCtxView;
      closeTargetButton.dataset.multilingualTitle = 'CloseCtxView';
      closeTargetButton.textContent = '×';
      closeTargetButton.dataset.debuggerCloseTarget = view.id;
      wrap.append(button, closeTargetButton);
      return wrap;
    });

    const apiTab = createTab(
      'apiTraffic',
      labels.ApiTrafficTitle,
      `(${labels.UiToApi})`,
      labels.ApiTrafficTooltip,
      labels.ApiTrafficDescription,
    );

    tabStrip.replaceChildren(rootTab, ...targetTabs, apiTab);
    queueMicrotask(() =>
      tabStrip
        .querySelector<HTMLElement>('[data-debugger-tab].is-active')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
  }

  function renderActiveView(): void {
    setPanelActive(rootViewer.element, activeTab === 'ctx');
    for (const view of targetViews) setPanelActive(view.controller.element, activeTab === view.id);
    if (activeTab === 'apiTraffic' && !apiTrafficViewer) {
      apiTrafficViewer = createApiTrafficViewer(document, options.state);
      configurePanel(apiTrafficViewer.element, apiTrafficPanelId, 'apiTraffic');
      body.appendChild(apiTrafficViewer.element);
    }
    if (apiTrafficViewer) setPanelActive(apiTrafficViewer.element, activeTab === 'apiTraffic');
  }

  function updateDetachButton(): void {
    const labels = multilingual(
      options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
      [
        'AttachDebuggingTools',
        'DetachDebuggingTools',
        'AttachDebuggingToolsDetail',
        'DetachDebuggingToolsDetail',
      ],
    );
    const label = labels.select(detached, '@CM.AttachDebuggingTools', '@CM.DetachDebuggingTools');
    detach.dataset.debugTooltip = label;
    detach.dataset.debugTooltipDetail = labels.select(
      detached,
      '@CM.AttachDebuggingToolsDetail',
      '@CM.DetachDebuggingToolsDetail',
    );
    detach.setAttribute('aria-label', label);
    detachIcon.className = detached ? 'bi bi-box-arrow-in-down-left' : 'bi bi-box-arrow-up-right';
  }

  function applyWidth(): void {
    dock.style.width = detached ? '' : `${Math.round(width)}px`;
  }

  tabStrip.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const closeTargetId = target.closest<HTMLElement>('[data-debugger-close-target]')?.dataset
        .debuggerCloseTarget;
      if (closeTargetId) {
        const view = targetViews.find((candidate) => candidate.id === closeTargetId);
        if (view) closeTarget(view);
        return;
      }
      const tabId = target.closest<HTMLElement>('[data-debugger-tab]')?.dataset.debuggerTab as
        UiDebuggerMainView | undefined;
      if (tabId) selectView(tabId);
    },
    { signal: abortController.signal },
  );

  detach.addEventListener(
    'click',
    () => {
      hostController.toggle(dock);
    },
    { signal: abortController.signal },
  );

  resize.addEventListener(
    'pointerdown',
    (event) => {
      if (detached) return;
      resizing = true;
      resizeStartX = event.clientX;
      resizeStartWidth = width;
      resize.setPointerCapture(event.pointerId);
    },
    { signal: abortController.signal },
  );
  resize.addEventListener(
    'pointermove',
    (event) => {
      if (!resizing || detached) return;
      const viewportWidth = document.defaultView?.innerWidth ?? 1920;
      width = Math.max(
        420,
        Math.min(Math.floor(viewportWidth * 0.75), resizeStartWidth + resizeStartX - event.clientX),
      );
      applyWidth();
    },
    { signal: abortController.signal },
  );
  const stopResize = () => {
    if (!resizing) return;
    resizing = false;
    persistedWidth = width;
    options.state.saveDeveloperToolsWidth(width);
  };
  resize.addEventListener('pointerup', stopResize, { signal: abortController.signal });
  resize.addEventListener('pointercancel', stopResize, { signal: abortController.signal });
  resize.addEventListener(
    'dblclick',
    () => {
      if (detached) return;
      width = defaultWidth(document.defaultView);
      persistedWidth = null;
      options.state.saveDeveloperToolsWidth(null);
      applyWidth();
    },
    { signal: abortController.signal },
  );
  close.addEventListener(
    'click',
    () => {
      if (hostController.detached) hostController.attach(false);
      options.closeRequested();
    },
    { signal: abortController.signal },
  );

  const unsubscribeState = options.state.subscribe((change) => {
    if (change === 'language') {
      renderTabs();
      updateDetachButton();
      refreshMultilingualElements(
        dock,
        options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
      );
      return;
    }
    if (change !== 'uiState') return;

    syncTargetViews();
    const nextActiveView = options.state.debuggerActiveView;
    if (nextActiveView !== persistedActiveView || activeTab !== restorableView(nextActiveView)) {
      persistedActiveView = nextActiveView;
      activeTab = restorableView(nextActiveView);
      renderTabs();
      renderActiveView();
    }

    const nextWidth = options.state.developerToolsWidth;
    if (nextWidth !== persistedWidth) {
      persistedWidth = nextWidth;
      width = resolveWidth(nextWidth, document.defaultView);
      applyWidth();
    }
  });

  syncTargetViews();
  activeTab = restorableView(persistedActiveView);
  updateDetachButton();
  applyWidth();
  renderTabs();
  renderActiveView();
  refreshMultilingualElements(
    dock,
    options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
  );

  return {
    element: dock,
    setMainVisible(visible) {
      if (!visible && hostController.detached) hostController.attach(false);
      // The native detached Global CLI is outside this dock. Hiding the dock
      // must not dispose its live input, transcript, or popup window.
      dock.style.display = visible ? '' : 'none';
    },
    focusDetached() {
      hostController.focusDetached();
    },
    focusMain() {
      hostController.focusMain();
    },
    revealCtxPath(path) {
      // Reusing the existing main CTX tab is essential: a popup reveal is
      // not a new targeted inspector and must not add CTX history entries.
      selectView('ctx');
      rootViewer.reveal(path);
    },
    destroy() {
      unsubscribeState();
      verticalLayout.destroy();
      hostController.destroy();
      abortController.abort();
      tooltipHost.destroy();
      rootViewer.destroy();
      for (const view of targetViews.splice(0)) view.controller.destroy();
      apiTrafficViewer?.destroy();
      apiTrafficViewer = null;
      dock.remove();
    },
  };
}
