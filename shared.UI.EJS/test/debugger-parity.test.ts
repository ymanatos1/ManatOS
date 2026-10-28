// @vitest-environment happy-dom

import {
  ContextTreeRuntime,
  type ExpressionDiagnostic,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';
import {
  ApplicationState,
  apiTrafficHistory,
  createMemoryUiStateRuntime,
} from '@manatos/shared-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebuggerHost, mountCtxDiagnostics, mountDebugger } from '../src/index.js';

function createContext(
  source: ManatOSRuntimeRootContext,
): ContextTreeRuntime<ManatOSRuntimeRootContext> {
  const company = Object.seal({
    ...source.company,
    nested: { alpha: 'Parity-Ada', beta: 'parity-match-one', gamma: 'parity-match-two' },
    'odd-key': { 'space key': 42 },
  });
  const system = { ...source.system, marker: 'system' };
  const enums = {
    ...source.runtime.enums,
    DebugAliasRole: {
      key: 'DebugAliasRole',
      name: 'DebugAliasRole',
      subsystem: 'test',
      label: 'Debug alias role',
      values: { Probe: { key: 'Probe' } },
    },
  };
  return new ContextTreeRuntime<ManatOSRuntimeRootContext>({
    ...source,
    company,
    system,
    runtime: { ...source.runtime, enums },
  } as unknown as ManatOSRuntimeRootContext);
}

function createState(): ApplicationState {
  const state = new ApplicationState('EJS', '1', createMemoryUiStateRuntime());
  Object.defineProperty(state, 'context', { value: createContext(state.context.root()) });
  return state;
}

function click(element: ParentNode, selector: string): HTMLElement {
  const target = element.querySelector<HTMLElement>(selector);
  expect(target, selector).not.toBeNull();
  target!.click();
  return target!;
}

function buttonByTitle(element: ParentNode, title: string): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button, title).not.toBeNull();
  return button!;
}

function selectedCtxPath(element: ParentNode): string | null {
  return element.querySelector<HTMLElement>('.ctx-debug-row.is-selected')?.dataset.ctxPath ?? null;
}

function diagnostic(message = 'Unknown CTX variable'): ExpressionDiagnostic {
  return {
    phase: 'evaluate',
    timestamp: '2026-10-10T00:00:00.000Z',
    message,
    expression: '$missing.value',
    variablePath: '$missing.value',
  };
}

function beginTraffic(input: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
}) {
  const id = apiTrafficHistory.begin({
    requestId: input.requestId,
    method: input.method,
    path: input.path,
    requestHeaders: input.requestHeaders,
    requestBody: input.requestBody,
  });
  apiTrafficHistory.complete(id, { status: input.status, ok: input.ok });
  return id;
}

interface PopupWindowMock {
  readonly popup: Window;
  readonly document: Document;
  readonly state: {
    closed: boolean;
    screenX: number;
    screenY: number;
    outerWidth: number;
    outerHeight: number;
    innerWidth: number;
    innerHeight: number;
  };
  readonly focus: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly moveTo: ReturnType<typeof vi.fn>;
  readonly resizeTo: ReturnType<typeof vi.fn>;
  emit(type: string): void;
}

