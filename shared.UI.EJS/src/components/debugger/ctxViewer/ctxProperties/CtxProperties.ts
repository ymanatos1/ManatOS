import { formatCtxPath, projectCtxNodeProperties, type ApplicationState } from '@manatos/shared-ui';

import { renderCtxPropertiesAttrs } from './CtxPropertiesAttrs.js';
import { renderCtxPropertiesMain } from './CtxPropertiesMain.js';
import { renderCtxPropertiesProps } from './CtxPropertiesProps.js';
import { createCtxPropertiesSubscribers } from './CtxPropertiesSubscribers.js';

type CtxPropertiesTab = 'main' | 'properties' | 'attributes' | 'subscribers';

export interface CtxPropertiesController {
  readonly element: HTMLElement;
  update(path: string, revision: number, heightPreference?: number | null): void;
  destroy(): void;
}

export function createCtxProperties(
  document: Document,
  context: ApplicationState['context'],
  path: string,
  revision: number,
  closeRequested: () => void,
  navigate: (path: string) => void,
  heightPreference: number | null = null,
): CtxPropertiesController {
  const abortController = new AbortController();
  const element = document.createElement('section');
  element.className = 'ctx-debug-properties';
  element.setAttribute('aria-label', 'CTX node properties');
  element.dataset.multilingualAriaLabel = 'CtxNodeProperties';
  element.dataset.debugResizablePanel = 'ctx-properties';
  let preferredHeight = resolveHeight(heightPreference);
  element.dataset.debugPreferredHeight = String(preferredHeight);
  element.style.height = `${preferredHeight}px`;

  const heading = document.createElement('div');
  heading.className = 'ctx-debug-properties-heading';
  const headingText = document.createElement('strong');
  const close = document.createElement('button');
  close.className = 'btn-close-debug';
  close.type = 'button';
  close.title = 'Close properties';
  close.dataset.multilingualTitle = 'CloseProperties';
  close.textContent = '×';
  close.addEventListener('click', closeRequested, { signal: abortController.signal });
  heading.append(headingText, close);

  const tabs = document.createElement('div');
  tabs.className = 'ctx-debug-properties-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'CTX node property sections');
  tabs.dataset.multilingualAriaLabel = 'CtxPropertySections';

  const body = document.createElement('div');
  body.className = 'ctx-debug-properties-body';

  const resize = document.createElement('div');
  resize.className = 'ctx-debug-properties-resize';
  resize.dataset.debugVerticalResize = 'ctx-properties';
  resize.title = 'Drag to resize; double-click to reset';

  element.append(heading, tabs, body, resize);

  let currentPath = path;
  let currentRevision = revision;
  let activeTab: CtxPropertiesTab = 'main';
  const subscribers = createCtxPropertiesSubscribers(body);

  body.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const path = target.closest<HTMLElement>('[data-ctx-property-path]')?.dataset.ctxPropertyPath;
      if (path) navigate(path);
    },
    { signal: abortController.signal },
  );

  const tabDefinitions: readonly [CtxPropertiesTab, string, string][] = [
    ['main', 'Main', 'Main node information'],
    ['properties', 'Properties', 'Semantic node properties'],
    ['attributes', 'Attributes', 'Semantic node attributes'],
    ['subscribers', 'Subscribers', 'CTX runtime subscribers'],
  ];

  const renderBody = () => {
    const projection = projectCtxNodeProperties(context, currentPath);
    switch (activeTab) {
      case 'main':
        renderCtxPropertiesMain(body, projection.main);
        break;
      case 'properties':
        renderCtxPropertiesProps(body, projection.properties);
        break;
      case 'attributes':
        renderCtxPropertiesAttrs(body, projection.attributes);
        break;
      case 'subscribers':
        subscribers.render(projection.subscriberRegistrations);
        break;
    }
  };

  const renderTabs = () => {
    tabs.replaceChildren(
      ...tabDefinitions.map(([key, label, title]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = title;
        button.textContent = label;
        button.dataset.ctxPropertiesTab = key;
        button.classList.toggle('is-active', activeTab === key);
        return button;
      }),
    );
  };

  tabs.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const tab = target.closest<HTMLButtonElement>('[data-ctx-properties-tab]')?.dataset
        .ctxPropertiesTab as CtxPropertiesTab | undefined;
      if (!tab || tab === activeTab) return;
      activeTab = tab;
      renderTabs();
      renderBody();
    },
    { signal: abortController.signal },
  );

  const render = () => {
    void currentRevision;
    headingText.title = currentPath;
    headingText.textContent = `Node Properties · ${formatCtxPath(currentPath)}`;
    renderTabs();
    renderBody();
  };

  function resolveHeight(value: number | null): number {
    return value === null ? 190 : Math.max(110, Math.min(420, Math.round(value)));
  }

  render();

  return {
    element,
    update(nextPath, nextRevision, nextHeightPreference) {
      if (nextPath !== currentPath) activeTab = 'main';
      currentPath = nextPath;
      currentRevision = nextRevision;
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
      subscribers.destroy();
      element.remove();
    },
  };
}
