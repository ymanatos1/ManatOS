import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

import { CtxDiagnostics, Debugger } from '@manatos/shared-ui-ng';
import { DebuggerHost } from '../src/components/debugger/DebuggerHost';

function createApplicationState(): ApplicationState {
  return new ApplicationState('Angular', '1', createMemoryUiStateRuntime());
}

function createContext(): ContextTreeRuntime<ManatOSRuntimeRootContext> {
  const entities = {};
  const enums = {
    DebugAliasRole: {
      key: 'DebugAliasRole',
      name: 'DebugAliasRole',
      subsystem: 'test',
      label: 'Debug alias role',
      values: { Probe: { key: 'Probe' } },
    },
  };
  return new ContextTreeRuntime<ManatOSRuntimeRootContext>({
    company: {
      nested: { alpha: 'Ada', beta: 'match', gamma: 'match' },
      'odd-key': { 'space key': 42 },
    },
    system: { marker: 'system' },
    runtime: { subsystems: {}, entities, enums, user: null },
  } as unknown as ManatOSRuntimeRootContext);
}

@Component({
  standalone: true,
  imports: [Debugger, CtxDiagnostics],
  template: `
    <manatos-debugger [context]="context" [state]="state" [visible]="visible()" />
    <manatos-ctx-diagnostics [runtime]="state.diagnostics" />
  `,
})
class ParityHost {
  readonly visible = signal(true);
  readonly state = createApplicationState();
  readonly context = createContext();
}

async function createFixture() {
  await TestBed.configureTestingModule({
    imports: [ParityHost],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(ParityHost);
  fixture.detectChanges();
  return fixture;
}

function click(element: HTMLElement, selector: string): HTMLElement {
  const target = element.querySelector<HTMLElement>(selector);
  expect(target, selector).not.toBeNull();
  target!.click();
  return target!;
}

function buttonByTitle(element: HTMLElement, title: string): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button, title).not.toBeNull();
  return button!;
}

function selectedCtxPath(element: HTMLElement): string | null {
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
});

