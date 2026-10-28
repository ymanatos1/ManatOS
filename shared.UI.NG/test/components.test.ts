import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ContextTreeRuntime,
  type ExpressionCapabilityDelegate,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  ApplicationState,
  apiTrafficHistory,
  createMemoryUiStateRuntime,
  getUiPlatforms,
  resolveUiPlatformIdentity,
  resolveUiPageRoute,
} from '@manatos/shared-ui';

import {
  Debugger,
  DetachableWindow,
  DetachToggle,
  Footer,
  Header,
  PlatformSelector,
  Preferences,
  PrimaryNavigation,
  Page,
  Shell,
  Workspace,
  WorkspaceNavigation,
} from '@manatos/shared-ui-ng';

@Component({
  standalone: true,
  imports: [
    Shell,
    Header,
    PlatformSelector,
    PrimaryNavigation,
    WorkspaceNavigation,
    Workspace,
    Page,
    DetachableWindow,
    DetachToggle,
    Debugger,
    Footer,
    Preferences,
  ],
  template: `
    <manatos-preferences [theme]="state.preferences.theme" />

    <manatos-shell>
      <manatos-header
        [versionLabel]="state.versionLabel"
        [statusLabel]="'Angular UI · API offline'"
      >
        <manatos-platform-selector
          [current]="currentPlatform"
          [platforms]="platforms"
          [navigation]="state.platformNavigation"
          [open]="false"
        />

        <span>NG UI</span>
      </manatos-header>

      <manatos-primary-navigation
        [items]="state.primaryNavigation"
        [languages]="state.languages"
        [developerItems]="state.debugMenu"
        [debuggerAllowed]="true"
        [currentLanguage]="state.currentLanguage"
        [fontScalePercent]="state.preferences.fontScalePercent"
        [navigationOpen]="false"
        [languageOpen]="true"
        [developerOpen]="true"
      />

      <manatos-workspace-navigation [items]="state.workspaceNavigation" />

      <manatos-workspace>
        <manatos-detachable-window [enabled]="false">
          <manatos-page [presentation]="pagePresentation">
            <manatos-detach-toggle page-title-actions subject="Documentation" />
            <section page-content>NG UI skeleton</section>
          </manatos-page>
        </manatos-detachable-window>
      </manatos-workspace>

      <manatos-debugger [context]="state.context" [visible]="true" />

      <manatos-footer [state]="state" />
    </manatos-shell>
  `,
})
class TestHost {
  protected readonly state = new ApplicationState('Angular', '1', createMemoryUiStateRuntime());

  protected readonly pagePresentation = resolveUiPageRoute('/', this.state.company)!.presentation;

  protected readonly platforms = getUiPlatforms();

  protected readonly currentPlatform =
    this.state.currentPlatformId === null
      ? null
      : resolveUiPlatformIdentity(this.state.currentPlatformId);
}

@Component({
  standalone: true,
  imports: [PrimaryNavigation],
  template: `
    <manatos-primary-navigation
      [items]="state.primaryNavigation"
      [languages]="state.languages"
      [developerItems]="state.debugMenu"
      [currentLanguage]="state.currentLanguage"
      [fontScalePercent]="state.preferences.fontScalePercent"
      [navigationOpen]="navigationOpen()"
      [languageOpen]="false"
      [developerOpen]="false"
      (navigationOpenRequested)="toggleNavigationOpen()"
    />
  `,
})
class PrimaryNavigationTestHost {
  protected readonly state = new ApplicationState('Angular', '1', createMemoryUiStateRuntime());
  protected readonly navigationOpen = signal(false);

  protected toggleNavigationOpen(): void {
    this.navigationOpen.update((open) => !open);
  }
}

@Component({
  standalone: true,
  imports: [Debugger],
  template: `<manatos-debugger
    [context]="context"
    [expressionCapabilityDelegate]="expressionCapabilityDelegate"
    [visible]="debuggerVisible()"
  />`,
})
class CtxViewerTestHost {
  readonly debuggerVisible = signal(true);
  readonly expressionCapabilityDelegate: ExpressionCapabilityDelegate = {
    capabilities: ['entityResolver'],
    evaluateFunction: vi.fn(async () => 'root'),
  };
  private readonly entities = {};
  private readonly enums = {};
  readonly context = new ContextTreeRuntime<ManatOSRuntimeRootContext>({
    company: { nested: { leaf: 'value' } },
    system: {},
    runtime: { subsystems: {}, entities: this.entities, enums: this.enums, user: null },
  } as unknown as ManatOSRuntimeRootContext);
}