function createPopupWindowMock(): PopupWindowMock {
  const popupDocument = document.implementation.createHTMLDocument('Detached');
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const state = {
    closed: false,
    screenX: 80,
    screenY: 80,
    outerWidth: 640,
    outerHeight: 480,
    innerWidth: 620,
    innerHeight: 440,
  };
  const focus = vi.fn();
  const close = vi.fn(() => {
    state.closed = true;
  });
  const moveTo = vi.fn((left: number, top: number) => {
    state.screenX = left;
    state.screenY = top;
  });
  const moveBy = vi.fn((left: number, top: number) => {
    state.screenX += left;
    state.screenY += top;
  });
  const resizeTo = vi.fn((width: number, height: number) => {
    state.outerWidth = width;
    state.outerHeight = height;
  });
  const resizeBy = vi.fn((width: number, height: number) => {
    state.outerWidth += width;
    state.outerHeight += height;
  });

  const popup = {
    document: popupDocument,
    get closed() {
      return state.closed;
    },
    get screenX() {
      return state.screenX;
    },
    get screenY() {
      return state.screenY;
    },
    get outerWidth() {
      return state.outerWidth;
    },
    get outerHeight() {
      return state.outerHeight;
    },
    get innerWidth() {
      return state.innerWidth;
    },
    get innerHeight() {
      return state.innerHeight;
    },
    focus,
    close,
    moveTo,
    moveBy,
    resizeTo,
    resizeBy,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const bucket = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      bucket.add(listener);
      listeners.set(type, bucket);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    }),
  } as unknown as Window;

  return {
    popup,
    document: popupDocument,
    state,
    focus,
    close,
    moveTo,
    resizeTo,
    emit(type: string) {
      const event = new Event(type);
      for (const listener of [...(listeners.get(type) ?? [])]) {
        if (typeof listener === 'function') listener.call(popup, event);
        else listener.handleEvent(event);
      }
    },
  };
}

afterEach(() => {
  apiTrafficHistory.clear();
  document.body.replaceChildren();
});

