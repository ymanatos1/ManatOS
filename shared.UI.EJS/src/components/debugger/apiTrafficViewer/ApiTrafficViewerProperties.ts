import {
  multilingual,
  projectApiTrafficTransactionEntries,
  correlatedUiResourceResponse,
  apiTrafficResponseBody,
  type ApiTrafficEntry,
} from '@manatos/shared-ui';
import { refreshMultilingualElements } from '../../../rendering/multilingual.js';

import {
  createApiTrafficViewerCaption,
  type ApiTrafficViewerCaptionController,
} from './ApiTrafficViewerCaption.js';
import {
  createApiTrafficPayloadTab,
  type ApiTrafficPayloadMetadataItem,
  type ApiTrafficPayloadTabController,
} from './tabs/ApiTrafficPayloadTab.js';
import {
  createApiTrafficContextTab,
  type ApiTrafficContextTabController,
} from './tabs/ApiTrafficContextTab.js';
import {
  createApiTrafficLogsTab,
  type ApiTrafficLogsTabController,
} from './tabs/ApiTrafficLogsTab.js';
import {
  createApiTrafficTransactionTab,
  type ApiTrafficTransactionTabController,
} from './tabs/ApiTrafficTransactionTab.js';

type ApiTrafficDetailsTab =
  'request' | 'response' | 'apiCtx' | 'storageCtx' | 'logs' | 'transaction';

interface ApiTrafficDetailsTabItem {
  readonly id: ApiTrafficDetailsTab;
  readonly label: string;
  readonly detail: string;
}

type DetailsBodyController =
  | ApiTrafficPayloadTabController
  | ApiTrafficContextTabController
  | ApiTrafficLogsTabController
  | ApiTrafficTransactionTabController
  | { readonly element: HTMLElement; destroy(): void };

export interface ApiTrafficViewerPropertiesController {
  readonly element: HTMLElement;
  refreshLanguage(): void;
  update(
    entry: ApiTrafficEntry,
    allEntries: readonly ApiTrafficEntry[],
    heightPreference?: number | null,
  ): void;
  destroy(): void;
}