describe('@manatos/shared-ui-ng components', () => {
  it('switches directly between top-level primary-navigation menus', async () => {
    await TestBed.configureTestingModule({
      imports: [PrimaryNavigationTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(PrimaryNavigationTestHost);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const resources = element.querySelector<HTMLButtonElement>('[title="Open resources"]')!;
    const platform = element.querySelector<HTMLButtonElement>('[title="Open a platform page"]')!;

    resources.click();
    fixture.detectChanges();
    expect(resources.getAttribute('aria-expanded')).toBe('true');

    platform.click();
    fixture.detectChanges();
    expect(platform.getAttribute('aria-expanded')).toBe('true');
    expect(resources.getAttribute('aria-expanded')).toBe('false');
    expect(element.textContent).toContain('protoCRM');
    expect(element.textContent).toContain('Panoptes');
  });

  it('provides the canonical ManatOS UI component set', async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();

    const preferences = fixture.debugElement.query(
      (debugElement) => debugElement.componentInstance instanceof Preferences,
    ).componentInstance as Preferences;

    preferences.open();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const html = element.innerHTML;
    const text = element.textContent ?? '';

    expect(text).toContain('Website user preferences');
    expect(text).toContain('UI Theme');
    expect(text).toContain('Lighter');
    expect(text).toContain('Darker');
    expect(text).toContain('Selected theme preview');
    expect(text).toContain('Save preferences');

    expect(element.querySelector('manatos-primary-navigation')).not.toBeNull();
    expect(element.querySelector('manatos-workspace-navigation')).not.toBeNull();

    expect(text).toContain('Home');
    expect(text).toContain('Company');
    expect(text).toContain('protoCRM');
    expect(text).toContain('Panoptes');
    expect(text).toContain('Resources');

    expect(text).not.toContain('Apps Playground');
    // Anonymous navigation has no authenticated items; the Preferences dialog
    // remains available as a separate component, not a hard-coded menu entry.
    const workspaceText = element.querySelector('.workspace-navigation')?.textContent ?? '';
    expect(workspaceText).not.toContain('Administration');
    expect(workspaceText).not.toContain('Preferences');
    expect(workspaceText).not.toContain('Logout');
    expect(element.querySelector('manatos-preferences')).not.toBeNull();
    expect(element.querySelector('manatos-detachable-window')).not.toBeNull();
    expect(element.querySelector('manatos-page')).not.toBeNull();
    expect(element.querySelector('manatos-breadcrumb')).not.toBeNull();
    expect(element.querySelector('manatos-page-title')).not.toBeNull();
    expect(element.querySelector('manatos-page-content')).not.toBeNull();
    expect(element.querySelector('manatos-details-toggle')).not.toBeNull();
    expect(element.querySelector('manatos-detach-toggle')).not.toBeNull();
    expect(text).toContain('NG UI skeleton');
    expect(text).toContain('ManatOS');

    expect(element.querySelector('manatos-page-details')).toBeNull();
    (element.querySelector('manatos-details-toggle button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('manatos-page-details')).not.toBeNull();
    expect(element.textContent).toContain(
      'Contextual page information will appear here when required.',
    );

    expect(html).toContain('manatos-logo-middle-1.png');
    expect(html).toContain('manatos-logo-middle-2.png');
    expect(html).toContain('brand-logo-darker');
    expect(html).toContain('brand-logo-lighter');

    expect(element.querySelector('.platform-selector')).not.toBeNull();
    expect(element.querySelector('.platform-icon.bi.bi-boxes')).not.toBeNull();

    expect(element.querySelector('.primary-navigation .bi-house')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-building')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-boxes')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-grid')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-book')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-bug')).not.toBeNull();

    expect(text).toContain('EN — English');
    expect(text).toContain('EL — Ελληνικά');
    expect(text).toContain('100%');
    expect(element.querySelector('manatos-font-scale')).not.toBeNull();
    expect(element.querySelector('.font-scale .bi-caret-up-fill')).not.toBeNull();
    expect(element.querySelector('.font-scale .bi-caret-down-fill')).not.toBeNull();
    expect(element.querySelector('[title="Decrease font size"]')).not.toBeNull();
    expect(element.querySelector('[title="Increase font size"]')).not.toBeNull();
    expect(element.querySelector('[title="Reset to 100%"]')).not.toBeNull();
    expect(text).toContain('Show/hide Debugging tools');
    expect(text).toContain('Show CTX errors/warnings');
    expect(element.querySelector('.primary-navigation-language-menu .active')).not.toBeNull();
    expect(
      element.querySelector('.primary-navigation-language-menu [aria-current="true"]'),
    ).not.toBeNull();
    expect(element.querySelector('.primary-navigation-menu-divider')).not.toBeNull();
    expect(element.querySelector('.primary-navigation-menu-check.bi-square')).not.toBeNull();
    expect(element.querySelector('.primary-navigation-menu-check.bi-check-square')).not.toBeNull();
    expect(element.querySelector('.developer-tools-detach')).not.toBeNull();

    expect(html).not.toContain('ApplicationShell');
    expect(html).not.toContain('TopBar');
    expect(html).not.toContain('HorizontalMenu');
    expect(html).not.toContain('LeftMenu');
    expect(html).not.toContain('PageLayout');
  });

  it('keeps CTX Watch visual and does not hijack the current selection on change', async () => {
    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('[data-ctx-path="ctx.runtime"]') as HTMLElement).click();
    fixture.detectChanges();
    (
      element.querySelector('[title="Watch selected CTX value for changes"]') as HTMLButtonElement
    ).click();
    (element.querySelector('[data-ctx-path="ctx.company"]') as HTMLElement).click();
    fixture.detectChanges();

    fixture.componentInstance.context.set('ctx.runtime.subsystems', { changed: {} });
    fixture.detectChanges();

    expect(
      element.querySelector('[data-ctx-path="ctx.company"]')?.classList.contains('is-selected'),
    ).toBe(true);
    expect(
      element
        .querySelector('[data-ctx-path="ctx.runtime"]')
        ?.classList.contains('is-watch-changed'),
    ).toBe(true);

    fixture.destroy();
  });

  it('keeps the CTX CLI pinned to its opening CTX node until reopened', async () => {
    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('[title="Open CLI at selected CTX node"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const console = element.querySelector('.debugging-cli-console') as HTMLElement;
    const input = element.querySelector('.debugging-cli-input') as HTMLTextAreaElement;
    expect(console).not.toBeNull();
    expect(input).not.toBeNull();
    expect(element.querySelector('.debugging-cli-resize')).not.toBeNull();
    expect(element.querySelector('[title="Close CLI"]')).not.toBeNull();

    console.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.ownerDocument.activeElement).toBe(input);

    input.value = 'first line\nsecond line';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(input.style.height).not.toBe('');

    (element.querySelector('[data-ctx-path="ctx.runtime"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.debugging-cli-prompt')?.textContent?.trim()).toBe('$ >');

    input.value = 'help';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    (element.querySelector('.debugging-cli-prompt') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.debugging-cli-history-item')?.textContent?.trim()).toBe('help');

    await Promise.resolve();
    console.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('.debugging-cli-history')).toBeNull();

    (element.querySelector('.debugging-cli-prompt') as HTMLButtonElement).click();
    fixture.detectChanges();
    await Promise.resolve();
    element.ownerDocument.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('.debugging-cli-history')).toBeNull();

    (element.querySelector('[title="Close CLI"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('manatos-debug-cli')).toBeNull();

    (element.querySelector('[title="Open CLI at selected CTX node"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.debugging-cli-prompt')?.textContent?.trim()).toBe('$runtime >');

    (element.querySelector('[title="Close CLI"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    fixture.destroy();
  });

  it('keeps container tooltips off and shows leaf name/value tooltips after the delay', async () => {
    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const companyRow = element.querySelector('[data-ctx-path="ctx.company"]') as HTMLElement;
    expect(companyRow.dataset['debugTooltip']).toBeUndefined();

    (companyRow.querySelector('.ctx-debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const nestedRow = element.querySelector('[data-ctx-path="ctx.company.nested"]') as HTMLElement;
    (nestedRow.querySelector('.ctx-debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const leafRow = element.querySelector(
      '[data-ctx-path="ctx.company.nested.leaf"]',
    ) as HTMLElement;

    expect(leafRow.dataset['debugTooltip']).toBe('leaf');
    expect(leafRow.dataset['debugTooltipValue']).toContain('value');
    vi.useFakeTimers();
    try {
      leafRow.dispatchEvent(new Event('pointerover', { bubbles: true }));
      expect(leafRow.ownerDocument.querySelector('.manatos-debug-tooltip')).toBeNull();

      vi.advanceTimersByTime(2199);
      expect(leafRow.ownerDocument.querySelector('.manatos-debug-tooltip')).toBeNull();
      vi.advanceTimersByTime(1);
      const tooltip = leafRow.ownerDocument.querySelector('.manatos-debug-tooltip');
      expect(tooltip?.querySelector('.manatos-debug-tooltip-title')?.textContent).toBe('leaf');
      expect(tooltip?.querySelector('.manatos-debug-tooltip-value')?.textContent).toContain(
        'value',
      );
      expect(tooltip?.querySelector('.manatos-debug-tooltip-value-line')?.textContent).toContain(
        'leaf = ',
      );

      fixture.destroy();
      expect(leafRow.ownerDocument.querySelector('.manatos-debug-tooltip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a selected descendant be collapsed and destroys its hidden tree rows', async () => {
    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const companyRow = element.querySelector('[data-ctx-path="ctx.company"]') as HTMLElement;
    companyRow.click();
    fixture.detectChanges();
    (element.querySelector('[title="Selected node properties"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(
      element.querySelector('.ctx-debug-properties-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Main');
    const subscribersTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.ctx-debug-properties-tabs button'),
    ].find((button) => button.textContent?.trim() === 'Subscribers')!;
    subscribersTab.click();
    fixture.detectChanges();
    expect(
      element.querySelector('.ctx-debug-subscriber-tabs button.is-active')?.textContent?.trim(),
    ).toMatch(/^Direct/);
    (element.querySelector('[title="Close properties"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (companyRow.querySelector('.ctx-debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const nestedRow = element.querySelector('[data-ctx-path="ctx.company.nested"]') as HTMLElement;
    (nestedRow.querySelector('.ctx-debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    (element.querySelector('[data-ctx-path="ctx.company.nested.leaf"]') as HTMLElement).click();
    fixture.detectChanges();

    (nestedRow.querySelector('.ctx-debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('[data-ctx-path="ctx.company.nested.leaf"]')).toBeNull();
    expect(
      element.querySelector('[data-ctx-path="ctx.company.nested"]')?.getAttribute('aria-expanded'),
    ).toBe('false');

    fixture.destroy();
  });

  it('destroys viewer CTX subscriptions when closed without touching application subscriptions', async () => {
    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    const context = fixture.componentInstance.context;
    const unsubscribeApplication = context.subscribe(() => undefined, {
      label: 'ApplicationFieldDependency',
      path: 'ctx.company',
    });
    fixture.detectChanges();

    expect(
      context.subscriptionInfo().some((item) => item.label === 'ApplicationFieldDependency'),
    ).toBe(true);
    expect(context.subscriptionInfo().some((item) => item.label.startsWith('CtxViewer:'))).toBe(
      true,
    );

    fixture.componentInstance.debuggerVisible.set(false);
    fixture.detectChanges();

    expect(
      context.subscriptionInfo().some((item) => item.label === 'ApplicationFieldDependency'),
    ).toBe(true);
    expect(context.subscriptionInfo().some((item) => item.label.startsWith('CtxViewer:'))).toBe(
      false,
    );

    fixture.componentInstance.debuggerVisible.set(true);
    fixture.detectChanges();
    expect(context.subscriptionInfo().some((item) => item.label.startsWith('CtxViewer:'))).toBe(
      true,
    );

    fixture.destroy();
    expect(context.subscriptionInfo().map((item) => item.label)).toEqual([
      'ApplicationFieldDependency',
    ]);
    unsubscribeApplication();
    expect(context.subscriptionInfo()).toEqual([]);
  });

  it('keeps API Traffic newest-first and freezes the paused viewer through Clear', async () => {
    apiTrafficHistory.clear();
    const older = apiTrafficHistory.begin({
      requestId: 'api-old',
      method: 'GET',
      path: '/api/v1/old',
    });
    apiTrafficHistory.complete(older, { status: 200, ok: true });
    const newer = apiTrafficHistory.begin({
      requestId: 'api-new',
      method: 'GET',
      path: '/api/v1/new',
    });
    apiTrafficHistory.complete(newer, {
      status: 200,
      ok: true,
      responseBody: null,
      diagnostics: {
        requestId: 'api-new',
        capturedAt: '2026-10-09T00:00:00.000Z',
        apiContext: {
          path: '$api.level-api-new',
          levelIds: ['api-new'],
          ctx: { request: { id: 'api-new' } },
        },
        storageContexts: [],
        logs: [
          {
            timestamp: '2026-10-09T00:00:00.100Z',
            level: 'info',
            requestId: 'api-new',
            message: 'request completed',
            subsystem: 'test',
          },
        ],
      },
    });

    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const apiTab = [...element.querySelectorAll<HTMLButtonElement>('.developer-tools-tab')].find(
      (button) => button.textContent?.includes('API TRAFFIC'),
    )!;
    apiTab.click();
    fixture.detectChanges();

    const rows = [...element.querySelectorAll<HTMLElement>('.api-traffic-row')];
    expect(rows[0]?.textContent).toContain('/api/v1/new');
    expect(rows[1]?.textContent).toContain('/api/v1/old');

    rows[0]?.click();
    fixture.detectChanges();
    expect(
      element.querySelector('.api-traffic-details-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Request');
    expect(
      element.querySelector('.api-traffic-payload-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Headers');
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('.api-traffic-payload-tabs button')].find(
        (button) => button.textContent?.trim() === 'Body',
      ),
    ).toBeUndefined();
    const apiCtxTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.api-traffic-details-tabs button'),
    ].find((button) => button.textContent?.trim() === 'API CTX')!;
    apiCtxTab.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-ctx-path="ctx.request.id"]')).not.toBeNull();
    element
      .querySelector<HTMLElement>('[data-ctx-path="ctx.request"]')
      ?.querySelector<HTMLButtonElement>('.ctx-debug-toggle')
      ?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-ctx-path="ctx.request.id"]')).toBeNull();
    apiTrafficHistory.complete(older, { status: 204, ok: true });
    fixture.detectChanges();
    expect(element.querySelector('[data-ctx-path="ctx.request.id"]')).toBeNull();
    const logsTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.api-traffic-details-tabs button'),
    ].find((button) => button.textContent?.trim() === 'Logs')!;
    logsTab.click();
    fixture.detectChanges();
    expect(element.querySelector('.api-traffic-log-text')?.textContent).toContain(
      'INFO request completed {"subsystem":"test"}',
    );

    (element.querySelector('[title="Pause live updates"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    apiTrafficHistory.complete(newer, { status: 201, statusText: 'Updated', ok: true });
    fixture.detectChanges();
    const responseTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.api-traffic-details-tabs button'),
    ].find((button) => button.textContent?.trim() === 'Response')!;
    responseTab.click();
    fixture.detectChanges();
    expect(
      element.querySelector('.api-traffic-payload-tabs button.is-active')?.textContent?.trim(),
    ).toBe('Headers');
    const responseBodyTab = [
      ...element.querySelectorAll<HTMLButtonElement>('.api-traffic-payload-tabs button'),
    ].find((button) => button.textContent?.trim() === 'Body');
    expect(responseBodyTab).toBeDefined();
    responseBodyTab?.click();
    fixture.detectChanges();
    expect(element.querySelector('.api-traffic-payload-pre')?.textContent?.trim()).toBe('null');
    expect(apiTrafficHistory.get(newer)?.status).toBe(201);
    expect(element.querySelector('.api-traffic-meta')?.textContent).toContain('200');

    const liveOnly = apiTrafficHistory.begin({
      requestId: 'api-live',
      method: 'GET',
      path: '/api/v1/live-only',
    });
    apiTrafficHistory.complete(liveOnly, { status: 200, ok: true });
    fixture.detectChanges();
    expect(element.textContent).not.toContain('/api/v1/live-only');

    (element.querySelector('[title="Clear captured traffic"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.api-traffic-row').length).toBe(0);
    expect(element.querySelector('[title="Resume live updates"]')).not.toBeNull();

    const afterClear = apiTrafficHistory.begin({
      requestId: 'api-after-clear',
      method: 'GET',
      path: '/api/v1/after-clear',
    });
    apiTrafficHistory.complete(afterClear, { status: 200, ok: true });
    fixture.detectChanges();
    expect(element.textContent).not.toContain('/api/v1/after-clear');

    (element.querySelector('[title="Resume live updates"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('/api/v1/after-clear');

    fixture.destroy();
    apiTrafficHistory.clear();
  });

  it('routes reached async CLI capabilities through the host delegate without creating transport in the CLI', async () => {
    await TestBed.configureTestingModule({
      imports: [CtxViewerTestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CtxViewerTestHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('[title="Open CLI at selected CTX node"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = element.querySelector('.debugging-cli-input') as HTMLTextAreaElement;
    input.value = "TraverseEntity('parent', 'sys-principals', 'parentId', 'id')";
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.componentInstance.expressionCapabilityDelegate.evaluateFunction,
    ).toHaveBeenCalledWith({
      functionName: 'TraverseEntity',
      capability: 'entityResolver',
      args: ['parent', 'sys-principals', 'parentId', 'id'],
    });
    expect(element.textContent).toContain('root');

    fixture.destroy();
  });
});
