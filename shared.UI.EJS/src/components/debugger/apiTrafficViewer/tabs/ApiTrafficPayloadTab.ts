import { formatCtxValue } from '@manatos/shared-ui';
import { refreshMultilingualElements } from '../../../../rendering/multilingual.js';

import { createApiTrafficHeaders, type ApiTrafficHeadersController } from '../ApiTrafficHeaders.js';

export interface ApiTrafficPayloadMetadataItem {
  readonly label: string;
  readonly value: string;
}

export interface ApiTrafficPayloadTabController {
  readonly element: HTMLElement;
  update(
    metadata: readonly ApiTrafficPayloadMetadataItem[],
    headers: Readonly<Record<string, string>>,
    body: unknown,
  ): void;
  destroy(): void;
}

export function createApiTrafficPayloadTab(
  document: Document,
  metadata: readonly ApiTrafficPayloadMetadataItem[],
  headers: Readonly<Record<string, string>>,
  body: unknown,
  language: () => 'EN' | 'EL' = () => 'EN',
): ApiTrafficPayloadTabController {
  const abortController = new AbortController();
  const element = document.createElement('div');
  element.className = 'api-traffic-payload';
  const meta = document.createElement('dl');
  meta.className = 'api-traffic-meta';
  const tabs = document.createElement('div');
  tabs.className = 'api-traffic-payload-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Payload sections');
  tabs.dataset.multilingualAriaLabel = 'PayloadSections';
  const headersButton = payloadTabButton(
    document,
    'headers',
    'Headers',
    'HTTP header names and values.',
    'Headers',
    'HttpHeaderDescriptions',
  );
  const bodyButton = payloadTabButton(
    document,
    'body',
    'Body',
    'Captured request or response body.',
    'Body',
    'ApiBodyDescription',
  );
  tabs.append(headersButton);
  const content = document.createElement('div');
  content.className = 'api-traffic-payload-body';
  element.append(meta, tabs, content);

  let activeTab: 'headers' | 'body' = 'headers';
  let currentMetadata = metadata;
  let currentHeaders = headers;
  let currentBody = body;
  let headersController: ApiTrafficHeadersController | null = null;

  function hasBody(): boolean {
    return currentBody !== undefined;
  }

  function renderMetadata(): void {
    const nodes: Node[] = [];
    for (const item of currentMetadata) {
      const term = document.createElement('dt');
      term.textContent = item.label;
      const description = document.createElement('dd');
      description.textContent = item.value;
      nodes.push(term, description);
    }
    meta.replaceChildren(...nodes);
  }

  function renderContent(): void {
    if (!hasBody() && activeTab === 'body') activeTab = 'headers';
    if (hasBody()) {
      if (!bodyButton.isConnected) tabs.append(bodyButton);
    } else {
      bodyButton.remove();
    }
    headersButton.classList.toggle('is-active', activeTab === 'headers');
    bodyButton.classList.toggle('is-active', activeTab === 'body');

    if (activeTab === 'headers') {
      if (!headersController) headersController = createApiTrafficHeaders(document, currentHeaders);
      else headersController.update(currentHeaders);
      content.replaceChildren(headersController.element);
      refreshMultilingualElements(element, language());
      return;
    }

    headersController?.destroy();
    headersController = null;
    const pre = document.createElement('pre');
    pre.className = 'api-traffic-payload-pre';
    pre.textContent = formatCtxValue(currentBody);
    content.replaceChildren(pre);
    refreshMultilingualElements(element, language());
  }

  function render(): void {
    renderMetadata();
    renderContent();
  }

  tabs.addEventListener(
    'click',
    (event) => {
      const tab = (event.target as Element).closest<HTMLElement>('[data-api-payload-tab]')?.dataset
        .apiPayloadTab;
      if (tab !== 'headers' && tab !== 'body') return;
      if (tab === 'body' && !hasBody()) return;
      activeTab = tab;
      renderContent();
    },
    { signal: abortController.signal },
  );

  render();
  return {
    element,
    update(nextMetadata, nextHeaders, nextBody) {
      currentMetadata = nextMetadata;
      currentHeaders = nextHeaders;
      currentBody = nextBody;
      render();
    },
    destroy() {
      abortController.abort();
      headersController?.destroy();
      headersController = null;
      element.remove();
    },
  };
}

function payloadTabButton(
  document: Document,
  id: 'headers' | 'body',
  label: string,
  detail: string,
  labelKey: string,
  detailKey: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.apiPayloadTab = id;
  button.dataset.debugTooltip = label;
  button.dataset.debugTooltipDetail = detail;
  button.dataset.multilingualText = labelKey;
  button.dataset.multilingualTooltip = labelKey;
  button.dataset.multilingualTooltipDetail = detailKey;
  button.textContent = label;
  return button;
}
