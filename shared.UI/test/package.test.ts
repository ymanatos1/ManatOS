import { describe, expect, it } from 'vitest';
import { resolveMetadataText } from '@manatos/shared';
import {
  ApplicationState,
  DEFAULT_UI_THEME,
  MAX_UI_FONT_SCALE_PERCENT,
  MIN_UI_FONT_SCALE_PERCENT,
  UI_FONT_SCALE_STEP_PERCENT,
  MANATOS_UI_BRANDING,
  createUiPlatformState,
  resolveUiPlatformIdentity,
  resolveUiPageRoute,
  UI_ERROR_PAGE_PRESENTATION,
  UI_NOT_FOUND_PAGE_PRESENTATION,
  UI_CLI_HISTORY_LIMIT,
  UI_CLI_HISTORY_STORAGE_KEY,
  UI_PREFERENCES_STORAGE_KEY,
  UI_TAB_LATEST_STORAGE_KEY,
  UI_TAB_STORAGE_KEY,
  UI_WINDOW_IDS,
  UiPreferencesStore,
  createMemoryUiStateRuntime,
  documentationPopupState,
  defaultUiPreferences,
  normalizeUiPreferences,
  normalizeUiFontScalePercent,
  uiFontScaleFactor,
  normalizeUiTheme,
  parseUiPreferences,
  type UiAuthorizationContextProjection,
} from '../src/index.js';

