import { describe, expect, it } from 'vitest';

import {
  ApplicationState,
  DEFAULT_UI_THEME,
  createMemoryUiStateRuntime,
  getUiPlatforms,
  resolveUiPlatformIdentity,
  resolveUiPageRoute,
} from '@manatos/shared-ui';

import {
  renderDocumentationPopup,
  renderPage,
  renderDetachToggle,
  renderDetachableWindow,
  renderDebugger,
  renderFooter,
  renderHeader,
  renderPlatformSelector,
  renderPreferences,
  renderPrimaryNavigation,
  renderShell,
  renderWorkspace,
  renderWorkspaceNavigation,
} from '../src/index.js';

function createState(): ApplicationState {
  return new ApplicationState('EJS', '1', createMemoryUiStateRuntime());
}

describe('@manatos/shared-ui-ejs components', () => {
  it('renders the independent Documentation popup actions and copied FontScale', () => {
    const state = createState();
    const html = renderDocumentationPopup({
      fontScalePercent: 120,
      footer: {
        companyShortName: state.company.shortName,
        companyName: state.company.name,
        versionLabel: state.versionLabel,
      },
    });

    expect(html).toContain('data-documentation-popup');
    expect(html).toContain('>120%</span>');
    expect(html).toContain('data-surface-action="open-new"');
    expect(html).toContain('Open new documentation popup');
    expect(html).toContain('data-surface-action="attach"');
    expect(html).toContain('Attach documentation');
    expect(html).toContain('data-surface-action="close-all"');
    expect(html).toContain('Close all documentation popups');
    expect(html).toContain('corporate-footer');
    expect(html).not.toContain('href="/company"');
    expect(html).not.toContain('Attach all');
  });

  it('provides the canonical ManatOS UI component set', () => {
    const state = createState();

    const currentPlatform =
      state.currentPlatformId === null ? null : resolveUiPlatformIdentity(state.currentPlatformId);

    const presentation = resolveUiPageRoute('/', state.company)!.presentation;

    const html = renderShell({
      header: renderHeader({
        versionLabel: state.versionLabel,
        actions:
          renderPlatformSelector({
            current: currentPlatform,
            platforms: getUiPlatforms(),
            navigation: state.platformNavigation,
          }) + '<span>EJS UI</span>',
      }),

      primaryNavigation: renderPrimaryNavigation({
        items: state.primaryNavigation,
        languages: state.languages,
        developerItems: state.debugMenu,
        currentLanguage: state.currentLanguage,
        fontScalePercent: state.preferences.fontScalePercent,
      }),

      workspaceNavigation: renderWorkspaceNavigation({
        items: state.workspaceNavigation,
      }),

      workspace: renderWorkspace({
        content: renderPage({
          presentation,
          content: '<section>EJS UI skeleton</section>',
        }),
      }),

      debugger: renderDebugger(),

      footer: renderFooter({
        companyShortName: state.company.shortName,
        companyName: state.company.name,
        versionLabel: state.versionLabel,
      }),
    });

    const preferences = renderPreferences({
      theme: DEFAULT_UI_THEME,
    });

    expect(preferences).toContain('Website user preferences');
    expect(preferences).toContain('UI Theme');
    expect(preferences).toContain('Lighter');
    expect(preferences).toContain('Darker');
    expect(preferences).toContain('Selected theme preview');
    expect(preferences).toContain('Save preferences');
    expect(preferences).toContain('value="lighter"');
    expect(preferences).toContain('checked');

    expect(html).toContain('Primary navigation');
    expect(html).toContain('Workspace navigation');

    expect(html).toContain('Home');
    expect(html).toContain('Company');
    expect(html).toContain('protoCRM');
    expect(html).toContain('Panoptes');
    expect(html).toContain('Resources');

    expect(html).not.toContain('Apps Playground');
    // Anonymous shell navigation must not expose authenticated actions.
    expect(html).not.toContain('Administration');
    expect(html).not.toContain('Preferences');
    expect(html).toContain('class="page-breadcrumb"');
    expect(html).toContain('class="surface-title page-title"');
    expect(html).toContain('class="page-content"');
    expect(html).toContain('data-page-details-toggle');
    expect(html).toContain('data-page-details');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-manatos-debugger-host');
    expect(html).toMatch(/<\/main>\s*<div class="manatos-debugger-host"/);
    expect(html).toContain('EJS UI skeleton');
    expect(html).toContain('ManatOS');

    expect(html).toContain('manatos-logo-middle-1.png');
    expect(html).toContain('manatos-logo-middle-2.png');
    expect(html).toContain('brand-logo-darker');
    expect(html).toContain('brand-logo-lighter');

    expect(html).toContain('platform-selector');
    expect(html).toContain('data-platform-id="protocrm"');
    expect(html).toContain('data-platform-none');
    expect(html).toContain('platform-icon bi bi-boxes');

    expect(html).toContain('bi bi-house');
    expect(html).toContain('bi bi-building');
    expect(html).toContain('bi bi-boxes');
    expect(html).toContain('bi bi-grid');

    expect(html).toContain('/assets/flags/en.svg');
    expect(html).toContain('/assets/flags/el.svg');
    expect(html).toContain('class="font-scale"');
    expect(html).toContain('bi-caret-up-fill');
    expect(html).toContain('bi-caret-down-fill');
    expect(html).toContain('data-font-scale-reset');
    expect(html).toContain('title="Reset to 100%"');
    expect(html).toContain('data-font-scale-delta="-20"');
    expect(html).toContain('>100%</span>');
    expect(html).toContain('data-language="en"');
    expect(html).toContain('data-language="el"');
    expect(html).toContain('EN — English');
    expect(html).toContain('EL — Ελληνικά');
    expect(html).toContain('class="active"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('Show/hide Debugging tools');
    expect(html).toContain('Show CTX errors/warnings');
    expect(html).toContain('primary-navigation-menu-divider');
    expect(html).toContain('bi-square');
    expect(html).toContain('bi-check-square');
    expect(html).toContain('data-navigation-id="platform-protocrm"');
    expect(html).toContain('data-navigation-id="platform-panoptes"');
    expect(html).toContain('data-documentation-open');
    expect(html).toContain('bi bi-bug');

    expect(html).not.toContain('ApplicationShell');
    expect(html).not.toContain('TopBar');
    expect(html).not.toContain('HorizontalMenu');
    expect(html).not.toContain('LeftMenu');
    expect(html).not.toContain('PageLayout');

    const detachable = renderDetachableWindow({
      content: renderDetachToggle({ subject: 'Documentation' }),
    });
    expect(detachable).toContain('data-detachable-window');
    expect(detachable).toContain('data-detach-toggle');
    expect(detachable).toContain('Detach Documentation');
    expect(detachable).toContain('bi-box-arrow-up-right');
  });
});
