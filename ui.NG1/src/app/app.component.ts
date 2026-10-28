import { NgTemplateOutlet } from '@angular/common';
import { multilingual } from '@manatos/shared-ui';
import {
  ApplicationRef,
  Injector,
  afterNextRender,
  Component,
  EnvironmentInjector,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import {
  appendContextPathMember,
  tokenizeContextPath,
  type RuntimeUserIdentity,
} from '@manatos/shared';

import {
  ApplicationState,
  UiDirtyCloseCoordinator,
  entryDirtyClosePresentation,
  dirtyEntryInUiChain,
  applyDocumentFontScale,
  BrowserApiTransport,
  ManatosApiClient,
  UiBootstrapClient,
  UiBootstrapRuntime,
  UiBusyRuntime,
  UiExpressionCapabilityClient,
  createBrowserUiStateRuntime,
  documentationPopupState,
  getUiPlatforms,
  resolveUiPlatformIdentity,
  UI_DOCUMENTATION_PAGE,
  UI_NOT_FOUND_PAGE,
  UI_NOT_FOUND_PAGE_PRESENTATION,
  createUiPageContext,
  resolveUiPageRoute,
  isUiListPageRoute,
  isUiEntryPageRoute,
  isUiProtectedPageRoute,
  uiPageTitle,
  type DocumentationLocation,
  type UiDebuggerMainView,
  type UiMenuItem,
  type UiNavigationItem,
  type UiTheme,
  type UiPublicExternalAuthProvider,
  UiBrowserAuthClient,
  UiBrowserAuthError,
  runtimeUserWithoutPlatform,
  FlowRunner,
  ApiHandler,
} from '@manatos/shared-ui';

import {
  DocumentationPopupManager,
  PageHost,
  ConfigurationPageHost,
  StoragePageHost,
  ListPageHost,
  EntryPageHost,
  EntryUIViewSelector,
  Page,
  CtxDiagnostics,
  Debugger,
  BusyOverlay,
  Footer,
  Header,
  NgUiSurfaceManager,
  SurfacesHost,
  PlatformSelector,
  Preferences,
  PrimaryNavigation,
  Shell,
  SurfaceAction,
  PopupTitleTools,
  Workspace,
  WorkspaceNavigation,
} from '@manatos/shared-ui-ng';
import { getNg1RuntimeConfig } from '../runtime-config';

type AuthNotice = Readonly<{
  severity: 'danger' | 'warning';
  message: string;
  retry: boolean;
}>;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    PageHost,
    ConfigurationPageHost,
    StoragePageHost,
    ListPageHost,
    EntryPageHost,
    EntryUIViewSelector,
    Page,
    Shell,
    Header,
    SurfacesHost,
    PlatformSelector,
    PrimaryNavigation,
    WorkspaceNavigation,
    Workspace,
    CtxDiagnostics,
    Debugger,
    BusyOverlay,
    Footer,
    Preferences,
    SurfaceAction,
    PopupTitleTools,
  ],
  providers: [NgUiSurfaceManager],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  protected readonly preferences = viewChild.required(Preferences);
  protected readonly pageHost = viewChild(PageHost);
  /** Entry hosts rendered through ngTemplateOutlet are registered explicitly. */
  private readonly mountedEntryViewHost = signal<EntryPageHost | null>(null);
  protected readonly entryViewHost = computed(() => {
    const host = this.mountedEntryViewHost();
    const route = this.entryPageRoute();
    if (!host || !route) return null;
    return host.entityKey() === route.entityKey && host.recordId() === route.recordId ? host : null;
  });
  protected registerEntryViewHost(host: EntryPageHost): void {
    const route = this.entryPageRoute();
    if (route?.entityKey === host.entityKey() && route.recordId === host.recordId())
      this.mountedEntryViewHost.set(host);
  }
  protected unregisterEntryViewHost(host: EntryPageHost): void {
    if (this.mountedEntryViewHost() === host) this.mountedEntryViewHost.set(null);
  }
  private readonly configurationHost = viewChild(ConfigurationPageHost);
  /** Per-application surface registry and presenter; concrete popup classes stay private. */
  private readonly surfaces = inject(NgUiSurfaceManager);
  protected openEntryChangeReport(report: import('@manatos/shared-ui').UiChangeReport): void {
    this.surfaces.open('semantic.changeReport', {
      params: { report },
      allowXClosure: true,
      allowBackdropClosure: true,
    });
  }

  private readonly applicationRef = inject(ApplicationRef);
  private readonly injector = inject(Injector);
  private readonly environmentInjector = inject(EnvironmentInjector);

  protected readonly openMenu = signal<
    'platform' | 'navigation' | 'language' | 'developer' | 'account' | null
  >(null);

  private readonly browserAuth = new UiBrowserAuthClient();

  private authGeneration = 0;
  private authMutationInFlight = false;
  private pendingSignIn: Promise<void> | null = null;
  private pendingLogout = false;
  private sessionCheckInFlight = false;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  protected readonly sessionStatus = signal<
    'anonymous' | 'restoring' | 'authenticated' | 'unverified' | 'signing-out'
  >('restoring');
  protected readonly photoVersion = signal(0);

  protected readonly authNotice = signal<AuthNotice | null>(null);

  /** Latched system outage. Only an explicit successful Retry can clear it. */
  protected readonly systemOutage = signal(false);
  protected readonly systemRetrying = signal(false);
  protected readonly systemRetryStatus = signal('');

  protected readonly pagePath = signal(window.location.pathname);
  private readonly entryPageCaption = signal<{ path: string; caption: string } | null>(null);
  /** An explicitly requested protected List route, never a persisted credential or page state. */
  private pendingProtectedPage: string | null = null;
  private protectedSignInInFlight = false;

  /** Global busy state for explicitly tracked foreground operations. */
  protected readonly busy = new UiBusyRuntime();

  private readonly apiClient = new ManatosApiClient(
    new BrowserApiTransport({ baseUrl: getNg1RuntimeConfig().apiBaseUrl }),
  );
  protected readonly expressionCapabilityDelegate = new UiExpressionCapabilityClient(
    this.apiClient,
  );
  private readonly bootstrapRuntime = new UiBootstrapRuntime(new UiBootstrapClient(this.apiClient));

  private readonly uiState = createBrowserUiStateRuntime();

  protected readonly state = new ApplicationState('Angular', '1', this.uiState);

  /** All Flow API requests use a shared delayed spinner through UiSurfaceManager. */
  private readonly flowApi = new ApiHandler(this.apiClient, this.browserAuth, this.surfaces);
  /** Central hardcoded Flow registry: application entry points use only flow names. */
  private readonly flows = new FlowRunner(this.state.context, this.surfaces, this.flowApi, {
    signedIn: async (user) => {
      if (this.systemOutage() || this.pendingLogout) throw new Error('Sign In is unavailable.');
      const generation = ++this.authGeneration;
      this.photoVersion.update((value) => value + 1);
      await this.acceptAuthenticatedUser(user, generation);
    },
  });

  showAlert(params: Readonly<Record<string, unknown>>): void {
    this.surfaces.open('message.alert', { params });
  }

  showError(params: Readonly<Record<string, unknown>>): void {
    this.surfaces.open('message.error', { params });
  }

  private readonly documentationPopupManager = new DocumentationPopupManager({
    mainWindow: window,
    applicationRef: this.applicationRef,
    environmentInjector: this.environmentInjector,
    windowNamePrefix: `ManatOSDocumentation_${this.state.uiState.tabId}`,
    state: this.state,
    attachRequested: (location) => this.attachDocumentation(location),
  });

  protected readonly bootstrap = signal(this.bootstrapRuntime.snapshot());

  /** API connectivity presentation comes from the existing bootstrap heartbeat. */
  protected readonly apiHeaderStatus = computed<'checking' | 'retrying' | 'online' | 'offline'>(
    () => {
      const health = this.bootstrap();
      // Once unavailable, the status remains red through explicit Retry.
      // A transient connection check must not restart the visible countdown.
      if (this.systemOutage() || health.unavailable) return 'offline';
      if (this.systemRetrying()) return 'checking';
      if (health.consecutiveFailures > 0) return 'retrying';
      if (!health.ready) return 'checking';
      return health.serverAlive ? 'online' : 'checking';
    },
  );

  private readonly platformRevision = signal(0);
  private readonly runtimeRevision = signal(0);
  private readonly navigationRevision = signal(0);
  private readonly preferencesRevision = signal(0);
  private readonly languageRevision = signal(0);
  private readonly uiStateRevision = signal(0);

  protected readonly platforms = computed(() => {
    this.languageRevision();
    return getUiPlatforms(this.state.currentLanguageId.toUpperCase() as 'EN' | 'EL');
  });

  // Read the canonical authenticated-user projection from ApplicationState.
  // The revision signal makes the Angular view react to runtime changes.
  protected readonly signedIn = computed(() => {
    this.runtimeRevision();
    return (
      this.sessionStatus() === 'authenticated' && this.state.context.root().runtime.user !== null
    );
  });

  protected readonly accountIdentity = computed(() => {
    this.runtimeRevision();
    return this.currentIdentity();
  });

  /**
   * Local authentication through the NG1 Node host.
   * API credentials never pass into Angular.
   */
  /** Full-page OAuth redirect; cookies and provider tokens stay on the Node host. */
  protected startExternalSignIn(provider: string): void {
    if (this.systemOutage() || this.pendingLogout || this.signedIn()) return;
    if (!['google', 'microsoft', 'github', 'facebook'].includes(provider)) return;
    window.location.assign('/auth/oauth/' + encodeURIComponent(provider) + '/start');
  }

  protected readonly signIn = async (identity: string, password: string): Promise<void> => {
    if (this.systemOutage() || this.authMutationInFlight || this.pendingLogout) return;
    this.authMutationInFlight = true;
    const generation = ++this.authGeneration;

    const operation = (async () => {
      const user = await this.browserAuth.signIn(identity, password);
      if (generation !== this.authGeneration) return;
      this.photoVersion.update((version) => version + 1);
      await this.acceptAuthenticatedUser(user, generation);
    })();
    this.pendingSignIn = operation;
    try {
      await operation;
    } finally {
      if (this.pendingSignIn === operation) this.pendingSignIn = null;
      this.authMutationInFlight = false;
    }
  };

  /** Restore an existing browser session without automatically opening a popup. */
  private async restoreSession(): Promise<void> {
    if (this.systemOutage()) return;
    if (this.pendingLogout) {
      await this.signOut();
      return;
    }
    if (this.authMutationInFlight || this.sessionCheckInFlight) return;

    this.sessionCheckInFlight = true;
    const generation = ++this.authGeneration;
    this.sessionStatus.set('restoring');
    // While checking an existing session, hide privileged UI but preserve
    // user preferences and CTX until the host confirms or rejects the session.

    try {
      const session = await this.browserAuth.session();

      if (generation !== this.authGeneration) return;

      if (session.status === 'anonymous') {
        this.state.setRuntimeUser(null);
        this.sessionStatus.set('anonymous');
        this.authNotice.set(null);
        this.stopRecovery();
      } else {
        this.photoVersion.update((version) => version + 1);
        await this.acceptAuthenticatedUser(session.user, generation);
      }
    } catch (error) {
      if (generation === this.authGeneration) {
        this.state.setRuntimeUser(null);
        this.sessionStatus.set('unverified');
        this.authNotice.set(this.sessionFailureNotice(error));
        this.startRecovery();
      }
    } finally {
      this.sessionCheckInFlight = false;
    }
    this.settleProtectedPageRequest();
  }

  private sessionFailureNotice(error: unknown): AuthNotice {
    if (error instanceof UiBrowserAuthError && error.code === 'UI_HOST_UNAVAILABLE') {
      return {
        severity: 'warning',
        message: 'The UI session service is unavailable. Reconnecting…',
        retry: true,
      };
    }
    if (error instanceof UiBrowserAuthError && error.code === 'API_UNAVAILABLE') {
      return {
        severity: 'warning',
        message: 'The API authentication service is unavailable. Reconnecting…',
        retry: true,
      };
    }
    if (error instanceof UiBrowserAuthError && error.status >= 500) {
      return {
        severity: 'warning',
        message: 'Session verification is temporarily unavailable. Reconnecting…',
        retry: true,
      };
    }
    return {
      severity: 'danger',
      message: 'Session verification failed unexpectedly. Retry to continue.',
      retry: true,
    };
  }

  protected retryAuthentication(): void {
    if (this.pendingLogout) void this.signOut();
    else void this.restoreSession();
  }

  protected dismissAuthNotice(): void {
    this.authNotice.set(null);
  }

  private startRecovery(): void {
    if (this.systemOutage() || this.recoveryTimer) return;
    this.recoveryTimer = setInterval(() => this.retryAuthentication(), 10000);
  }

  private stopRecovery(): void {
    if (!this.recoveryTimer) return;
    clearInterval(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  /** Establish identity first, then hydrate effective API permissions. */
  private async acceptAuthenticatedUser(
    user: RuntimeUserIdentity,
    generation: number,
  ): Promise<void> {
    this.state.setRuntimeUser(runtimeUserWithoutPlatform(user, this.state.currentPlatformId));
    this.sessionStatus.set('authenticated');
    this.authNotice.set(null);
    this.stopRecovery();

    await this.refreshAuthorization(user, generation);
  }

  /**
   * Refresh platform permissions without retaining permissions from
   * a previously selected platform or an earlier asynchronous request.
   */
  private async refreshAuthorization(user: RuntimeUserIdentity, generation: number): Promise<void> {
    const platformId = this.state.currentPlatformId;

    // Identity remains authenticated when the platform selector is None.
    if (platformId === null) return;

    try {
      const projection = await this.browserAuth.authorization(platformId);

      if (generation === this.authGeneration && this.state.currentPlatformId === platformId) {
        if (projection.user.id !== user.id) {
          throw new Error('Session identity mismatch.');
        }

        this.state.applyAuthorizationContext(projection);
        this.authNotice.set(null);
        this.stopRecovery();
      }
    } catch (error) {
      if (generation !== this.authGeneration) return;

      if (error instanceof UiBrowserAuthError && error.status === 401) {
        this.state.setRuntimeUser(null);
        this.sessionStatus.set('anonymous');
        this.authNotice.set({
          severity: 'warning',
          message: 'Your session has expired. Please sign in again.',
          retry: false,
        });
      } else {
        // The selected platform retains only an explicit deny projection.
        this.authNotice.set({
          severity: 'warning',
          message: 'Platform permissions are temporarily unavailable.',
          retry: true,
        });
        this.startRecovery();
      }
    }
  }

  /** Identity is always read from the canonical ApplicationState CTX. */
  private currentIdentity(): RuntimeUserIdentity | null {
    const user = this.state.context.root().runtime.user;

    const id = user?.fields['id']?.value;
    const name = user?.fields['name']?.value;
    const role = user?.fields['role']?.value;

    return typeof id === 'string' && typeof name === 'string' && typeof role === 'string'
      ? { id, name, role }
      : null;
  }

  /** A platform change must invalidate previous platform grants immediately. */
  private refreshSelectedPlatformAuthorization(): void {
    const user = this.currentIdentity();
    if (!user) return;

    const generation = ++this.authGeneration;

    this.state.setRuntimeUser(runtimeUserWithoutPlatform(user, this.state.currentPlatformId));

    void this.refreshAuthorization(user, generation);
  }

  /** Sign Out is a host operation, never a Header or popup operation. */
  protected async signOut(approved = false): Promise<void> {
    this.closeMenus();
    if (this.sessionStatus() === 'signing-out') return;
    if (!approved && this.entryHasUnsavedChanges()) {
      this.dirtyClose.requestExit(
        () => this.entryHasUnsavedChanges(),
        () => {
          void this.signOut(true);
        },
        this.surfaces,
        this.dirtyEntryPresentation(),
      );
      return;
    }
    this.pendingLogout = true;
    ++this.authGeneration;
    this.sessionStatus.set('signing-out');
    // Revoke the browser's authority immediately, even if the host is down.
    this.state.setRuntimeUser(null);
    this.navigateUiPage('/', true, true);
    this.authNotice.set({ severity: 'warning', message: 'Signing out…', retry: false });

    try {
      // A concurrent Sign In must finish issuing its cookie BEFORE logout.
      // Its generation has already been invalidated; it cannot restore CTX.
      if (this.pendingSignIn) {
        try {
          await this.pendingSignIn;
        } catch {
          /* Still close the session. */
        }
      }
      await this.browserAuth.signOut();
      this.pendingLogout = false;
      this.sessionStatus.set('anonymous');
      this.authNotice.set(null);
      this.stopRecovery();
      this.navigateUiPage('/');
    } catch {
      // An interrupted response may still have revoked the server session.
      try {
        const session = await this.browserAuth.session();
        if (session.status === 'anonymous') {
          this.pendingLogout = false;
          this.sessionStatus.set('anonymous');
          this.authNotice.set(null);
          this.stopRecovery();
          this.navigateUiPage('/');
          return;
        }
      } catch {
        /* Cannot establish local revocation while the host is down. */
      }
      this.sessionStatus.set('unverified');
      this.authNotice.set({
        severity: 'danger',
        message:
          'Sign Out could not be confirmed. The local session is blocked; retry to finish signing out.',
        retry: true,
      });
      this.startRecovery();
    }
  }

  /**
   * One debugger eligibility rule for both the main menu
   * and functional popup title buttons.
   *
   * Equivalent CTX expression:
   * $system.runtime.developerMode ||
   * $user?.permissions.userRole == "Admin"
   */
  protected readonly debuggerAllowed = computed(() => {
    this.runtimeRevision();
    // Previously authenticated UI cannot expose its debugger while the
    // session is being revalidated or logout is unresolved.
    if (
      this.sessionStatus() === 'restoring' ||
      this.sessionStatus() === 'unverified' ||
      this.sessionStatus() === 'signing-out'
    )
      return false;

    const root = this.state.context.root();

    return (
      root.system.runtime.developerMode === true ||
      root.runtime.user?.permissions.userRole === 'Admin'
    );
  });

  /**
   * Temporary provider loader for Register only, pending RegisterFlow.
   * SignInFlow loads its own providers through ApiHandler on shown.
   * Embedded ExternalProviders never makes HTTP requests.
   */
  protected readonly loadExternalProviders = async (): Promise<
    readonly UiPublicExternalAuthProvider[]
  > => {
    if (this.systemOutage()) return [];
    const response = await this.apiClient.get<{
      providers: UiPublicExternalAuthProvider[];
    }>('/api/v1/public/external-auth-providers');

    // Public provider catalogue is authoritative for configured/disabled
    // status; UI-host readiness is a separate, required security boundary.
    const availability = await this.browserAuth.externalAvailability().catch(() => ({
      enabled: false,
    }));
    return response.data.providers.map((provider) => ({
      ...provider,
      hostAvailable: availability.enabled,
    }));
  };

  protected readonly pageRoute = computed(() => {
    this.languageRevision();
    const route = resolveUiPageRoute(
      this.pagePath(),
      this.state.company,
      this.state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
    );
    // Never instantiate a privileged surface before the trusted host confirms the session.
    return isUiProtectedPageRoute(route) && !this.signedIn()
      ? resolveUiPageRoute('/', this.state.company)
      : route;
  });
  protected readonly currentPage = computed(() => this.pageRoute()?.page ?? UI_NOT_FOUND_PAGE);
  protected readonly systemSettingsPageActive = computed(
    () => this.pageRoute()?.path === '/system-settings',
  );
  protected readonly configurationPageActive = computed(
    () => this.pageRoute()?.path === '/configuration',
  );
  protected readonly configurationReadOnly = computed(() => {
    this.runtimeRevision();
    return this.currentIdentity()?.role !== 'Admin';
  });
  protected readonly listPageEntityKey = computed(() => {
    const route = this.pageRoute();
    return isUiListPageRoute(route) ? route.entityKey : null;
  });
  /** The actual mounted List parent of a List→Entry route, never a breadcrumb-derived fiction. */
  private readonly retainedListEntity = signal<string | null>(null);
  protected readonly entityPopupPermissions = (
    entityKey: string,
  ): Readonly<Record<string, boolean>> => this.state.entityCapabilitiesFor(entityKey);
  protected readonly displayedListEntityKey = computed(() => {
    const list = this.listPageEntityKey();
    if (list) return list;
    const entry = this.entryPageRoute();
    return entry && entry.entityKey === this.retainedListEntity()
      ? this.retainedListEntity()
      : null;
  });
  protected readonly entryParentLevelPath = computed(() =>
    this.entryPageRoute()?.entityKey === this.retainedListEntity() && this.retainedListEntity()
      ? 'ctx.ui.level'
      : null,
  );
  private reconcileListEntryNavigation(path: string): void {
    const destination = resolveUiPageRoute(path, this.state.company);
    const previous = this.pageRoute();
    const candidate = isUiListPageRoute(previous) ? previous.entityKey : this.retainedListEntity();
    if (
      candidate &&
      ((isUiEntryPageRoute(destination) && destination.entityKey === candidate) ||
        (isUiListPageRoute(destination) && destination.entityKey === candidate))
    )
      this.retainedListEntity.set(candidate);
    else this.retainedListEntity.set(null);
  }
  protected readonly entryPageRoute = computed(() => {
    const route = this.pageRoute();
    return isUiEntryPageRoute(route) ? route : null;
  });
  protected readonly pageContext = computed(() => {
    const route = this.pageRoute();

    const context = route
      ? createUiPageContext(
          route,
          this.state.company,
          this.state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
        )
      : { company: this.state.company, requestPath: this.pagePath() };

    return Object.freeze({
      ...context,
      auth: { anonymous: this.sessionStatus() === 'anonymous' && !this.systemOutage() },
    });
  });
  protected readonly pagePresentation = computed(() => {
    const route = this.pageRoute();
    const base = route?.presentation ?? UI_NOT_FOUND_PAGE_PRESENTATION;
    if (!route || !isUiEntryPageRoute(route)) return base;
    const loaded = this.entryPageCaption();
    const caption = loaded?.path === route.path ? loaded.caption : '';
    const prefix =
      (this.state.currentLanguageId.toUpperCase() === 'EL' ? 'Επεξεργασία' : 'Edit') +
      ' ' +
      route.title;
    return {
      ...base,
      title: { ...base.title, title: caption || prefix },
      breadcrumb: [...base.breadcrumb, { label: prefix, href: null }],
    };
  });
  protected rememberEntryCaption(route: { path: string }, caption: string): void {
    if (route.path !== this.pageRoute()?.path) return;
    const previous = this.entryPageCaption();
    if (previous?.path !== route.path || previous.caption !== caption)
      this.entryPageCaption.set({ path: route.path, caption });
  }

  protected readonly documentationPageActive = computed(() => {
    const page = this.pageRoute()?.page;
    return (
      page?.folder === UI_DOCUMENTATION_PAGE.folder && page.name === UI_DOCUMENTATION_PAGE.name
    );
  });

  protected readonly currentPlatform = computed(() => {
    this.platformRevision();
    this.languageRevision();

    const platformId = this.state.currentPlatformId;

    return platformId === null
      ? null
      : resolveUiPlatformIdentity(
          platformId,
          this.state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
        );
  });

  protected readonly platformNavigation = computed(() => {
    this.navigationRevision();
    return this.sessionStatus() === 'restoring' || this.sessionStatus() === 'unverified'
      ? null
      : this.state.platformNavigation;
  });

  protected readonly primaryNavigation = computed(() => {
    this.navigationRevision();
    return this.sessionStatus() === 'restoring' || this.sessionStatus() === 'unverified'
      ? []
      : this.state.primaryNavigation;
  });

  protected readonly workspaceNavigation = computed(() => {
    this.navigationRevision();
    return this.sessionStatus() === 'restoring' || this.sessionStatus() === 'unverified'
      ? []
      : this.state.workspaceNavigation;
  });

  protected readonly multilingual = computed(() =>
    multilingual(this.currentLanguage().id === 'el' ? 'EL' : 'EN', [
      'Retry',
      'DismissNotification',
      'Account',
      'ManatOsSystemUnavailable',
      'ManatOsUnresponsive',
      'Ng1PollingStopped',
    ] as const),
  );

  protected readonly currentLanguage = computed(() => {
    this.languageRevision();
    return this.state.currentLanguage;
  });

  protected readonly preferencesTheme = computed(() => {
    this.preferencesRevision();
    return this.state.preferences.theme;
  });

  protected readonly fontScalePercent = computed(() => {
    this.preferencesRevision();
    return this.state.preferences.fontScalePercent;
  });

  protected readonly workspaceNavigationCollapsed = computed(() => {
    this.uiStateRevision();
    return this.state.workspaceNavigationCollapsed;
  });

  protected readonly debuggerRevealPath = signal<string | null>(null);
  protected readonly debuggerRevealToken = signal(0);

  /**
   * Transient stacking permission for the existing debugger while
   * a functional popup is open. Never persisted to preferences.
   */
  protected readonly popupDebuggerForeground = signal(false);
  protected readonly debuggerDetached = signal(false);

  protected resetPopupDebuggerLayer(): void {
    this.popupDebuggerForeground.set(false);
  }

  protected readonly debuggerVisible = computed(() => {
    this.uiStateRevision();
    return this.state.debuggerVisible;
  });

  protected readonly debuggerActiveView = computed(() => {
    this.uiStateRevision();
    return this.state.debuggerActiveView;
  });

  protected readonly developerToolsWidth = computed(() => {
    this.uiStateRevision();
    return this.state.developerToolsWidth;
  });

  protected readonly developerMenu = computed<readonly UiMenuItem[]>(() => {
    this.uiStateRevision();
    return this.state.debugMenu;
  });

  private readonly unsubscribeBootstrap = this.bootstrapRuntime.subscribe((state) => {
    const wasDisconnected = this.bootstrap().consecutiveFailures > 0;
    this.bootstrap.set(state);

    if (state.unavailable && !this.systemOutage()) {
      this.enterSystemOutage();
    } else if (!this.systemOutage() && state.consecutiveFailures > 0) {
      // Fail closed even during the first two API transport failures.
      if (this.sessionStatus() === 'authenticated') this.sessionStatus.set('unverified');
    } else if (
      !this.systemOutage() &&
      wasDisconnected &&
      state.serverAlive &&
      this.sessionStatus() === 'unverified'
    ) {
      // Never re-expose earlier grants merely because /health works again.
      void this.restoreSession();
    }
  });

  /**
   * An API outage invalidates the browser's *verified* authorization, not its
   * persisted preferences. No migrated NG1 entity editor owns dirty edits yet:
   * do not claim to have captured EJS0's IndexedDB recovery package here.
   */
  private enterSystemOutage(): void {
    this.systemOutage.set(true);
    ++this.authGeneration;
    this.stopRecovery();
    this.closeMenus();
    this.sessionStatus.set('unverified');
    this.state.setRuntimeUser(null);
    this.authNotice.set(null);
    this.systemRetryStatus.set('');
    document.title =
      this.currentLanguage().id === 'el'
        ? 'Το σύστημα δεν είναι διαθέσιμο - ManatOS'
        : 'System unavailable - ManatOS';
  }

  /** EJS0-style explicit recovery: verify API, end the ambiguous session, sign in afresh. */
  protected async retrySystemOutage(): Promise<void> {
    if (!this.systemOutage() || this.systemRetrying()) return;
    this.systemRetrying.set(true);
    this.systemRetryStatus.set('Checking connectivity…');

    try {
      if (!(await this.bootstrapRuntime.retry())) {
        this.systemRetryStatus.set('ManatOS is still unavailable.');
        return;
      }

      this.systemRetryStatus.set('Connected. Closing the previous session…');
      // As in EJS0, a recovered connection must not revive the identity that
      // existed before the outage. UI-host logout revokes its session first.
      if (this.pendingSignIn) {
        try {
          await this.pendingSignIn;
        } catch {
          // The login attempt was already invalidated by authGeneration.
        }
      }
      await this.browserAuth.signOut();
      this.state.setRuntimeUser(null);
      this.pendingLogout = false;
      this.sessionStatus.set('anonymous');
      this.authNotice.set(null);
      this.systemOutage.set(false);
      this.navigateUiPage('/');
      this.openSignIn();
    } catch {
      this.systemRetryStatus.set('Could not close the previous session. Retry when connected.');
    } finally {
      this.systemRetrying.set(false);
    }
  }

  private readonly unsubscribeState = this.state.subscribe((change) => {
    switch (change) {
      case 'platform':
        this.platformRevision.update((value) => value + 1);
        this.refreshSelectedPlatformAuthorization();
        break;

      case 'runtime':
        this.runtimeRevision.update((value) => value + 1);
        break;

      case 'navigation':
        this.navigationRevision.update((value) => value + 1);
        break;

      case 'preferences':
        this.preferencesRevision.update((value) => value + 1);
        this.applyTheme(this.state.preferences.theme);
        applyDocumentFontScale(document, this.state.preferences.fontScalePercent);
        break;

      case 'language':
        this.languageRevision.update((value) => value + 1);
        break;

      case 'uiState':
        this.uiStateRevision.update((value) => value + 1);
        break;
    }
  });

  ngOnInit(): void {
    // EJS0-equivalent host redirect: /?auth=signin&next=<local entity route>.
    const query = new URLSearchParams(window.location.search);
    const requested = query.get('auth') === 'signin' ? query.get('next') : null;
    if (requested) {
      try {
        const destination = new URL(requested, window.location.origin);
        if (
          destination.origin === window.location.origin &&
          isUiProtectedPageRoute(resolveUiPageRoute(destination.pathname, this.state.company))
        ) {
          this.pendingProtectedPage = destination.pathname + destination.search + destination.hash;
        }
      } catch {
        // Invalid redirect target is ignored; never navigate to an external origin.
      }
      query.delete('auth');
      query.delete('next');
      const rest = query.toString();
      window.history.replaceState(window.history.state, '', '/' + (rest ? `?${rest}` : ''));
      this.pagePath.set('/');
    }
    // A direct /bo/... request is an explicit protected navigation attempt.
    // Keep the target, but display only Home while the cookie is being verified.
    if (isUiProtectedPageRoute(resolveUiPageRoute(window.location.pathname, this.state.company))) {
      this.pendingProtectedPage =
        window.location.pathname + window.location.search + window.location.hash;
    }
    if (window.location.pathname === '/auth/password/reset') {
      const token = new URLSearchParams(window.location.search).get('token') ?? '';
      // Do not leave the one-time recovery credential in browser history.
      window.history.replaceState(window.history.state, '', '/');
      this.pagePath.set('/');
      afterNextRender(
        () => {
          void this.flows.run('auth.resetPassword', { token }).catch((error: unknown) => {
            console.warn('Password reset Flow could not start', error);
          });
        },
        { injector: this.injector },
      );
    }
    this.applyPageTitle();
    this.applyTheme(this.state.preferences.theme);
    applyDocumentFontScale(document, this.state.preferences.fontScalePercent);
    void this.bootstrapRuntime.start();
    const oauthResult = new URLSearchParams(window.location.search).get('externalAuth');
    if (oauthResult) {
      // Remove one-time result from the URL without another navigation.
      const url = new URL(window.location.href);
      url.searchParams.delete('externalAuth');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      const messages: Readonly<Record<string, string>> = {
        unlinked:
          'This external account is not linked to a ManatOS account. Complete registration or explicit account linking first.',
        cancelled: 'External Sign In was cancelled.',
        expired: 'External Sign In expired or the browser session changed. Please try again.',
        failed: 'External Sign In could not be completed.',
        unavailable: 'The external authentication service is temporarily unavailable.',
        'not-configured': 'This external provider is not configured for NG1.',
        'already-signed-in': 'Sign out before using another external account.',
        limited: 'Too many external Sign In attempts. Please try again later.',
        unsupported: 'This external provider is not supported.',
      };
      if (messages[oauthResult]) {
        // Session restoration runs first; it otherwise clears the callback notice.
        void this.restoreSession().finally(() => {
          if (this.sessionStatus() === 'authenticated') return;
          this.authNotice.set({
            severity: oauthResult === 'failed' || oauthResult === 'expired' ? 'danger' : 'warning',
            message: messages[oauthResult],
            retry: false,
          });
        });
      } else {
        void this.restoreSession();
      }
    } else {
      void this.restoreSession();
    }
  }

  ngOnDestroy(): void {
    ++this.authGeneration;
    this.stopRecovery();
    this.documentationPopupManager.destroy();
    this.surfaces.detach();
    this.unsubscribeState();
    this.unsubscribeBootstrap();
    this.bootstrapRuntime.stop();
    this.state.destroy();
  }

  protected toggleMenu(
    menu: 'platform' | 'navigation' | 'language' | 'developer' | 'account',
  ): void {
    if (menu === 'developer' && !this.debuggerAllowed()) return;

    this.openMenu.update((current) => (current === menu ? null : menu));
    if (this.openMenu() !== null)
      window.dispatchEvent(new CustomEvent('manatos:navigation-menu-open'));
  }

  @HostListener('window:manatos:transient-menu-open')
  protected closeNavigationOnTransientMenu(): void {
    this.closeMenus();
  }

  protected closeMenus(): void {
    this.openMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  protected closeMenusOnEscape(): void {
    this.closeMenus();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && !event.defaultPrevented) {
      const authFlow =
        target.closest<HTMLElement>('[data-home-auth-flow]')?.dataset['homeAuthFlow'];
      if (authFlow === 'auth.signin' || authFlow === 'auth.register') {
        event.preventDefault();
        if (authFlow === 'auth.signin') this.openSignIn();
        else this.openRegister();
        return;
      }
    }

    if (!event.defaultPrevented) {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');

      if (anchor?.matches('.brand[href="/"]')) return; // Normal browser reload, even during outage.

      if (anchor && !anchor.target && anchor.origin === window.location.origin) {
        const url = new URL(anchor.href);

        if (resolveUiPageRoute(url.pathname, this.state.company)) {
          event.preventDefault();

          this.navigateUiPage(`${url.pathname}${url.search}${url.hash}`);

          return;
        }
      }
    }

    this.closeMenus();
  }

  @HostListener('window:popstate')
  protected handlePopState(): void {
    const targetIndex = window.history.state?.__manatosUiIndex;
    if (this.undoingHistoryMove) {
      this.undoingHistoryMove = false;
      return;
    }
    if (this.acceptingHistoryMove) {
      this.acceptingHistoryMove = false;
      if (typeof targetIndex === 'number') this.uiHistoryIndex = targetIndex;
    } else if (this.entryHasUnsavedChanges()) {
      const destination = window.location.pathname + window.location.search + window.location.hash;
      const delta = typeof targetIndex === 'number' ? this.uiHistoryIndex - targetIndex : 0;
      if (delta) {
        // Restore the actual history cursor, leaving the destination entry intact.
        this.undoingHistoryMove = true;
        window.history.go(delta);
        this.dirtyClose.requestExit(
          () => this.entryHasUnsavedChanges(),
          () => {
            this.acceptingHistoryMove = true;
            window.history.go(-delta);
          },
          this.surfaces,
          this.dirtyEntryPresentation(),
        );
      } else {
        // An older/external history entry lacks our index: keep the Surface,
        // but do not claim to have preserved its unreachable history position.
        window.history.replaceState(
          { ...(window.history.state ?? {}), __manatosUiIndex: this.uiHistoryIndex },
          '',
          this.pagePath(),
        );
        this.dirtyClose.requestExit(
          () => this.entryHasUnsavedChanges(),
          () => this.navigateUiPage(destination, false, true),
          this.surfaces,
          this.dirtyEntryPresentation(),
        );
      }
      return;
    } else if (typeof targetIndex === 'number') {
      this.uiHistoryIndex = targetIndex;
    }
    if (this.pagePath() === window.location.pathname) return;
    this.reconcileListEntryNavigation(window.location.pathname);
    this.pagePath.set(window.location.pathname);
    if (isUiProtectedPageRoute(resolveUiPageRoute(window.location.pathname, this.state.company))) {
      this.navigateUiPage(
        window.location.pathname + window.location.search + window.location.hash,
        true,
      );
      return;
    }
    this.applyPageTitle();
  }

  /**
   * Header and recovery entry point.
   * Sign In orchestration belongs to shared.UI's Flow.
   */
  protected openSignIn(): void {
    if (this.systemOutage() || this.pendingLogout) return;

    this.closeMenus();
    void this.flows.run('auth.signin');
  }

  /**
   * Opens the shared registration popup at its method-selection tab.
   * Both registration steps belong to the same popup instance.
   */
  protected openRegister(): void {
    if (this.systemOutage()) return;
    this.closeMenus();
    void this.flows.run('auth.register');
  }

  protected openChangePassword(): void {
    if (this.systemOutage() || this.pendingLogout || !this.signedIn()) return;
    this.closeMenus();
    void this.flows.run('auth.changePassword');
  }

  protected openPreferences(): void {
    this.preferences().open();
  }

  protected savePreferences(theme: UiTheme): void {
    this.state.savePreferences(theme);
  }

  protected selectPlatform(platformId: string | null): void {
    this.closeMenus();
    this.state.selectPlatform(platformId);
  }

  protected setFontScalePercent(fontScalePercent: number): void {
    this.state.setFontScalePercent(fontScalePercent);
  }

  protected selectLanguage(language: string): void {
    this.closeMenus();
    this.state.selectLanguage(language);
  }

  protected selectNavigation(item: UiNavigationItem): void {
    if (this.systemOutage()) return;
    this.closeMenus();

    if (item.action === 'open-preferences') {
      this.openPreferences();
      return;
    }

    // The metadata URL is the EJS0 host's route. This is a semantic command
    // in NG1, and must never be sent to the Angular page router.
    if (item.id === 'logout' || item.url === '/auth/logout') {
      void this.signOut();
      return;
    }

    if (item.url) {
      const url = new URL(item.url, window.location.origin);

      if (resolveUiPageRoute(url.pathname, this.state.company)) {
        this.navigateUiPage(item.url);

        return;
      }

      if (this.entryHasUnsavedChanges()) {
        this.dirtyClose.requestExit(
          () => this.entryHasUnsavedChanges(),
          () => this.navigateHostRoute(item.url!),
          this.surfaces,
          this.dirtyEntryPresentation(),
        );
      } else {
        this.navigateHostRoute(item.url);
      }
    }
  }

  protected openDocumentation(): void {
    this.navigateUiPage('/documentation');
  }

  protected openDocumentationPopup(): void {
    const location =
      this.pageHost()?.getDocumentationLocation() ?? this.currentDocumentationLocation();
    this.documentationPopupManager.open(documentationPopupState(location, this.fontScalePercent()));
  }

  protected selectDeveloperItem(item: UiMenuItem): void {
    if (!this.debuggerAllowed()) return;
    this.closeMenus();

    if (item.id === 'debug-tools') {
      this.state.setDebuggerVisible(!this.state.debuggerVisible);
      return;
    }

    if (item.id === 'debug-diagnostics') {
      this.state.setDebugDiagnosticsVisible(!this.state.debugDiagnosticsVisible);
    }
  }

  protected setWorkspaceNavigationCollapsed(collapsed: boolean): void {
    this.state.setWorkspaceNavigationCollapsed(collapsed);
  }

  /**
   * Reveal a functional popup's CTX level in the EXISTING
   * main CTX Viewer.
   *
   * No new CTX tab, window or debugger is created.
   */
  /** Flow icon always selects the opening step, even if the debugger was foregrounded. */
  protected revealPopupFlowStep(stepPath: string): void {
    if (!this.debuggerAllowed() || this.state.context.get(stepPath) === undefined) return;
    this.popupDebuggerForeground.set(false);
    this.revealPopupContext(stepPath);
  }

  /** Page/Popup CTX navigation shares the same viewer operations.
   * Only Popup can toggle window foreground/background. */
  /** Inspect the actual active page owner, not its retained List ancestor. */
  private readonly activePageLevelPath = computed(() =>
    this.entryParentLevelPath() && this.entryPageRoute()
      ? `${this.entryParentLevelPath()}.level`
      : 'ctx.ui.level',
  );
  protected readonly pageFlowStepPath = computed(() => {
    const path = `${this.activePageLevelPath()}.flow`;
    const flow = this.state.context.get(path);
    return flow && typeof flow === 'object' ? path : null;
  });

  protected revealPageContext(): void {
    this.revealSurfaceContext(this.activePageLevelPath(), false);
  }
  protected revealPageFlowStep(stepPath: string): void {
    if (this.state.context.get(stepPath) !== undefined) this.revealSurfaceContext(stepPath, false);
  }

  protected revealPopupContext(path: string): void {
    this.revealSurfaceContext(path, true);
  }

  private revealSurfaceContext(path: string, popupWindow: boolean): void {
    if (!this.debuggerAllowed()) return;

    // The second click sends the debugger behind the popup.
    // Preserve its visibility, selected tab and selected CTX node.
    if (popupWindow && this.popupDebuggerForeground()) {
      this.popupDebuggerForeground.set(false);
      return;
    }

    if (this.state.context.get(path) === undefined) return;

    const view = this.state.debuggerState.ctxView('ctx');

    // Preserve existing expanded nodes while opening every ancestor
    // leading to the requested popup #level.
    const ancestors: string[] = ['ctx'];
    let current = 'ctx';

    for (const member of tokenizeContextPath(path)) {
      current = appendContextPathMember(current, member);
      ancestors.push(current);
    }

    this.state.debuggerState.updateCtxView('ctx', {
      selectedPath: path,
      expandedPaths: [...new Set([...view.expandedPaths, ...ancestors])],
    });

    // Always select the main viewer. Never use openCtxView(path).
    this.state.selectDebuggerView('ctx');
    this.state.setDebuggerVisible(true);
    if (popupWindow) this.popupDebuggerForeground.set(true);

    // A new token forces reveal even when the same popup is
    // requested repeatedly.
    this.debuggerRevealPath.set(path);
    this.debuggerRevealToken.update((value) => value + 1);
  }

  /** Field Tools requests enter through this privileged app boundary, not CTX mutation. */
  @HostListener('window:manatos:entry-inspect-ctx', ['$event'])
  protected inspectEntryField(event: Event): void {
    if (!this.debuggerAllowed() || !(event instanceof CustomEvent)) return;
    const path = (event.detail as { path?: unknown } | null)?.path;
    if (
      typeof path !== 'string' ||
      !/^ctx\.ui(?:\.level)+\.(?:state\.fields|data\.current)(?:\.|\[)/.test(path)
    )
      return;
    this.revealSurfaceContext(path, false);
  }

  protected setDebuggerVisible(visible: boolean): void {
    if (visible && !this.debuggerAllowed()) return;

    this.state.setDebuggerVisible(visible);

    if (!visible) this.popupDebuggerForeground.set(false);
  }

  protected selectDebuggerView(view: UiDebuggerMainView): void {
    this.state.selectDebuggerView(view);
  }

  protected saveDeveloperToolsWidth(width: number | null): void {
    this.state.saveDeveloperToolsWidth(width);
  }

  /** Only a confirmed session may enter an entity-backed List surface. */
  private readonly dirtyClose = new UiDirtyCloseCoordinator();
  private uiHistoryIndex = this.initializeUiHistory();
  private undoingHistoryMove = false;
  private acceptingHistoryMove = false;

  private initializeUiHistory(): number {
    const current = window.history.state;
    const index = typeof current?.__manatosUiIndex === 'number' ? current.__manatosUiIndex : 0;
    window.history.replaceState({ ...(current ?? {}), __manatosUiIndex: index }, '');
    return index;
  }

  private commitUiHistory(url: string, replace: boolean): void {
    if (!replace) this.uiHistoryIndex++;
    const value = { ...(window.history.state ?? {}), __manatosUiIndex: this.uiHistoryIndex };
    if (replace) window.history.replaceState(value, '', url);
    else window.history.pushState(value, '', url);
  }

  private entryHasUnsavedChanges(): boolean {
    return (
      dirtyEntryInUiChain(this.state.context) !== null ||
      this.configurationHost()?.hasUnsavedChanges() === true
    );
  }

  private dirtyEntryPresentation() {
    const level = dirtyEntryInUiChain(this.state.context);
    const language = this.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN';
    return level
      ? entryDirtyClosePresentation(level, language)
      : { ownerLabel: language === 'EL' ? 'Ρυθμίσεις' : 'Configuration' };
  }

  /** Complete a follow-up Entry without rebuilding its still-mounted List ancestor. */
  protected closeEntryPage(): void {
    const entry = this.entryPageRoute();
    if (!entry) return;
    this.navigateUiPage(`/bo/${encodeURIComponent(entry.entityKey)}`, true);
  }

  private approvedHostUnload = false;
  /** Deliberate in-app host navigation has already passed the semantic dirty-close decision. */
  private navigateHostRoute(url: string): void {
    this.approvedHostUnload = true;
    window.location.assign(url);
  }

  @HostListener('window:beforeunload', ['$event'])
  protected protectUnsavedEntryOnUnload(event: BeforeUnloadEvent): void {
    if (this.approvedHostUnload || !this.entryHasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  private navigateUiPage(url: string, replace = false, approved = false): void {
    const destination = new URL(url, window.location.origin);
    if (!approved && destination.pathname !== this.pagePath() && this.entryHasUnsavedChanges()) {
      this.dirtyClose.requestExit(
        () => this.entryHasUnsavedChanges(),
        () => this.navigateUiPage(url, replace, true),
        this.surfaces,
        this.dirtyEntryPresentation(),
      );
      return;
    }
    const target = new URL(url, window.location.origin);
    if (
      isUiProtectedPageRoute(resolveUiPageRoute(target.pathname, this.state.company)) &&
      !this.signedIn()
    ) {
      this.pendingProtectedPage = target.pathname + target.search + target.hash;
      if (this.pagePath() !== '/') this.navigateUiPage('/', true);
      if (this.sessionStatus() === 'anonymous') this.requestProtectedSignIn();
      return;
    }

    // A route transition closes only popup descendants first. The page-branch
    // owns child Entry and retained List disposal in canonical child-first order.
    if (target.pathname !== this.pagePath()) this.surfaces.closeDescendants('ctx.ui.level');
    this.reconcileListEntryNavigation(target.pathname);
    this.commitUiHistory(target.pathname + target.search + target.hash, replace);
    this.pagePath.set(target.pathname);
    this.closeMenus();
    this.applyPageTitle();
  }

  private requestProtectedSignIn(): void {
    if (
      !this.pendingProtectedPage ||
      this.protectedSignInInFlight ||
      this.sessionStatus() !== 'anonymous' ||
      this.systemOutage() ||
      this.pendingLogout
    )
      return;
    this.protectedSignInInFlight = true;
    void this.flows
      .run('auth.signin')
      .then(() => {
        // The Flow closes its popup before the List Host creates a root #level.
        if (this.signedIn() && this.pendingProtectedPage) {
          const destination = this.pendingProtectedPage;
          this.pendingProtectedPage = null;
          this.navigateUiPage(destination);
        } else {
          this.pendingProtectedPage = null;
        }
      })
      .catch(() => {
        this.pendingProtectedPage = null;
      })
      .finally(() => {
        this.protectedSignInInFlight = false;
      });
  }

  private settleProtectedPageRequest(): void {
    if (this.protectedSignInInFlight) return;
    if (this.pendingProtectedPage) {
      if (this.signedIn()) {
        const destination = this.pendingProtectedPage;
        this.pendingProtectedPage = null;
        this.navigateUiPage(destination, true);
      } else if (this.sessionStatus() === 'anonymous') {
        if (this.pagePath() !== '/') this.navigateUiPage('/', true);
        this.requestProtectedSignIn();
      }
    } else if (
      this.sessionStatus() === 'anonymous' &&
      isUiProtectedPageRoute(resolveUiPageRoute(this.pagePath(), this.state.company))
    ) {
      // A previously visible List lost its session; do not initiate Sign In automatically.
      this.navigateUiPage('/', true);
    }
  }

  private attachDocumentation(location: DocumentationLocation): void {
    this.pageHost()?.navigateDocumentation(location);

    if (!this.documentationPageActive()) this.navigateUiPage('/documentation');
  }

  private currentDocumentationLocation(): DocumentationLocation {
    const url = new URL(window.location.href);
    return {
      path: url.searchParams.get('doc') ?? '',
      anchor: url.hash.slice(1),
    };
  }

  private applyPageTitle(): void {
    const route = resolveUiPageRoute(
      this.pagePath(),
      this.state.company,
      this.state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
    );

    document.title = `${route ? uiPageTitle(route) : 'Page not found'} · ManatOS NG1`;
  }

  private applyTheme(theme: UiTheme): void {
    document.documentElement.dataset.uiTheme = theme;

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'lighter' ? '#557da9' : '#071a3d');
  }
}