describe('@manatos/shared-ui', () => {
  it('copies Documentation popup launch state without sharing mutable location state', () => {
    const location = { path: 'docs/README.md', anchor: 'architecture' };
    const state = documentationPopupState(location, 120);

    location.path = 'docs/other.md';
    location.anchor = 'other';

    expect(state).toEqual({
      location: { path: 'docs/README.md', anchor: 'architecture' },
      fontScalePercent: 120,
    });
  });

  it('projects canonical ManatOS branding from shared', () => {
    expect(MANATOS_UI_BRANDING.tagline).toBe('@CO.Branding.Tagline');
    expect(resolveMetadataText(MANATOS_UI_BRANDING.tagline, 'EN')).toBe(
      'ManatOS — the operational platform for ManatOS applications.',
    );
    expect(resolveMetadataText(MANATOS_UI_BRANDING.tagline, 'EL')).not.toBe('@CO.Branding.Tagline');
    expect(MANATOS_UI_BRANDING.headerLogo.darker.src).toBe('/assets/manatos-logo-middle-1.png');
    expect(MANATOS_UI_BRANDING.headerLogo.lighter.src).toBe('/assets/manatos-logo-middle-2.png');
    expect(resolveUiPlatformIdentity()).toEqual({
      id: 'protocrm',
      name: 'protoCRM Platform',
      shortName: 'protoCRM',
      description:
        'CRM business platform for defining customer relationships, business activity and connected applications on the ManatOS operational platform.',
      icon: 'bi-boxes',
    });
  });

  it('projects reusable static-page breadcrumb, title and optional Details chrome', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());
    const platform = resolveUiPageRoute('/platform/protocrm', state.company);

    expect(platform?.presentation).toMatchObject({
      breadcrumb: [
        { label: 'ManatOS', href: '/' },
        { label: 'Platform · protoCRM', href: null },
      ],
      title: {
        title: 'protoCRM',
        icon: 'bi-boxes',
        subtitle: 'protoCRM — Customer Relationship Management on ManatOS',
      },
      details: { available: true },
    });
    expect(UI_NOT_FOUND_PAGE_PRESENTATION.details.available).toBe(false);
    expect(UI_ERROR_PAGE_PRESENTATION.details.available).toBe(false);
  });

  it('keeps shared shell utility menu metadata aligned with the EJS0 reference', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());

    expect(state.languages).toEqual([
      { id: 'en', code: 'EN', name: 'English', nativeName: 'English', flag: 'en' },
      { id: 'el', code: 'EL', name: 'Greek', nativeName: 'Ελληνικά', flag: 'el' },
    ]);
    expect(state.currentLanguage.id).toBe('en');
    expect(state.debugMenu.map((item) => item.label)).toEqual([
      'Show/hide Debugging tools',
      'Show CTX errors/warnings',
    ]);
    expect(state.debugMenu.map((item) => item.checked)).toEqual([false, true]);
    expect(state.debugMenu[1]?.separatorBefore).toBe(true);
  });

  it('projects Platform as one catalogue-driven primary menu across platform selections', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());

    const assertPlatformMenu = () => {
      const platform = state.primaryNavigation.find((item) => item.id === 'platform');

      expect(platform).toMatchObject({
        label: 'Platform',
        icon: 'bi-boxes',
      });
      expect(platform?.url).toBeUndefined();
      expect(platform?.children).toEqual([
        expect.objectContaining({
          id: 'platform-protocrm',
          label: 'protoCRM',
          url: '/platform/protocrm',
        }),
        expect.objectContaining({
          id: 'platform-panoptes',
          label: 'Panoptes',
          url: '/platform/panoptes',
        }),
      ]);
    };

    assertPlatformMenu();
    state.selectPlatform('panoptes');
    assertPlatformMenu();
    state.selectPlatform(null);
    assertPlatformMenu();
  });

  it('keeps Documentation popup geometry separate from remembered Documentation pages', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());
    const placement = { left: 120, top: 90, width: 1180, height: 780, state: 'normal' as const };

    expect(UI_WINDOW_IDS.documentation).toBe('documentation');
    expect(state.documentationWindowPlacement).toBeNull();

    state.saveDocumentationWindowPlacement(placement);
    state.rememberDocumentationPage({ path: 'README.md', anchor: 'architecture' });

    expect(state.documentationWindowPlacement).toEqual(placement);
    expect(state.documentationPopupEndurance).toEqual({ placement });
    expect(state.documentationRememberedPages).toEqual([
      { path: 'README.md', anchor: 'architecture' },
    ]);
  });

  it('migrates the previous Documentation popup location into the Documentation-only list', () => {
    const placement = { left: 80, top: 70, width: 1000, height: 700, state: 'normal' as const };
    const normalized = normalizeUiPreferences({
      ...defaultUiPreferences(),
      endurance: {
        windows: {},
        documentationPopup: {
          placement,
          path: 'docs/README.md',
          anchor: 'popup-windows',
        },
      },
    });

    expect(normalized.endurance.documentationPopup).toEqual({ placement });
    expect(normalized.endurance.documentationPages).toEqual([
      { path: 'docs/README.md', anchor: 'popup-windows' },
    ]);
  });

  it('keeps CTX diagnostics transient, deduplicated and controlled by tab state', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());
    const diagnostic = {
      phase: 'evaluate' as const,
      timestamp: '2026-10-10T00:00:00.000Z',
      message: 'Missing CTX member.',
      expression: '$runtime.missing',
    };

    state.diagnostics.expressionDiagnosticSink(diagnostic);
    state.diagnostics.expressionDiagnosticSink(diagnostic);

    expect(state.debugDiagnosticsVisible).toBe(true);
    expect(state.diagnostics.entries).toHaveLength(1);
    expect(state.diagnostics.entries[0]?.count).toBe(2);
    expect(state.diagnostics.totalCount).toBe(2);

    state.setDebugDiagnosticsVisible(false);
    expect(state.debugDiagnosticsVisible).toBe(false);
    expect(state.diagnostics.entries).toHaveLength(0);

    state.setDebugDiagnosticsVisible(true);
    expect(state.debugDiagnosticsVisible).toBe(true);
    expect(state.diagnostics.entries).toHaveLength(0);
  });

  it('nests Panoptes operational navigation under Administration', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());

    state.selectPlatform('panoptes');
    // Platform selection alone never grants operational navigation.
    expect(state.primaryNavigation.map((item) => item.id)).toEqual([
      'home',
      'company',
      'platform',
      'resources',
    ]);
    expect(state.workspaceNavigation).toEqual([]);

    // Entity-backed navigation must receive API read grants, not just an entity catalogue.
    state.applyAuthorizationContext({
      platformId: 'panoptes',
      user: { id: 'user-1', name: 'Admin', role: 'Admin' },
      platformCapabilities: { platformAccess: true },
      entities: {
        'sys-users': { read: true },
        'sys-principals': { read: true },
        'sys-licenses': { read: true },
        'sys-guards': { read: true },
        'sys-projects': { read: true },
        'sys-posts': { read: true },
      },
    });

    const administration = state.workspaceNavigation.find((item) => item.id === 'administration');

    expect(administration?.children.map((item) => item.id)).toEqual([
      'users',
      'principals',
      'guards',
      'projects',
      'posts',
      'licenses',
    ]);
    expect(state.workspaceNavigation.map((item) => item.id).slice(0, 4)).toEqual([
      'account',
      'post-staffing-planner',
      'guard-tracker',
      'administration',
    ]);
    expect(state.workspaceNavigation.map((item) => item.id)).not.toContain('platform');
    expect(state.primaryNavigation.map((item) => item.id)).toEqual([
      'home',
      'company',
      'platform',
      'resources',
      'post-staffing-planner',
      'guard-tracker',
    ]);
  });

  it('hides Panoptes operations without platform access, including after logout', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());
    state.selectPlatform('panoptes');
    state.applyAuthorizationContext({
      platformId: 'panoptes',
      user: { id: 'user-1', name: 'Admin', role: 'Admin' },
      platformCapabilities: { platformAccess: false },
      entities: {
        'sys-users': { read: true },
        'sys-guards': { read: true },
        'sys-projects': { read: true },
        'sys-posts': { read: true },
      },
    });

    expect(state.primaryNavigation.map((item) => item.id)).toEqual([
      'home',
      'company',
      'platform',
      'resources',
    ]);
    expect(
      state.workspaceNavigation
        .find((item) => item.id === 'administration')
        ?.children.map((item) => item.id),
    ).toEqual(['users']);
    expect(state.workspaceNavigation.map((item) => item.id)).not.toContain('post-staffing-planner');
    expect(state.workspaceNavigation.map((item) => item.id)).not.toContain('guard-tracker');

    state.applyAuthorizationContext({
      platformId: 'panoptes',
      user: { id: 'user-1', name: 'Admin', role: 'Admin' },
      platformCapabilities: { platformAccess: true },
      entities: {
        'sys-users': { read: true },
        'sys-guards': { read: true },
        'sys-projects': { read: true },
        'sys-posts': { read: true },
      },
    });
    expect(state.primaryNavigation.map((item) => item.id)).toContain('guard-tracker');
    expect(
      state.workspaceNavigation
        .find((item) => item.id === 'administration')
        ?.children.map((item) => item.id),
    ).toEqual(['users', 'guards', 'projects', 'posts']);

    state.setRuntimeUser(null);
    expect(state.primaryNavigation.map((item) => item.id)).not.toContain('guard-tracker');
    expect(state.workspaceNavigation).toEqual([]);
  });

  it('does not promote a child above a denied navigation parent', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());
    state.applyAuthorizationContext({
      platformId: 'protocrm',
      user: { id: 'user-1', name: 'User', role: 'User' },
      platformCapabilities: { platformAccess: true },
      entities: { 'sys-configurations': { read: true } },
    });

    expect(state.workspaceNavigation.map((item) => item.id)).not.toContain('configuration');
    expect(
      state.workspaceNavigation.flatMap((item) => item.children.map((child) => child.id)),
    ).not.toContain('system-configuration');
  });

  it('places protoCRM Apps Playground above Administration vertically but after Resources horizontally', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());

    state.setRuntimeUser({
      scope: 'sys',
      entityName: 'sysUsers',
      mode: { kind: 'pointer', value: 'view' },
      fields: {},
      permissions: {
        userRole: 'Admin',
        platforms: {
          protocrm: { capabilities: { platformAccess: true } },
        },
      },
    });
    state.selectPlatform('panoptes');
    state.selectPlatform('protocrm');
    // Switching platforms invalidates old grants until a new API projection arrives.
    state.applyAuthorizationContext({
      platformId: 'protocrm',
      user: { id: 'user-1', name: 'Admin', role: 'Admin' },
      platformCapabilities: { platformAccess: true },
      entities: { 'sys-applications': { read: true } },
    });

    expect(state.primaryNavigation.map((item) => item.id)).toEqual([
      'home',
      'company',
      'platform',
      'resources',
      'app-playground',
    ]);
    expect(state.workspaceNavigation.map((item) => item.id).slice(0, 3)).toEqual([
      'account',
      'app-playground',
      'administration',
    ]);
    expect(state.workspaceNavigation.map((item) => item.id)).not.toContain('platform');
  });

  it('owns one versioned and normalized UI preferences document', () => {
    expect(UI_PREFERENCES_STORAGE_KEY).toBe('manatos.ui.preferences.v2');
    expect(DEFAULT_UI_THEME).toBe('lighter');
    expect(defaultUiPreferences()).toMatchObject({
      version: 2,
      anonymous: { theme: 'lighter', language: 'en', fontScalePercent: 100 },
      users: {},
      paint: { theme: 'lighter' },
    });
    expect(normalizeUiTheme(undefined)).toBe('lighter');
    expect(normalizeUiTheme('darker')).toBe('darker');
    expect(normalizeUiFontScalePercent(undefined)).toBe(100);
    expect(normalizeUiFontScalePercent(116)).toBe(120);
    expect(normalizeUiFontScalePercent(20)).toBe(80);
    expect(normalizeUiFontScalePercent(210)).toBe(200);
    expect(MIN_UI_FONT_SCALE_PERCENT).toBe(80);
    expect(MAX_UI_FONT_SCALE_PERCENT).toBe(200);
    expect(UI_FONT_SCALE_STEP_PERCENT).toBe(20);
    expect(uiFontScaleFactor(80)).toBe(0.8);
    expect(uiFontScaleFactor(100)).toBe(1);
    expect(uiFontScaleFactor(200)).toBe(2);
    expect(
      normalizeUiPreferences({
        version: 2,
        anonymous: { theme: 'darker', language: 'el', fontScalePercent: 100 },
        users: {},
        browser: {},
        paint: { theme: 'darker' },
      }),
    ).toMatchObject({
      version: 2,
      anonymous: { theme: 'darker', language: 'el' },
      paint: { theme: 'darker' },
    });
    expect(parseUiPreferences('{broken')).toEqual(defaultUiPreferences());
  });

  it('migrates v1 and contains browser persistence failures inside the preferences boundary', () => {
    const values = new Map<string, string>([
      ['manatos.ui.preferences.v1', JSON.stringify({ version: 1, theme: 'darker' })],
    ]);
    const store = new UiPreferencesStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    });

    expect(store.load()).toMatchObject({
      version: 2,
      anonymous: { theme: 'darker', language: 'en', fontScalePercent: 100 },
      paint: { theme: 'darker' },
    });
    expect(values.has('manatos.ui.preferences.v1')).toBe(false);

    expect(
      store.saveOwnerPreferences('user-1', { theme: 'lighter', language: 'el' }),
    ).toMatchObject({
      users: { 'user-1': { theme: 'lighter', language: 'el' } },
      paint: { theme: 'lighter' },
    });

    const unavailable = new UiPreferencesStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(unavailable.load()).toEqual(defaultUiPreferences());
    expect(unavailable.saveOwnerPreferences(null, { theme: 'darker' })).toMatchObject({
      anonymous: { theme: 'darker', language: 'en' },
      paint: { theme: 'darker' },
    });
  });

  it('keeps an existing tab independent while seeding a fresh tab from latest', () => {
    const localValues = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => localValues.set(key, value),
      removeItem: (key: string) => localValues.delete(key),
    };
    const firstSessionValues = new Map<string, string>();
    const firstSession = {
      getItem: (key: string) => firstSessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => firstSessionValues.set(key, value),
    };

    const first = createMemoryUiStateRuntime(localStorage, firstSession, () => 'tab-a');
    first.updateSeedable((current) => ({ ...current, platformId: null }));

    const fresh = createMemoryUiStateRuntime(localStorage, undefined, () => 'tab-b');
    expect(fresh.tabId).toBe('tab-b');
    expect(fresh.tab.platformId).toBeNull();

    first.updateSeedable((current) => ({ ...current, platformId: 'protocrm' }));
    expect(fresh.tab.platformId).toBeNull();

    const reloadedFirst = createMemoryUiStateRuntime(localStorage, firstSession, () => 'unused');
    expect(reloadedFirst.tabId).toBe('tab-a');
    expect(reloadedFirst.tab.platformId).toBe('protocrm');
  });

  it('keeps durable window placement in canonical preferences and CLI history in its own bounded store', () => {
    const localValues = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => localValues.set(key, value),
      removeItem: (key: string) => localValues.delete(key),
    };
    const runtime = createMemoryUiStateRuntime(localStorage);
    const changes: string[] = [];
    runtime.subscribe((change) => changes.push(change));

    runtime.saveWindowPlacement(UI_WINDOW_IDS.debugger, {
      left: 120,
      top: 80,
      width: 1000,
      height: 760,
      state: 'normal',
    });
    expect(runtime.windowPlacement(UI_WINDOW_IDS.debugger)).toMatchObject({
      left: 120,
      top: 80,
      width: 1000,
      height: 760,
    });
    expect(changes).toEqual(['endurance']);
    expect(JSON.parse(localValues.get(UI_PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      endurance: { windows: { debugger: { left: 120, top: 80, width: 1000, height: 760 } } },
    });

    for (let index = 0; index < UI_CLI_HISTORY_LIMIT + 5; index += 1) {
      runtime.cliHistory.add(`command-${index}`);
    }
    runtime.cliHistory.add(`command-${UI_CLI_HISTORY_LIMIT + 4}`);
    expect(runtime.cliHistory.entries).toHaveLength(UI_CLI_HISTORY_LIMIT);
    expect(runtime.cliHistory.entries[0]).toBe('command-5');
    expect(runtime.cliHistory.entries.at(-1)).toBe(`command-${UI_CLI_HISTORY_LIMIT + 4}`);
    expect(JSON.parse(localValues.get(UI_CLI_HISTORY_STORAGE_KEY)!)).toMatchObject({
      version: 1,
      entries: runtime.cliHistory.entries,
    });
    expect(JSON.parse(localValues.get(UI_PREFERENCES_STORAGE_KEY)!).cliHistory).toBeUndefined();
  });

  it('restores an open CLI on same-tab refresh but starts new tabs closed', () => {
    const localValues = new Map<string, string>();
    const sessionValues = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => localValues.set(key, value),
      removeItem: (key: string) => localValues.delete(key),
    };
    const sessionStorage = {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => sessionValues.set(key, value),
    };
    const runtime = createMemoryUiStateRuntime(localStorage, sessionStorage, () => 'tab-cli');

    runtime.updateSeedable((current) => ({
      ...current,
      debugger: {
        ...current.debugger,
        ctxViews: current.debugger.ctxViews.map((view) =>
          view.rootPath === 'ctx'
            ? { ...view, cliMode: 'opened' as const, cliOpen: true, cliCurrentPath: 'ctx.company' }
            : view,
        ),
      },
    }));

    expect(runtime.tab.debugger.ctxViews[0]).toMatchObject({
      cliMode: 'opened',
      cliOpen: true,
      cliCurrentPath: 'ctx.company',
    });
    expect(
      JSON.parse(sessionValues.get(UI_TAB_STORAGE_KEY)!).seedable.debugger.ctxViews[0],
    ).toMatchObject({
      cliMode: 'opened',
      cliOpen: true,
      cliCurrentPath: 'ctx.company',
    });
    expect(
      JSON.parse(localValues.get(UI_TAB_LATEST_STORAGE_KEY)!).seedable.debugger.ctxViews[0],
    ).toMatchObject({
      cliMode: 'closed',
      cliOpen: false,
      cliCurrentPath: 'ctx.company',
    });

    const reloaded = createMemoryUiStateRuntime(localStorage, sessionStorage, () => 'unused');
    expect(reloaded.tabId).toBe('tab-cli');
    expect(reloaded.tab.debugger.ctxViews[0]).toMatchObject({
      cliMode: 'opened',
      cliOpen: true,
      cliCurrentPath: 'ctx.company',
    });

    const freshTab = createMemoryUiStateRuntime(localStorage, undefined, () => 'new-tab');
    expect(freshTab.tab.debugger.ctxViews[0]).toMatchObject({
      cliMode: 'closed',
      cliOpen: false,
      cliCurrentPath: 'ctx.company',
    });
  });

  it('distinguishes default platform selection from explicit None', () => {
    expect(resolveUiPlatformIdentity()?.id).toBe('protocrm');
    expect(resolveUiPlatformIdentity(null)).toBeNull();
  });

  it('projects enabled platform choices independently of the current selection', () => {
    const state = createUiPlatformState(null);

    expect(state.current).toBeNull();
    expect(state.available.map((platform) => platform.id)).toEqual(['protocrm', 'panoptes']);
  });

  it('keeps runtime semantics canonical and resolver aliases without root mirrors', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());

    const initialRoot = state.context.root();
    const initialSystem = initialRoot.system;
    const initialCompany = initialRoot.company;
    const initialEntities = initialRoot.runtime.entities;

    expect('entities' in initialRoot).toBe(false);
    expect(state.context.get('$entities')).toBe(initialRoot.runtime.entities);
    expect('enums' in initialRoot).toBe(false);
    expect(state.context.get('$enums')).toBe(initialRoot.runtime.enums);
    expect('user' in initialRoot).toBe(false);
    expect(state.context.get('$user')).toBe(initialRoot.runtime.user);
    expect('subsystems' in initialRoot.system).toBe(false);
    expect(initialRoot.company.currentPlatform).toBe('protocrm');
    expect(initialRoot.runtime.subsystems.applications?.selected).toBe(true);

    state.selectPlatform('panoptes');

    const panoptesRoot = state.context.root();
    expect(panoptesRoot.system).toBe(initialSystem);
    expect(panoptesRoot.company).toBe(initialCompany);
    expect(panoptesRoot.company.currentPlatform).toBe('panoptes');
    expect('entities' in panoptesRoot).toBe(false);
    expect(state.context.get('$entities')).toBe(panoptesRoot.runtime.entities);
    expect('enums' in panoptesRoot).toBe(false);
    expect(state.context.get('$enums')).toBe(panoptesRoot.runtime.enums);
    expect('user' in panoptesRoot).toBe(false);
    expect(state.context.get('$user')).toBe(panoptesRoot.runtime.user);
    expect(panoptesRoot.runtime.subsystems.applications).toBeUndefined();

    state.selectPlatform(null);

    const noneRoot = state.context.root();
    expect(noneRoot.system).toBe(initialSystem);
    expect(noneRoot.company).toBe(initialCompany);
    expect(noneRoot.company.currentPlatform).toBeNull();
    expect('entities' in noneRoot).toBe(false);
    expect(state.context.get('$entities')).toBe(noneRoot.runtime.entities);
    expect('enums' in noneRoot).toBe(false);
    expect(state.context.get('$enums')).toBe(noneRoot.runtime.enums);
    expect('user' in noneRoot).toBe(false);
    expect(state.context.get('$user')).toBe(noneRoot.runtime.user);

    state.selectPlatform('protocrm');
    expect(state.context.root().runtime.entities).toBe(initialEntities);
  });

  it('drives role-sensitive navigation from runtime.user and resolves the $user alias', () => {
    const state = new ApplicationState('test', '1', createMemoryUiStateRuntime());

    const projection: UiAuthorizationContextProjection = {
      platformId: 'protocrm',
      user: { id: 'user-1', name: 'Admin', role: 'Admin' },
      platformCapabilities: { platformAccess: true },
      entities: {},
    };

    state.applyAuthorizationContext(projection);

    expect('user' in state.context.root()).toBe(false);
    expect(state.context.get('$user')).toBe(state.context.root().runtime.user);
    expect(state.context.root().runtime.user?.permissions.userRole).toBe('Admin');
    expect(state.workspaceNavigation.find((item) => item.id === 'configuration')?.children).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'system-settings' })]),
    );
  });

  it('resolves public Privacy and Terms pages through the shared static-page system', () => {
    const privacy = resolveUiPageRoute('/privacy');
    const terms = resolveUiPageRoute('/terms');

    expect(privacy?.page).toEqual({ folder: 'static', name: 'Privacy' });
    expect(privacy?.presentation.title.title).toBe('Privacy & Cookies');
    expect(privacy?.presentation.details.available).toBe(false);

    expect(terms?.page).toEqual({ folder: 'static', name: 'Terms' });
    expect(terms?.presentation.title.title).toBe('Terms of Use');
    expect(terms?.presentation.details.available).toBe(false);

    // Public documents must also resolve without authentication.
    expect(resolveUiPageRoute('/privacy/')).not.toBeNull();
    expect(resolveUiPageRoute('/terms/')).not.toBeNull();
  });
});
