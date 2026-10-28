import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  ApplicationState,
  createMemoryUiStateRuntime,
  getUiPlatforms,
  resolveUiPlatformIdentity,
  resolveUiPageRoute,
} from '@manatos/shared-ui';

import {
  Page,
  Debugger,
  Footer,
  Header,
  PlatformSelector,
  Preferences,
  PrimaryNavigation,
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
        [signedIn]="false"
      >
        <manatos-platform-selector
          [current]="currentPlatform"
          [platforms]="platforms"
          [navigation]="state.platformNavigation"
          [open]="false"
        />

        <span>Angular UI</span>
      </manatos-header>

      <manatos-primary-navigation
        [items]="state.primaryNavigation"
        [languages]="state.languages"
        [developerItems]="state.debugMenu"
        [debuggerAllowed]="true"
        [currentLanguage]="state.currentLanguage"
        [fontScalePercent]="state.preferences.fontScalePercent"
        [navigationOpen]="false"
        [languageOpen]="false"
        [developerOpen]="false"
      />

      <manatos-workspace-navigation [items]="state.workspaceNavigation" />

      <manatos-workspace>
        <manatos-page [presentation]="pagePresentation">
          <section page-content>Angular UI skeleton</section>
        </manatos-page>
      </manatos-workspace>

      <manatos-debugger [context]="state.context" />

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

describe('NG1 application', () => {
  it('composes the shared Angular application shell', async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const html = element.innerHTML;
    const text = element.textContent ?? '';

    expect(element.querySelector('manatos-shell')).not.toBeNull();
    expect(element.querySelector('manatos-header')).not.toBeNull();
    expect(element.querySelector('manatos-platform-selector')).not.toBeNull();
    expect(element.querySelector('manatos-primary-navigation')).not.toBeNull();
    expect(element.querySelector('manatos-workspace-navigation')).not.toBeNull();
    expect(element.querySelector('manatos-workspace')).not.toBeNull();
    expect(element.querySelector('manatos-page')).not.toBeNull();
    expect(element.querySelector('manatos-breadcrumb')).not.toBeNull();
    expect(element.querySelector('manatos-page-title')).not.toBeNull();
    expect(element.querySelector('manatos-page-content')).not.toBeNull();
    expect(element.querySelector('manatos-details-toggle')).not.toBeNull();
    expect(element.querySelector('manatos-debugger')).not.toBeNull();
    expect(element.querySelector('manatos-footer')).not.toBeNull();
    expect(element.querySelector('manatos-preferences')).not.toBeNull();

    expect(text).toContain('Angular UI');
    expect(text).toContain('Home');
    expect(text).toContain('Company');
    expect(text).toContain('protoCRM');
    expect(text).toContain('Panoptes');
    expect(text).toContain('Resources');

    expect(text).not.toContain('Apps Playground');
    // The browser has no authenticated session: only public navigation is available.
    const workspaceText = element.querySelector('.workspace-navigation')?.textContent ?? '';
    for (const privateItem of [
      'Administration',
      'Users',
      'Principals',
      'Applications',
      'Licenses',
      'Configuration',
      'External authentication',
      'Preferences',
      'Logout',
    ]) {
      expect(workspaceText).not.toContain(privateItem);
    }

    expect(text).toContain('Angular UI skeleton');
    expect(text).toContain('ManatOS');

    expect(html).toContain('manatos-logo-middle-1.png');
    expect(html).toContain('manatos-logo-middle-2.png');

    expect(element.querySelector('.platform-selector')).not.toBeNull();
    expect(element.querySelector('.platform-icon.bi.bi-boxes')).not.toBeNull();

    expect(element.querySelector('.primary-navigation .bi-house')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-building')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-boxes')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-grid')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-book')).not.toBeNull();
    expect(element.querySelector('.primary-navigation .bi-bug')).not.toBeNull();

    expect(html).toContain('/assets/flags/en.svg');
    expect(html).toContain('100%');
    expect(element.querySelector('manatos-font-scale')).not.toBeNull();
    expect(element.querySelector('.font-scale .bi-caret-up-fill')).not.toBeNull();
    expect(element.querySelector('.font-scale .bi-caret-down-fill')).not.toBeNull();
    expect(element.querySelector('[title="Reset to 100%"]')).not.toBeNull();

    expect(html).not.toContain('ApplicationShell');
    expect(html).not.toContain('TopBar');
    expect(html).not.toContain('HorizontalMenu');
    expect(html).not.toContain('LeftMenu');
    expect(html).not.toContain('PageLayout');

    fixture.destroy();
  });
});