describe('@manatos/shared-ui-ejs EJS0 debugger behavior parity', () => {
  it('preserves CTX root ordering, compact captions, and canonical bracket paths', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    const paths = [...host.querySelectorAll<HTMLElement>('.ctx-debug-row')].map(
      (row) => row.dataset.ctxPath,
    );
    expect(paths.indexOf('ctx.company')).toBeGreaterThan(-1);
    expect(paths.indexOf('ctx.system')).toBeGreaterThan(paths.indexOf('ctx.company'));

    click(host, '[data-ctx-path="ctx.company"] [data-ctx-toggle]');
    const oddRow = [...host.querySelectorAll<HTMLElement>('.ctx-debug-row')].find(
      (row) => row.dataset.ctxPath === 'ctx.company["odd-key"]',
    );
    expect(oddRow).toBeDefined();
    (oddRow!.querySelector('[data-ctx-toggle]') as HTMLButtonElement).click();
    const leaf = [...host.querySelectorAll<HTMLElement>('.ctx-debug-row')].find(
      (row) => row.dataset.ctxPath === 'ctx.company["odd-key"]["space key"]',
    );
    expect(leaf).toBeDefined();
    leaf!.click();
    expect(host.querySelector('.ctx-caption-selection')?.textContent?.trim()).toBe(
      '$company["odd-key"]["space key"]',
    );

    debuggerHost.destroy();
  });

  it('expands the canonical runtime branch without root mirrors', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    click(host, '[data-ctx-path="ctx.runtime"] [data-ctx-toggle]');
    click(host, '[data-ctx-path="ctx.runtime.enums"] [data-ctx-toggle]');
    expect(host.querySelector('[data-ctx-path="ctx.runtime.enums.DebugAliasRole"]')).not.toBeNull();

    expect(host.querySelector('[data-ctx-path="ctx.enums"]')).toBeNull();
    expect(state.context.get('$enums.DebugAliasRole')).toBeDefined();
    expect(host.querySelector('[data-ctx-path="ctx.runtime.enums.DebugAliasRole"]')).not.toBeNull();

    debuggerHost.destroy();
  });

  it('preserves CTX Find key/value/both, wildcard/regex, and previous/next navigation', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    buttonByTitle(host, 'Find CTX variable by key or value').click();
    const input = host.querySelector<HTMLInputElement>('.ctx-find-input')!;
    const mode = host.querySelector<HTMLSelectElement>('[aria-label="CTX find target"]')!;
    mode.value = 'key';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = 'alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    buttonByTitle(host, 'Find next').click();
    expect(selectedCtxPath(host)).toBe('ctx.company.nested.alpha');

    mode.value = 'value';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const syntax = host.querySelector<HTMLSelectElement>('[aria-label="CTX find syntax"]')!;
    syntax.value = 'regex';
    syntax.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = '^Parity-A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    buttonByTitle(host, 'Find next').click();
    expect(selectedCtxPath(host)).toBe('ctx.company.nested.alpha');

    mode.value = 'both';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    syntax.value = 'wildcard';
    syntax.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = 'parity-match-*';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    buttonByTitle(host, 'Find next').click();
    const first = selectedCtxPath(host);
    buttonByTitle(host, 'Find next').click();
    const second = selectedCtxPath(host);
    expect(new Set([first, second])).toEqual(
      new Set(['ctx.company.nested.beta', 'ctx.company.nested.gamma']),
    );
    buttonByTitle(host, 'Find previous').click();
    expect(selectedCtxPath(host)).toBe(first);

    debuggerHost.destroy();
  });

  it('keeps Properties visibility independent from selection/history and resets its internal tab on identity change', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    click(host, '[data-ctx-path="ctx.company"]');
    buttonByTitle(host, 'Selected node properties').click();
    [...host.querySelectorAll<HTMLButtonElement>('.ctx-debug-properties-tabs button')]
      .find((button) => button.textContent?.trim() === 'Subscribers')!
      .click();
    expect(
      host.querySelector('.ctx-debug-properties-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Subscribers');

    click(host, '[data-ctx-path="ctx.system"]');
    expect(host.querySelector('.ctx-debug-properties')).not.toBeNull();
    expect(
      host.querySelector('.ctx-debug-properties-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Main');

    buttonByTitle(host, 'Previous CTX selection').click();
    expect(selectedCtxPath(host)).toBe('ctx.company');
    expect(host.querySelector('.ctx-debug-properties')).not.toBeNull();

    debuggerHost.destroy();
  });

  it('remembers the active main debugger tab across hide and show', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();
    click(host, '[data-debugger-tab="apiTraffic"]');
    expect(state.debuggerActiveView).toBe('apiTraffic');

    debuggerHost.hide();
    expect(host.querySelector('.developer-tools-dock')).toBeNull();
    debuggerHost.show();
    expect(
      host.querySelector('[data-debugger-tab="apiTraffic"]')?.getAttribute('aria-selected'),
    ).toBe('true');

    debuggerHost.destroy();
  });

  it('opens selected nodes as live targeted CTX tabs and falls back to the remaining target when one closes', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    click(host, '[data-ctx-path="ctx.company"]');
    buttonByTitle(host, 'Open selected CTX node in a dedicated view tab').click();
    click(host, '[data-debugger-tab="ctx"]');
    click(host, '[data-ctx-path="ctx.system"]');
    buttonByTitle(host, 'Open selected CTX node in a dedicated view tab').click();

    const companyTab = host.querySelector<HTMLButtonElement>(
      '[data-debugger-tab="ctx:ctx.company"]',
    )!;
    expect(companyTab).not.toBeNull();
    expect(host.querySelector('[data-debugger-tab="ctx:ctx.system"]')).not.toBeNull();
    companyTab.click();

    const companyPanelId = companyTab.getAttribute('aria-controls')!;
    const companyPanel = host.querySelector<HTMLElement>(`#${companyPanelId}`)!;
    const nested = companyPanel.querySelector<HTMLElement>('[data-ctx-path="ctx.company.nested"]')!;
    (nested.querySelector('[data-ctx-toggle]') as HTMLButtonElement).click();
    state.context.set('ctx.company.nested.alpha', 'Changed');
    expect(companyPanel.textContent).toContain('Changed');

    click(host, '[data-debugger-close-target="ctx:ctx.company"]');
    expect(host.querySelector('[data-debugger-tab="ctx:ctx.company"]')).toBeNull();
    expect(
      host.querySelector('[data-debugger-tab="ctx:ctx.system"]')?.getAttribute('aria-selected'),
    ).toBe('true');

    debuggerHost.destroy();
  });

  it('copies the selected CTX node as JSON text', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      click(host, '[data-ctx-path="ctx.company"]');
      buttonByTitle(host, 'Copy selected node as JSON text').click();
      expect(writeText).toHaveBeenCalledOnce();
      expect(String(writeText.mock.calls[0]?.[0])).toContain('"nested"');
      expect(String(writeText.mock.calls[0]?.[0])).toContain('"odd-key"');
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
      debuggerHost.destroy();
    }
  });

  it('collapses duplicate CTX diagnostics into one counted panel and clearing does not disable diagnostics', () => {
    const state = createState();
    const controller = mountCtxDiagnostics(document, state.diagnostics);

    state.diagnostics.reportExpressionDiagnostic(diagnostic());
    state.diagnostics.reportExpressionDiagnostic(diagnostic());
    expect(document.querySelectorAll('.ctx-diagnostic-item')).toHaveLength(1);
    expect(document.querySelector('.ctx-diagnostic-count')?.textContent?.trim()).toBe('×2');

    click(document, '.ctx-diagnostic-close');
    expect(document.querySelector('.ctx-diagnostic-panel')).toBeNull();
    expect(state.diagnostics.enabled).toBe(true);
    state.diagnostics.reportExpressionDiagnostic(diagnostic('Another failure'));
    expect(document.querySelector('.ctx-diagnostic-panel')).not.toBeNull();

    controller.destroy();
  });

  it('preserves API Traffic filtering, route visibility state, selected details, and secret redaction', () => {
    const state = createState();
    const ok = beginTraffic({
      requestId: 'parity-ok',
      method: 'GET',
      path: '/api/v1/ok',
      status: 200,
      ok: true,
    });
    beginTraffic({
      requestId: 'parity-error',
      method: 'POST',
      path: '/api/v1/error',
      status: 500,
      ok: false,
    });
    beginTraffic({
      requestId: 'parity-secret',
      method: 'POST',
      path: '/api/v1/secret',
      status: 200,
      ok: true,
      requestHeaders: { authorization: 'Bearer top-secret' },
      requestBody: { password: 'top-secret', visible: 'yes' },
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();
    click(host, '[data-debugger-tab="apiTraffic"]');

    const rows = [...host.querySelectorAll<HTMLElement>('.api-traffic-row')];
    expect(rows).toHaveLength(3);
    const search = host.querySelector<HTMLInputElement>('.api-traffic-filter')!;
    search.value = 'secret';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelectorAll('.api-traffic-row')).toHaveLength(1);
    expect(host.querySelector('.api-traffic-row')?.textContent).toContain('/api/v1/secret');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    [...host.querySelectorAll<HTMLElement>('.api-traffic-row')]
      .find((row) => row.textContent?.includes('/api/v1/ok'))!
      .click();
    expect(host.querySelector('.api-traffic-caption')?.textContent).toContain('/api/v1/ok');

    beginTraffic({
      requestId: 'parity-later',
      method: 'GET',
      path: '/api/v1/later',
      status: 200,
      ok: true,
    });
    expect(host.querySelector('.api-traffic-caption')?.textContent).toContain('/api/v1/ok');
    expect(apiTrafficHistory.get(ok)).not.toBeNull();

    click(host, '[data-api-traffic-action="errors"]');
    expect(host.querySelectorAll('.api-traffic-row')).toHaveLength(1);
    expect(host.querySelector('.api-traffic-row')?.textContent).toContain('/api/v1/error');

    const errorRoute = [
      ...host.querySelectorAll<HTMLLabelElement>('.api-traffic-route-option'),
    ].find((label) => label.textContent?.includes('/api/v1/error'))!;
    const routeInput = errorRoute.querySelector<HTMLInputElement>('input')!;
    routeInput.checked = false;
    routeInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.debuggerState.apiTraffic.hiddenRoutes).toContain('POST ./error');
    expect(host.querySelectorAll('.api-traffic-row')).toHaveLength(0);

    click(host, '[data-api-traffic-action="ignore-routes"]');
    expect(host.querySelectorAll('.api-traffic-row')).toHaveLength(1);
    click(host, '[data-api-traffic-action="errors"]');

    const secretRow = [...host.querySelectorAll<HTMLElement>('.api-traffic-row')].find((row) =>
      row.textContent?.includes('/api/v1/secret'),
    )!;
    secretRow.click();
    expect(host.textContent).toContain('[REDACTED]');
    expect(host.textContent).not.toContain('top-secret');

    debuggerHost.destroy();
  });

  it('preserves API Traffic pause and clear semantics in the EJS renderer', () => {
    const state = createState();
    beginTraffic({
      requestId: 'pause-1',
      method: 'GET',
      path: '/api/v1/pause-1',
      status: 200,
      ok: true,
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();
    click(host, '[data-debugger-tab="apiTraffic"]');

    click(host, '[data-api-traffic-action="pause"]');
    beginTraffic({
      requestId: 'pause-2',
      method: 'GET',
      path: '/api/v1/pause-2',
      status: 200,
      ok: true,
    });
    expect(host.textContent).not.toContain('/api/v1/pause-2');

    click(host, '[data-api-traffic-action="clear"]');
    expect(host.querySelectorAll('.api-traffic-row')).toHaveLength(0);
    beginTraffic({
      requestId: 'pause-3',
      method: 'GET',
      path: '/api/v1/pause-3',
      status: 200,
      ok: true,
    });
    expect(host.textContent).not.toContain('/api/v1/pause-3');

    click(host, '[data-api-traffic-action="pause"]');
    expect(host.textContent).toContain('/api/v1/pause-3');

    debuggerHost.destroy();
  });

  it('keeps one outer Debugging Tools resize boundary and all debugger tools inside one dock body', () => {
    const state = createState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const debuggerHost = mountDebugger(host, { state });
    debuggerHost.show();

    expect(host.querySelectorAll('.developer-tools-dock')).toHaveLength(1);
    expect(host.querySelectorAll('.developer-tools-resize')).toHaveLength(1);
    expect(host.querySelector('.developer-tools-body .ctx-viewer')).not.toBeNull();
    click(host, '[data-debugger-tab="apiTraffic"]');
    expect(host.querySelector('.developer-tools-body .api-traffic-panel')).not.toBeNull();

    debuggerHost.destroy();
  });

  it('moves the same live debugger DOM instance into and back from the detached window host', () => {
    const mainHost = document.createElement('div');
    const dock = document.createElement('aside');
    mainHost.appendChild(dock);
    document.body.appendChild(mainHost);
    const detached = createPopupWindowMock();
    const open = vi.spyOn(window, 'open').mockReturnValue(detached.popup);
    const host = new DebuggerHost();

    try {
      expect(host.detach(dock)).toBe(true);
      expect(detached.document.body.contains(dock)).toBe(true);
      expect(dock.classList.contains('is-detached-developer-tools')).toBe(true);
      host.attach(false);
      expect(mainHost.contains(dock)).toBe(true);
      expect(dock.classList.contains('is-detached-developer-tools')).toBe(false);
    } finally {
      host.destroy();
      open.mockRestore();
      mainHost.remove();
    }
  });
});