describe('@manatos/shared-ui-ng EJS0 debugger behavior parity', () => {
  it('preserves CTX root ordering, compact captions, and canonical bracket paths', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const paths = [...element.querySelectorAll<HTMLElement>('.ctx-debug-row')].map(
      (row) => row.dataset.ctxPath,
    );

    expect(element.querySelector('.ctx-caption > strong')?.textContent?.trim()).toBe('$');

    expect(paths.indexOf('ctx.company')).toBeGreaterThan(-1);
    expect(paths.indexOf('ctx.system')).toBeGreaterThan(paths.indexOf('ctx.company'));

    click(element, '[data-ctx-path="ctx.company"] .ctx-debug-toggle');
    fixture.detectChanges();
    const oddPath = [...element.querySelectorAll<HTMLElement>('.ctx-debug-row')]
      .map((row) => row.dataset.ctxPath)
      .find((path) => path?.includes('odd-key'));
    expect(oddPath).toBe('ctx.company["odd-key"]');

    const oddRow = [...element.querySelectorAll<HTMLElement>('.ctx-debug-row')].find(
      (row) => row.dataset.ctxPath === oddPath,
    )!;
    (oddRow.querySelector('.ctx-debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const leaf = [...element.querySelectorAll<HTMLElement>('.ctx-debug-row')].find(
      (row) => row.dataset.ctxPath === 'ctx.company["odd-key"]["space key"]',
    );
    expect(leaf).toBeDefined();
    leaf!.click();
    fixture.detectChanges();
    expect(element.querySelector('.ctx-caption-selection')?.textContent?.trim()).toBe(
      '$company["odd-key"]["space key"]',
    );

    fixture.destroy();
  });

  it('expands the canonical runtime branch without root mirrors', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;

    click(element, '[data-ctx-path="ctx.runtime"] .ctx-debug-toggle');
    fixture.detectChanges();
    click(element, '[data-ctx-path="ctx.runtime.enums"] .ctx-debug-toggle');
    fixture.detectChanges();
    expect(
      element.querySelector('[data-ctx-path="ctx.runtime.enums.DebugAliasRole"]'),
    ).not.toBeNull();

    expect(element.querySelector('[data-ctx-path="ctx.enums"]')).toBeNull();
    expect(fixture.componentInstance.context.get('$enums.DebugAliasRole')).toBeDefined();
    expect(
      element.querySelector('[data-ctx-path="ctx.runtime.enums.DebugAliasRole"]'),
    ).not.toBeNull();

    fixture.destroy();
  });

  it('preserves CTX Find key/value/both, wildcard/regex, and previous/next navigation', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;

    buttonByTitle(element, 'Find CTX variable by key or value').click();
    fixture.detectChanges();

    const input = element.querySelector<HTMLInputElement>('.ctx-find-input')!;
    input.value = 'alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    buttonByTitle(element, 'Find next').click();
    fixture.detectChanges();
    expect(selectedCtxPath(element)).toBe('ctx.company.nested.alpha');

    const mode = element.querySelector<HTMLSelectElement>('[aria-label="CTX find target"]')!;
    mode.value = 'value';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = '^A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const syntax = element.querySelector<HTMLSelectElement>('[aria-label="CTX find syntax"]')!;
    syntax.value = 'regex';
    syntax.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    buttonByTitle(element, 'Find next').click();
    fixture.detectChanges();
    expect(selectedCtxPath(element)).toBe('ctx.company.nested.alpha');

    mode.value = 'both';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    syntax.value = 'wildcard';
    syntax.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = 'match';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    buttonByTitle(element, 'Find next').click();
    fixture.detectChanges();
    const first = selectedCtxPath(element);
    buttonByTitle(element, 'Find next').click();
    fixture.detectChanges();
    const second = selectedCtxPath(element);
    expect(new Set([first, second])).toEqual(
      new Set(['ctx.company.nested.beta', 'ctx.company.nested.gamma']),
    );
    buttonByTitle(element, 'Find previous').click();
    fixture.detectChanges();
    expect(selectedCtxPath(element)).toBe(first);

    fixture.destroy();
  });

  it('keeps Properties visibility independent from selection/history and resets its internal tab on identity change', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;

    click(element, '[data-ctx-path="ctx.company"]');
    buttonByTitle(element, 'Selected node properties').click();
    fixture.detectChanges();
    const subscribers = [
      ...element.querySelectorAll<HTMLButtonElement>('.ctx-debug-properties-tabs button'),
    ].find((button) => button.textContent?.trim() === 'Subscribers')!;
    subscribers.click();
    fixture.detectChanges();
    expect(subscribers.classList.contains('is-active')).toBe(true);

    click(element, '[data-ctx-path="ctx.system"]');
    fixture.detectChanges();
    expect(element.querySelector('.ctx-debug-properties')).not.toBeNull();
    expect(
      element.querySelector('.ctx-debug-properties-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Main');

    buttonByTitle(element, 'Previous CTX selection').click();
    fixture.detectChanges();
    expect(selectedCtxPath(element)).toBe('ctx.company');
    expect(element.querySelector('.ctx-debug-properties')).not.toBeNull();

    fixture.destroy();
  });

  it('remembers the active main debugger tab across hide and show', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const apiTab = [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-tab')].find(
      (button) => button.textContent?.toUpperCase().includes('API TRAFFIC'),
    )!;
    apiTab.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.state.debuggerActiveView).toBe('apiTraffic');

    fixture.componentInstance.visible.set(false);
    fixture.detectChanges();
    expect(element.querySelector('.developer-tools-dock')).toBeNull();
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-tab')]
        .find((button) => button.textContent?.includes('API TRAFFIC'))
        ?.getAttribute('aria-selected'),
    ).toBe('true');

    fixture.destroy();
  });

  it('opens selected nodes as live targeted CTX tabs and falls back to the remaining target when one closes', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;

    click(element, '[data-ctx-path="ctx.company"]');
    buttonByTitle(element, 'Open selected CTX node in a dedicated view tab').click();
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-tab')]
      .find((button) => button.textContent?.includes('CTX VIEWER'))!
      .click();
    click(element, '[data-ctx-path="ctx.system"]');
    buttonByTitle(element, 'Open selected CTX node in a dedicated view tab').click();
    fixture.detectChanges();

    const companyTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.developer-tools-target-tab'),
    ].find((button) => button.textContent?.trim() === '$company');
    const systemTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.developer-tools-target-tab'),
    ].find((button) => button.textContent?.trim() === '$system');
    expect(companyTab).not.toBeNull();
    expect(systemTab).not.toBeNull();

    companyTab!.click();
    fixture.detectChanges();
    expect(companyTab!.getAttribute('aria-selected')).toBe('true');
    const target = [...element.querySelectorAll<HTMLElement>('manatos-ctx-viewer')].find(
      (viewer) => !viewer.hidden && viewer.querySelector('[data-ctx-path="ctx.company"]'),
    );
    const targetNested = target?.querySelector<HTMLElement>('[data-ctx-path="ctx.company.nested"]');
    (targetNested?.querySelector('.ctx-debug-toggle') as HTMLButtonElement)?.click();
    fixture.detectChanges();
    fixture.componentInstance.context.set('ctx.company.nested.alpha', 'Changed');
    fixture.detectChanges();
    expect(target?.textContent).toContain('Changed');

    (
      companyTab!
        .closest('.developer-tools-target-tab-wrap')!
        .querySelector('.developer-tools-target-tab-close') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-target-tab')].some(
        (button) => button.textContent?.trim() === '$company',
      ),
    ).toBe(false);
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-target-tab')]
        .find((button) => button.textContent?.trim() === '$system')
        ?.getAttribute('aria-selected'),
    ).toBe('true');

    fixture.destroy();
  });

  it('copies the selected CTX node as JSON text', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    try {
      click(element, '[data-ctx-path="ctx.company"]');
      buttonByTitle(element, 'Copy selected node as JSON text').click();
      expect(writeText).toHaveBeenCalledOnce();
      expect(String(writeText.mock.calls[0]?.[0])).toContain('"nested"');
      expect(String(writeText.mock.calls[0]?.[0])).toContain('"odd-key"');
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
      fixture.destroy();
    }
  });

  it('collapses duplicate CTX diagnostics into one counted panel and clearing does not disable diagnostics', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const runtime = fixture.componentInstance.state.diagnostics;

    runtime.reportExpressionDiagnostic(diagnostic());
    runtime.reportExpressionDiagnostic(diagnostic());
    fixture.detectChanges();
    expect(element.querySelectorAll('.ctx-diagnostic-item')).toHaveLength(1);
    expect(element.querySelector('.ctx-diagnostic-count')?.textContent?.trim()).toBe('×2');

    click(element, '.ctx-diagnostic-close');
    fixture.detectChanges();
    expect(element.querySelector('.ctx-diagnostic-panel')).toBeNull();
    expect(runtime.enabled).toBe(true);

    runtime.reportExpressionDiagnostic(diagnostic('Another failure'));
    fixture.detectChanges();
    expect(element.querySelector('.ctx-diagnostic-panel')).not.toBeNull();

    fixture.destroy();
  });

  it('preserves API Traffic filtering, route visibility state, selected details, and secret redaction', async () => {
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

    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-tab')]
      .find((button) => button.textContent?.includes('API TRAFFIC'))!
      .click();
    fixture.detectChanges();

    const rows = [...element.querySelectorAll<HTMLElement>('.api-traffic-row')];
    expect(rows).toHaveLength(3);
    const search = element.querySelector<HTMLInputElement>('.api-traffic-filter')!;
    search.value = 'secret';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelectorAll('.api-traffic-row')).toHaveLength(1);
    expect(element.querySelector('.api-traffic-row')?.textContent).toContain('/api/v1/secret');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLElement>('.api-traffic-row')]
      .find((row) => row.textContent?.includes('/api/v1/ok'))!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('.api-traffic-caption')?.textContent).toContain('/api/v1/ok');

    beginTraffic({
      requestId: 'parity-later',
      method: 'GET',
      path: '/api/v1/later',
      status: 200,
      ok: true,
    });
    fixture.detectChanges();
    expect(element.querySelector('.api-traffic-caption')?.textContent).toContain('/api/v1/ok');
    expect(apiTrafficHistory.get(ok)).not.toBeNull();

    buttonByTitle(element, 'Show errors only').click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.api-traffic-row')).toHaveLength(1);
    expect(element.querySelector('.api-traffic-row')?.textContent).toContain('/api/v1/error');

    const errorRoute = [
      ...element.querySelectorAll<HTMLLabelElement>('.api-traffic-route-option'),
    ].find((label) => label.textContent?.includes('/api/v1/error'))!;
    const routeInput = errorRoute.querySelector<HTMLInputElement>('input')!;
    routeInput.checked = false;
    routeInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.state.debuggerState.apiTraffic.hiddenRoutes).toContain(
      'POST ./error',
    );
    expect(element.querySelectorAll('.api-traffic-row')).toHaveLength(0);

    buttonByTitle(element, 'Ignore route visibility selections').click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.api-traffic-row')).toHaveLength(1);

    buttonByTitle(element, 'Show errors only').click();
    fixture.detectChanges();
    const secretRow = [...element.querySelectorAll<HTMLElement>('.api-traffic-row')].find((row) =>
      row.textContent?.includes('/api/v1/secret'),
    )!;
    secretRow.click();
    fixture.detectChanges();
    expect(element.textContent).toContain('[REDACTED]');
    expect(element.textContent).not.toContain('top-secret');

    fixture.destroy();
  });

  it('keeps one outer Debugging Tools resize boundary and all debugger tools inside one dock body', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.developer-tools-dock')).toHaveLength(1);
    expect(element.querySelectorAll('.developer-tools-resize')).toHaveLength(1);
    const body = element.querySelector('.developer-tools-body')!;
    expect(body.querySelector('manatos-ctx-viewer')).not.toBeNull();
    expect(body.querySelector('manatos-api-traffic-viewer')).not.toBeNull();

    fixture.destroy();
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
      const detachedLayout =
        [...detached.document.head.querySelectorAll('style')].at(-1)?.textContent ?? '';
      expect(detachedLayout).toContain('height: 100dvh !important');
      expect(detachedLayout).toContain('max-height: none !important');
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

describe('Debugger conditionally mounted dock', () => {
  it('attaches the details splitter even when the dock mounts after first render', async () => {
    await TestBed.configureTestingModule({
      imports: [ParityHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ParityHost);
    fixture.componentInstance.visible.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.developer-tools-dock')).toBeNull();

    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const dock = fixture.nativeElement.querySelector<HTMLElement>('.developer-tools-dock');
    expect(dock).not.toBeNull();
    const trafficTab = [...dock!.querySelectorAll<HTMLButtonElement>('.developer-tools-tab')].find(
      (button) => button.textContent?.toUpperCase().includes('API TRAFFIC'),
    );
    expect(trafficTab).toBeDefined();
    trafficTab!.click();
    const id = beginTraffic({
      requestId: 'resizable',
      method: 'GET',
      path: '/api/v1/test',
      status: 200,
      ok: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const row = dock!.querySelector<HTMLButtonElement>(`[data-api-entry-id="${id}"]`);
    expect(row).not.toBeNull();
    row!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = dock!.querySelector<HTMLElement>('[data-debug-resizable-panel="api-details"]');
    const handle = dock!.querySelector<HTMLElement>('[data-debug-vertical-resize="api-details"]');
    expect(panel).not.toBeNull();
    expect(handle).not.toBeNull();
    const container = panel!.parentElement!;
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 700 });
    panel!.getBoundingClientRect = () =>
      ({ height: Number.parseFloat(panel!.style.height) || 260 }) as DOMRect;
    const pointer = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        clientY: { value: clientY },
        button: { value: 0 },
      });
      return event;
    };
    handle!.dispatchEvent(pointer('pointerdown', 340));
    document.dispatchEvent(pointer('pointermove', 380));
    expect(Number.parseFloat(panel!.style.height)).toBeGreaterThan(260);
    document.dispatchEvent(pointer('pointerup', 380));
    fixture.destroy();
  });
});