export function createApiTrafficViewerProperties(
  document: Document,
  entry: ApiTrafficEntry,
  allEntries: readonly ApiTrafficEntry[],
  closeRequested: () => void,
  heightPreference: number | null = null,
  language: () => 'EN' | 'EL' = () => 'EN',
): ApiTrafficViewerPropertiesController {
  const uiText = () =>
    multilingual(language(), [
      'Request',
      'Response',
      'RequestInfo',
      'ResponseInfo',
      'ApiCtxTab',
      'ApiCtxDescription',
      'StorageCtxTab',
      'StorageCtxDescription',
      'Logs',
      'LogsDescription',
      'Transaction',
      'TransactionDescription',
      'RequestId',
      'Method',
      'Path',
      'Started',
      'Status',
      'Duration',
      'State',
      'Error',
    ] as const);
  const abortController = new AbortController();
  const element = document.createElement('section');
  element.className = 'api-traffic-details';
  element.setAttribute('aria-label', 'Selected API request details');
  element.dataset.multilingualAriaLabel = 'SelectedApiDetails';
  element.dataset.debugResizablePanel = 'api-details';
  let preferredHeight = resolveHeight(heightPreference);
  element.dataset.debugPreferredHeight = String(preferredHeight);
  element.style.height = `${preferredHeight}px`;

  const heading = document.createElement('div');
  heading.className = 'api-traffic-details-heading';
  let currentEntry = entry;
  let currentEntries = allEntries;
  const caption: ApiTrafficViewerCaptionController = createApiTrafficViewerCaption(
    document,
    currentEntry,
  );
  const close = document.createElement('button');
  close.className = 'btn-close-debug';
  close.type = 'button';
  close.title = 'Close request details';
  close.dataset.multilingualTitle = 'CloseRequestDetails';
  close.textContent = '×';
  heading.append(caption.element, close);

  const tabRow = document.createElement('div');
  tabRow.className = 'api-traffic-details-tab-row';
  const tabStrip = document.createElement('div');
  tabStrip.className = 'api-traffic-details-tabs';
  tabStrip.setAttribute('role', 'tablist');
  tabStrip.setAttribute('aria-label', 'API request details');
  tabStrip.dataset.multilingualAriaLabel = 'ApiRequestDetails';
  const overflow = document.createElement('div');
  overflow.className = 'api-traffic-details-tab-overflow';
  const overflowToggle = document.createElement('button');
  overflowToggle.className = 'debug-tool-button api-traffic-details-tab-overflow-toggle';
  overflowToggle.type = 'button';
  overflowToggle.title = 'Show all API detail tabs';
  overflowToggle.dataset.multilingualTitle = 'ShowAllApiTabs';
  overflowToggle.setAttribute('aria-label', 'Show all API detail tabs');
  overflowToggle.dataset.multilingualAriaLabel = 'ShowAllApiTabs';
  overflowToggle.setAttribute('aria-expanded', 'false');
  overflowToggle.innerHTML = '<i class="bi bi-chevron-down" aria-hidden="true"></i>';
  const overflowMenu = document.createElement('div');
  overflowMenu.className = 'api-traffic-details-tab-overflow-menu';
  overflowMenu.setAttribute('role', 'menu');
  overflowMenu.hidden = true;
  overflow.append(overflowToggle, overflowMenu);
  overflow.hidden = true;
  tabRow.append(tabStrip, overflow);

  const body = document.createElement('div');
  body.className = 'api-traffic-details-body';
  const resize = document.createElement('div');
  resize.className = 'api-traffic-details-resize';
  resize.dataset.debugVerticalResize = 'api-details';
  resize.title = 'Drag to resize; double-click to reset';
  element.append(heading, tabRow, body, resize);

  let activeTab: ApiTrafficDetailsTab = 'request';
  let overflowOpen = false;
  let bodyController: DetailsBodyController | null = null;
  let bodyControllerTab: ApiTrafficDetailsTab | null = null;
  let bodyControllerSource: unknown = null;
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(refreshOverflow) : null;
  resizeObserver?.observe(tabStrip);

  function availableTabs(value: ApiTrafficEntry): readonly ApiTrafficDetailsTabItem[] {
    const text = uiText();
    return [
      { id: 'request', label: text.Request, detail: text.RequestInfo },
      { id: 'response', label: text.Response, detail: text.ResponseInfo },
      ...(value.diagnostics?.apiContext
        ? [
            {
              id: 'apiCtx' as const,
              label: text.ApiCtxTab,
              detail: text.ApiCtxDescription,
            },
          ]
        : []),
      ...(value.diagnostics?.storageContexts?.length
        ? [
            {
              id: 'storageCtx' as const,
              label: text.StorageCtxTab,
              detail: text.StorageCtxDescription,
            },
          ]
        : []),
      ...(value.diagnostics?.logs?.length
        ? [
            {
              id: 'logs' as const,
              label: text.Logs,
              detail: text.LogsDescription,
            },
          ]
        : []),
      ...(value.transactionId
        ? [
            {
              id: 'transaction' as const,
              label: text.Transaction,
              detail: text.TransactionDescription,
            },
          ]
        : []),
    ];
  }

  function requestMetadata(value: ApiTrafficEntry): readonly ApiTrafficPayloadMetadataItem[] {
    const text = uiText();
    return [
      { label: text.RequestId, value: value.requestId },
      { label: text.Method, value: value.method },
      { label: text.Path, value: value.path },
      { label: text.Started, value: value.startedAt },
      ...(value.source === 'surface-upstream'
        ? [{ label: 'Capture', value: 'UI server → API (upstream summary)' }]
        : []),
      ...(value.transactionId ? [{ label: text.Transaction, value: value.transactionId }] : []),
    ];
  }

  function responseMetadata(value: ApiTrafficEntry): readonly ApiTrafficPayloadMetadataItem[] {
    const text = uiText();
    return [
      { label: text.Status, value: `${value.status ?? '…'} ${value.statusText}`.trim() },
      { label: text.Duration, value: value.durationMs === null ? '…' : `${value.durationMs} ms` },
      { label: text.State, value: value.state },
      ...(value.responseBody === undefined && correlatedUiResourceResponse(currentEntries, value)
        ? [
            {
              label: 'Body source',
              value: 'Correlated UI resource response (not raw upstream API)',
            },
          ]
        : value.source === 'surface-upstream'
          ? [{ label: 'Body source', value: 'Upstream body not captured' }]
          : []),
      ...(value.error ? [{ label: text.Error, value: value.error }] : []),
    ];
  }

  function effectiveTab(): ApiTrafficDetailsTab {
    return availableTabs(currentEntry).some((tab) => tab.id === activeTab) ? activeTab : 'request';
  }

  function createBodyController(tab: ApiTrafficDetailsTab): DetailsBodyController {
    switch (tab) {
      case 'request':
        return createApiTrafficPayloadTab(
          document,
          requestMetadata(currentEntry),
          currentEntry.requestHeaders,
          currentEntry.requestBody,
          language,
        );
      case 'response':
        return createApiTrafficPayloadTab(
          document,
          responseMetadata(currentEntry),
          currentEntry.responseHeaders,
          apiTrafficResponseBody(currentEntries, currentEntry),
          language,
        );
      case 'apiCtx':
        return createApiTrafficContextTab(document, currentEntry.diagnostics!.apiContext!, true);
      case 'storageCtx': {
        const wrapper = document.createElement('div');
        wrapper.className = 'api-traffic-storage-contexts';
        const children = (currentEntry.diagnostics?.storageContexts ?? []).map((context) =>
          createApiTrafficContextTab(document, context),
        );
        wrapper.append(...children.map((child) => child.element));
        return {
          element: wrapper,
          destroy() {
            for (const child of children) child.destroy();
            wrapper.remove();
          },
        };
      }
      case 'logs':
        return createApiTrafficLogsTab(document, currentEntry.diagnostics?.logs ?? []);
      case 'transaction':
        return createApiTrafficTransactionTab(
          document,
          currentEntry.transactionId!,
          projectApiTrafficTransactionEntries(currentEntries, currentEntry.transactionId),
        );
    }
  }

  function controllerSource(tab: ApiTrafficDetailsTab): unknown {
    if (tab === 'apiCtx') return currentEntry.diagnostics?.apiContext ?? null;
    if (tab === 'storageCtx') return currentEntry.diagnostics?.storageContexts ?? null;
    return null;
  }

  function updateBodyController(tab: ApiTrafficDetailsTab): void {
    const source = controllerSource(tab);
    if (
      bodyControllerTab !== tab ||
      ((tab === 'apiCtx' || tab === 'storageCtx') && bodyControllerSource !== source)
    ) {
      bodyController?.destroy();
      bodyController = createBodyController(tab);
      bodyControllerTab = tab;
      bodyControllerSource = source;
      body.replaceChildren(bodyController.element);
      return;
    }

    if (tab === 'request') {
      (bodyController as ApiTrafficPayloadTabController).update(
        requestMetadata(currentEntry),
        currentEntry.requestHeaders,
        currentEntry.requestBody,
      );
    } else if (tab === 'response') {
      (bodyController as ApiTrafficPayloadTabController).update(
        responseMetadata(currentEntry),
        currentEntry.responseHeaders,
        apiTrafficResponseBody(currentEntries, currentEntry),
      );
    } else if (tab === 'logs') {
      (bodyController as ApiTrafficLogsTabController).update(currentEntry.diagnostics?.logs ?? []);
    } else if (tab === 'transaction') {
      (bodyController as ApiTrafficTransactionTabController).update(
        currentEntry.transactionId!,
        projectApiTrafficTransactionEntries(currentEntries, currentEntry.transactionId),
      );
    }
  }

  function renderTabs(): void {
    const tabs = availableTabs(currentEntry);
    const effective = effectiveTab();
    if (effective !== activeTab) activeTab = effective;
    tabStrip.replaceChildren(...tabs.map((tab) => tabButton(document, tab, activeTab)));
    overflowMenu.replaceChildren(...tabs.map((tab) => overflowItem(document, tab, activeTab)));
    queueMicrotask(refreshOverflow);
  }

  function render(): void {
    caption.update(currentEntry);
    renderTabs();
    updateBodyController(activeTab);
    // EJS1 creates native elements for every detail-tab change. Translate
    // newly mounted controls immediately, not only on the next history event.
    refreshMultilingualElements(element, language());
  }

  function selectTab(tab: ApiTrafficDetailsTab): void {
    if (!availableTabs(currentEntry).some((item) => item.id === tab)) return;
    activeTab = tab;
    overflowOpen = false;
    overflowMenu.hidden = true;
    render();
    tabStrip
      .querySelector<HTMLElement>(`[data-api-detail-tab="${tab}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function refreshOverflow(): void {
    const overflowing = tabStrip.scrollWidth > tabStrip.clientWidth + 2;
    overflow.hidden = !overflowing;
    if (!overflowing) {
      overflowOpen = false;
      overflowMenu.hidden = true;
    }
  }

  tabStrip.addEventListener(
    'click',
    (event) => {
      const tab = (event.target as Element).closest<HTMLElement>('[data-api-detail-tab]')?.dataset
        .apiDetailTab as ApiTrafficDetailsTab | undefined;
      if (tab) selectTab(tab);
    },
    { signal: abortController.signal },
  );
  overflowToggle.addEventListener(
    'click',
    (event) => {
      event.stopPropagation();
      overflowOpen = !overflowOpen;
      overflowMenu.hidden = !overflowOpen;
      overflowToggle.setAttribute('aria-expanded', String(overflowOpen));
    },
    { signal: abortController.signal },
  );
  overflowMenu.addEventListener(
    'click',
    (event) => {
      const tab = (event.target as Element).closest<HTMLElement>('[data-api-overflow-tab]')?.dataset
        .apiOverflowTab as ApiTrafficDetailsTab | undefined;
      if (tab) selectTab(tab);
    },
    { signal: abortController.signal },
  );
  close.addEventListener('click', closeRequested, { signal: abortController.signal });

  render();
  return {
    element,
    refreshLanguage: render,
    update(nextEntry, nextEntries, nextHeightPreference) {
      const identityChanged = nextEntry.requestId !== currentEntry.requestId;
      currentEntry = nextEntry;
      currentEntries = nextEntries;
      if (identityChanged) {
        activeTab = 'request';
        overflowOpen = false;
        overflowMenu.hidden = true;
        overflowToggle.setAttribute('aria-expanded', 'false');
        bodyController?.destroy();
        bodyController = null;
        bodyControllerTab = null;
        bodyControllerSource = null;
      }
      if (nextHeightPreference !== undefined) {
        const nextPreferredHeight = resolveHeight(nextHeightPreference);
        if (nextPreferredHeight !== preferredHeight) {
          preferredHeight = nextPreferredHeight;
          element.dataset.debugPreferredHeight = String(preferredHeight);
          element.style.height = `${preferredHeight}px`;
        }
      }
      render();
    },
    destroy() {
      abortController.abort();
      resizeObserver?.disconnect();
      bodyController?.destroy();
      bodyController = null;
      caption.destroy();
      element.remove();
    },
  };
}

function tabButton(
  document: Document,
  tab: ApiTrafficDetailsTabItem,
  activeTab: ApiTrafficDetailsTab,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.apiDetailTab = tab.id;
  button.dataset.debugTooltip = tab.label;
  button.dataset.debugTooltipDetail = tab.detail;
  button.classList.toggle('is-active', tab.id === activeTab);
  button.setAttribute('aria-selected', String(tab.id === activeTab));
  button.textContent = tab.label;
  return button;
}

function overflowItem(
  document: Document,
  tab: ApiTrafficDetailsTabItem,
  activeTab: ApiTrafficDetailsTab,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'api-traffic-details-tab-overflow-item';
  button.classList.toggle('is-active', tab.id === activeTab);
  button.dataset.apiOverflowTab = tab.id;
  button.setAttribute('role', 'menuitem');
  const icon = document.createElement('i');
  icon.className = `bi ${tab.id === activeTab ? 'bi-check2' : 'bi-dot'}`;
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = tab.label;
  button.append(icon, label);
  return button;
}

function resolveHeight(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 260;
  return Math.max(140, Math.round(value!));
}