describe('DebuggerHost detached-window lifecycle', () => {
  it('cleans failed opens and can detach successfully on the next attempt', () => {
    const dock = document.createElement('aside');
    const host = new DebuggerHost();
    const detached = createPopupWindowMock();
    const open = vi
      .spyOn(window, 'open')
      .mockImplementationOnce(() => {
        throw new Error('popup unavailable');
      })
      .mockReturnValueOnce(null)
      .mockReturnValue(detached.popup);

    expect(host.detach(dock)).toBe(false);
    document.body.appendChild(dock);
    expect(host.detach(dock)).toBe(false);
    expect(host.detach(dock)).toBe(false);
    expect(host.detach(dock)).toBe(true);
    expect(detached.document.body.contains(dock)).toBe(true);

    host.destroy();
    open.mockRestore();
  });

  it('restores durable trusted placement synchronously after opening', () => {
    const mainHost = document.createElement('div');
    const dock = document.createElement('aside');
    mainHost.appendChild(dock);
    document.body.appendChild(mainHost);
    const detached = createPopupWindowMock();
    const open = vi.spyOn(window, 'open').mockReturnValue(detached.popup);
    const host = new DebuggerHost({
      loadPlacement: () => ({ left: 120, top: 80, width: 900, height: 680, state: 'normal' }),
    });
    const trusted = host as unknown as {
      geometryTrustResolved: boolean;
      geometryTrusted: boolean;
    };
    trusted.geometryTrustResolved = true;
    trusted.geometryTrusted = true;

    try {
      expect(host.detach(dock)).toBe(true);
      expect(detached.resizeTo).toHaveBeenCalledWith(900, 680);
      expect(detached.moveTo).toHaveBeenCalledWith(120, 80);
    } finally {
      host.destroy();
      open.mockRestore();
      mainHost.remove();
    }
  });

  it('does not move a popup when browser screen geometry is untrusted', () => {
    const mainHost = document.createElement('div');
    const dock = document.createElement('aside');
    mainHost.appendChild(dock);
    document.body.appendChild(mainHost);
    const detached = createPopupWindowMock();
    const open = vi.spyOn(window, 'open').mockReturnValue(detached.popup);
    const host = new DebuggerHost({
      loadPlacement: () => ({ left: 500, top: 400, width: 820, height: 620, state: 'normal' }),
    });
    const trust = host as unknown as {
      geometryTrustResolved: boolean;
      geometryTrusted: boolean;
    };
    trust.geometryTrustResolved = true;
    trust.geometryTrusted = false;

    try {
      expect(host.detach(dock)).toBe(true);
      expect(detached.moveTo).not.toHaveBeenCalled();
    } finally {
      host.destroy();
      open.mockRestore();
      mainHost.remove();
    }
  });

  it('reattaches when the detached popup closes normally', () => {
    const mainHost = document.createElement('div');
    const dock = document.createElement('aside');
    mainHost.appendChild(dock);
    document.body.appendChild(mainHost);
    const detached = createPopupWindowMock();
    const open = vi.spyOn(window, 'open').mockReturnValue(detached.popup);
    const changed = vi.fn();
    const host = new DebuggerHost();
    host.setDetachedChanged(changed);

    try {
      expect(host.detach(dock)).toBe(true);
      detached.emit('beforeunload');
      expect(mainHost.contains(dock)).toBe(true);
      expect(changed.mock.calls).toEqual([[true], [false]]);
    } finally {
      host.destroy();
      open.mockRestore();
      mainHost.remove();
    }
  });

  it('closes without reattach notification when the main page really exits', () => {
    const mainHost = document.createElement('div');
    const dock = document.createElement('aside');
    mainHost.appendChild(dock);
    document.body.appendChild(mainHost);
    const detached = createPopupWindowMock();
    const open = vi.spyOn(window, 'open').mockReturnValue(detached.popup);
    const changed = vi.fn();
    const host = new DebuggerHost();
    host.setDetachedChanged(changed);

    expect(host.detach(dock)).toBe(true);
    const pagehide = new Event('pagehide') as PageTransitionEvent;
    Object.defineProperty(pagehide, 'persisted', { value: false });
    window.dispatchEvent(pagehide);

    expect(detached.close).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls).toEqual([[true]]);
    host.destroy();
    open.mockRestore();
    mainHost.remove();
  });

  it('reattaches for a BFCache pagehide instead of shutting the host down', () => {
    const mainHost = document.createElement('div');
    const dock = document.createElement('aside');
    mainHost.appendChild(dock);
    document.body.appendChild(mainHost);
    const detached = createPopupWindowMock();
    const open = vi.spyOn(window, 'open').mockReturnValue(detached.popup);
    const changed = vi.fn();
    const host = new DebuggerHost();
    host.setDetachedChanged(changed);

    try {
      expect(host.detach(dock)).toBe(true);
      const pagehide = new Event('pagehide') as PageTransitionEvent;
      Object.defineProperty(pagehide, 'persisted', { value: true });
      window.dispatchEvent(pagehide);
      expect(mainHost.contains(dock)).toBe(true);
      expect(changed.mock.calls).toEqual([[true], [false]]);
    } finally {
      host.destroy();
      open.mockRestore();
      mainHost.remove();
    }
  });
});
