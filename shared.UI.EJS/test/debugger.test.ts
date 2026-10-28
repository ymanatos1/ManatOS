// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import {
  ApplicationState,
  createMemoryUiStateRuntime,
  apiTrafficHistory,
} from '@manatos/shared-ui';

import {
  createApiTrafficViewer,
  createCli,
  createCtxProperties,
  createCtxTree,
  mountDebugTooltipHost,
  mountDebugger,
} from '../src/index.js';

function createState(): ApplicationState {
  return new ApplicationState('EJS', '1', createMemoryUiStateRuntime());
}

describe('@manatos/shared-ui-ejs debugger', () => {
  it('mounts the CTX viewer and removes only viewer-owned CTX subscriptions on close', () => {
    const state = createState();
    const applicationUnsubscribe = state.context.subscribe(() => undefined, {
      label: 'ApplicationFieldDependency',
      path: 'ctx',
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });

    debuggerHost.show();

    expect(host.querySelector('.developer-tools-dock')).not.toBeNull();
    expect(host.querySelector('.ctx-debug-tree')).not.toBeNull();
    expect(
      state.context.subscriptionInfo('ctx').some((item) => item.label === 'CtxViewer:ctx'),
    ).toBe(true);

    debuggerHost.hide();

    const subscriptions = state.context.subscriptionInfo('ctx');
    expect(subscriptions.some((item) => item.label === 'CtxViewer:ctx')).toBe(false);
    expect(subscriptions.some((item) => item.label === 'ApplicationFieldDependency')).toBe(true);
    expect(host.childElementCount).toBe(0);

    applicationUnsubscribe();
    debuggerHost.destroy();
    host.remove();
  });

  it('materializes only expanded CTX branches and releases descendant rows when collapsed', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    host
      .querySelector<HTMLButtonElement>('[data-ctx-path="ctx.runtime"] [data-ctx-toggle]')
      ?.click();
    const entitiesRow = host.querySelector<HTMLElement>('[data-ctx-path="ctx.runtime.entities"]');
    expect(entitiesRow).not.toBeNull();
    expect(host.querySelector('[data-ctx-path^="ctx.runtime.entities."]')).toBeNull();

    entitiesRow?.querySelector<HTMLButtonElement>('[data-ctx-toggle]')?.click();
    const entityChild = host.querySelector<HTMLElement>('[data-ctx-path^="ctx.runtime.entities."]');
    expect(entityChild).not.toBeNull();
    entityChild?.click();

    host
      .querySelector<HTMLElement>('[data-ctx-path="ctx.runtime.entities"]')
      ?.querySelector<HTMLButtonElement>('[data-ctx-toggle]')
      ?.click();
    expect(host.querySelector('[data-ctx-path^="ctx.runtime.entities."]')).toBeNull();

    debuggerHost.destroy();
    host.remove();
  });

  it('reveals a CTX selection only when the selection or reveal token changes', async () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const tree = createCtxTree(document, state.context, 'ctx', () => undefined);
    host.appendChild(tree.element);
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      tree.update({
        selectedPath: 'ctx.company',
        watchChangedPath: null,
        revealToken: 1,
        revision: 1,
      });
      await Promise.resolve();
      expect(scrollIntoView).toHaveBeenCalled();
      scrollIntoView.mockClear();

      tree.update({
        selectedPath: 'ctx.company',
        watchChangedPath: null,
        revealToken: 1,
        revision: 2,
      });
      await Promise.resolve();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      tree.destroy();
      host.remove();
    }
  });

  it('renders leaf CTX tooltips as one name/value line', () => {
    const host = document.createElement('div');
    const leaf = document.createElement('div');
    leaf.dataset.debugTooltip = 'leaf';
    leaf.dataset.debugTooltipValue = 'value';
    host.appendChild(leaf);
    document.body.appendChild(host);
    const tooltipHost = mountDebugTooltipHost(host);

    vi.useFakeTimers();
    try {
      leaf.dispatchEvent(new Event('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(2200);
      const tooltip = document.querySelector('.manatos-debug-tooltip');
      expect(tooltip?.querySelector('.manatos-debug-tooltip-value-line')?.textContent).toBe(
        'leaf = value',
      );
      expect(tooltip?.querySelector('.manatos-debug-tooltip-title')?.textContent).toBe('leaf');
      expect(tooltip?.querySelector('.manatos-debug-tooltip-value')?.textContent).toBe('value');
    } finally {
      vi.useRealTimers();
      tooltipHost.destroy();
      host.remove();
    }
  });

  it('starts CTX Properties and Subscribers on their first tabs', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const properties = createCtxProperties(
      document,
      state.context,
      'ctx.company',
      state.context.revision,
      () => undefined,
      () => undefined,
    );
    host.appendChild(properties.element);

    expect(
      host.querySelector('.ctx-debug-properties-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Main');
    [...host.querySelectorAll<HTMLButtonElement>('.ctx-debug-properties-tabs button')]
      .find((button) => button.textContent?.trim() === 'Subscribers')
      ?.click();
    expect(
      host.querySelector('.ctx-debug-subscriber-tabs button.is-active')?.textContent?.trim(),
    ).toMatch(/^Direct/);

    properties.destroy();
    host.remove();
  });

  it('runs the native EJS CLI over the shared command engine and releases it on close', async () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    let closed = false;
    const cli = createCli(document, {
      context: state.context,
      startPath: 'ctx',
      closeRequested: () => {
        closed = true;
      },
    });
    host.appendChild(cli.element);

    const input = host.querySelector<HTMLTextAreaElement>('.debugging-cli-input')!;
    input.value = '.';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(host.querySelector('.debugging-cli-result')?.textContent).toContain('company');
    host.querySelector<HTMLButtonElement>('.debugging-cli-prompt')?.click();
    expect(host.querySelector<HTMLElement>('.debugging-cli-history')?.hidden).toBe(false);
    cli.ownerDocumentChanged();
    expect(host.querySelector<HTMLElement>('.debugging-cli-history')?.hidden).toBe(true);
    host.querySelector<HTMLButtonElement>('.debugging-cli-dock-heading .btn-close-debug')?.click();
    expect(closed).toBe(true);

    cli.destroy();
    expect(host.querySelector('.debugging-cli')).toBeNull();
    host.remove();
  });

  it('renders API traffic with the modern EJS component structure and empty body state', () => {
    apiTrafficHistory.clear();
    const id = apiTrafficHistory.begin({
      requestId: 'request-ejs-1',
      method: 'GET',
      path: '/api/v1/system/bootstrap',
    });
    apiTrafficHistory.complete(id, {
      status: 200,
      statusText: 'OK',
      ok: true,
      responseBody: { success: true },
      diagnostics: {
        requestId: 'request-ejs-1',
        capturedAt: '2026-10-09T00:00:00.000Z',
        apiContext: {
          path: '$api.level-request-ejs-1',
          levelIds: ['request-ejs-1'],
          ctx: { request: { id: 'request-ejs-1' } },
        },
        storageContexts: [],
        logs: [],
      },
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const viewer = createApiTrafficViewer(document);
    host.appendChild(viewer.element);

    expect(host.querySelectorAll('.api-traffic-row')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('[data-api-entry-id]')?.click();
    expect(host.querySelector('.api-traffic-details')).not.toBeNull();
    expect(
      host.querySelector('.api-traffic-details-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Request');
    expect(
      host.querySelector('.api-traffic-payload-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Headers');
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('.api-traffic-payload-tabs button')].find(
        (button) => button.textContent?.trim() === 'Body',
      ),
    ).toBeUndefined();
    host.querySelector<HTMLButtonElement>('[data-api-detail-tab="response"]')?.click();
    expect(
      host.querySelector('.api-traffic-payload-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Headers');
    host.querySelector<HTMLButtonElement>('[data-api-detail-tab="apiCtx"]')?.click();
    expect(host.querySelector('.api-traffic-context-tree .ctx-debug-tree')).not.toBeNull();
    expect(host.querySelector('[data-ctx-path="ctx.request.id"]')).not.toBeNull();

    host
      .querySelector<HTMLElement>('[data-ctx-path="ctx.request"]')
      ?.querySelector<HTMLButtonElement>('[data-ctx-toggle]')
      ?.click();
    expect(host.querySelector('[data-ctx-path="ctx.request.id"]')).toBeNull();

    const unrelated = apiTrafficHistory.begin({
      requestId: 'request-ejs-unrelated',
      method: 'GET',
      path: '/api/v1/unrelated',
    });
    apiTrafficHistory.complete(unrelated, { status: 200, ok: true });
    expect(host.querySelector('[data-ctx-path="ctx.request.id"]')).toBeNull();

    viewer.destroy();
    apiTrafficHistory.clear();
    expect(host.childElementCount).toBe(0);
    host.remove();
  });

  it('renders JSON null as a captured response body and hides the tab for absent bodies', () => {
    apiTrafficHistory.clear();
    const absent = apiTrafficHistory.begin({
      requestId: 'ejs-body-absent',
      method: 'GET',
      path: '/api/v1/absent',
    });
    apiTrafficHistory.complete(absent, { status: 204, ok: true });
    const captured = apiTrafficHistory.begin({
      requestId: 'ejs-body-null',
      method: 'GET',
      path: '/api/v1/null',
    });
    apiTrafficHistory.complete(captured, { status: 200, ok: true, responseBody: null });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const viewer = createApiTrafficViewer(document);
    host.appendChild(viewer.element);

    host.querySelector<HTMLButtonElement>(`[data-api-entry-id="${captured}"]`)?.click();
    host.querySelector<HTMLButtonElement>('[data-api-detail-tab="response"]')?.click();
    const bodyButton = [
      ...host.querySelectorAll<HTMLButtonElement>('.api-traffic-payload-tabs button'),
    ].find((button) => button.textContent?.trim() === 'Body');
    expect(bodyButton).toBeDefined();
    bodyButton?.click();
    expect(host.querySelector('.api-traffic-payload-pre')?.textContent?.trim()).toBe('null');

    host.querySelector<HTMLButtonElement>(`[data-api-entry-id="${absent}"]`)?.click();
    host.querySelector<HTMLButtonElement>('[data-api-detail-tab="response"]')?.click();
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('.api-traffic-payload-tabs button')].find(
        (button) => button.textContent?.trim() === 'Body',
      ),
    ).toBeUndefined();

    viewer.destroy();
    apiTrafficHistory.clear();
    host.remove();
  });

  it('keeps exactly one debugger tool panel active across CTX, API Traffic, and target CTX tabs', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    const activePanels = () =>
      [...host.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((panel) => !panel.hidden);
    const expectActive = (tabId: string) => {
      const activeTab = host.querySelector<HTMLButtonElement>(`[data-debugger-tab="${tabId}"]`)!;
      const panelId = activeTab.getAttribute('aria-controls')!;
      const panel = host.querySelector<HTMLElement>(`#${panelId}`)!;
      expect(activeTab.getAttribute('role')).toBe('tab');
      expect(activeTab.getAttribute('aria-selected')).toBe('true');
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.hidden).toBe(false);
      expect(panel.getAttribute('aria-hidden')).toBe('false');
      expect(panel.hasAttribute('inert')).toBe(false);
      const visiblePanels = activePanels();
      expect(visiblePanels).toHaveLength(1);
      expect(visiblePanels[0]).toBe(panel);
    };

    expectActive('ctx');

    host.querySelector<HTMLButtonElement>('[data-debugger-tab="apiTraffic"]')?.click();
    expectActive('apiTraffic');
    const rootPanel = host.querySelector<HTMLElement>('[data-debugger-panel="ctx"]')!;
    expect(rootPanel.hidden).toBe(true);
    expect(rootPanel.getAttribute('aria-hidden')).toBe('true');
    expect(rootPanel.hasAttribute('inert')).toBe(true);

    host.querySelector<HTMLButtonElement>('[data-debugger-tab="ctx"]')?.click();
    host
      .querySelector<HTMLButtonElement>('[data-ctx-path="ctx.runtime"] [data-ctx-toggle]')
      ?.click();
    host.querySelector<HTMLElement>('[data-ctx-path="ctx.runtime.entities"]')?.click();
    host
      .querySelector<HTMLButtonElement>(
        '.ctx-toolbar button[title="Open selected CTX node in a dedicated view tab"]',
      )
      ?.click();

    const targetTab = host.querySelector<HTMLButtonElement>(
      '[data-debugger-tab="ctx:ctx.runtime.entities"]',
    );
    expect(targetTab).not.toBeNull();
    expectActive('ctx:ctx.runtime.entities');

    host.querySelector<HTMLButtonElement>('[data-debugger-tab="ctx"]')?.click();
    host.querySelector<HTMLElement>('[data-ctx-path="ctx.system"]')?.click();
    host
      .querySelector<HTMLButtonElement>(
        '.ctx-toolbar button[title="Open selected CTX node in a dedicated view tab"]',
      )
      ?.click();
    expectActive('ctx:ctx.system');

    host
      .querySelector<HTMLButtonElement>('[data-debugger-tab="ctx:ctx.runtime.entities"]')
      ?.click();
    expectActive('ctx:ctx.runtime.entities');
    host
      .querySelector<HTMLButtonElement>('[data-debugger-close-target="ctx:ctx.runtime.entities"]')
      ?.click();
    expectActive('ctx:ctx.system');

    host.querySelector<HTMLButtonElement>('[data-debugger-tab="apiTraffic"]')?.click();
    expectActive('apiTraffic');

    debuggerHost.destroy();
    host.remove();
  });
});
