import {
  renderSurfaceTitleDebuggerTools,
  mountEntryUIViewSelector,
  type MountedEntryUIViewSelector,
} from '@manatos/shared-ui-ejs';
import { appendContextPathMember, tokenizeContextPath } from '@manatos/shared';
import {
  Ejs1BrowserSession,
  Ejs1TrackedBrowserAuthClient,
  type Ejs1SessionNotice,
} from './session-browser.js';
import {
  multilingual,
  UiDirtyCloseCoordinator,
  entryDirtyClosePresentation,
  dirtyEntryInUiChain,
  activeWorkspaceNavigationItemId,
  ApplicationState,
  UiBusyRuntime,
  BrowserUiPageContentSource,
  renderUiPage,
  resolveUiPageRoute,
  isUiListPageRoute,
  isUiEntryPageRoute,
  isUiEntityPageRoute,
  createUiPageContext,
  uiPageTitle,
  UI_DOCUMENTATION_PAGE,
  UI_ERROR_PAGE,
  UI_ERROR_PAGE_PRESENTATION,
  UI_NOT_FOUND_PAGE,
  UI_NOT_FOUND_PAGE_PRESENTATION,
  ApiHandler,
  FlowRunner,
  applyDocumentFontScale,
  BrowserApiTransport,
  ManatosApiClient,
  UiBootstrapClient,
  UiBootstrapRuntime,
  UiExpressionCapabilityClient,
  createBrowserUiStateRuntime,
  documentationPopupState,
  getUiPlatforms,
  normalizeUiTheme,
  resolveUiPlatformIdentity,
  type DocumentationLocation,
  type UiNavigationItem,
  type UiTheme,
} from '@manatos/shared-ui';

import {
  DocumentationPopupManager,
  EjsUiSurfaceManager,
  mountPage,
  mountPageHost,
  mountListPageHost,
  renderListPageHost,
  mountEntryPageHost,
  renderEntryPageHost,
  renderConfigurationPageHost,
  mountConfigurationPageHost,
  renderStoragePageHost,
  mountStoragePageHost,
  type MountedEntryPageHost,
  type MountedListPageHost,
  mountCtxDiagnostics,
  mountDebugger,
  renderPlatformSelector,
  renderPrimaryNavigation,
  renderWorkspaceNavigation,
  renderFooter,
  renderSurfaceAction,
} from '@manatos/shared-ui-ejs';

const apiTransport = new BrowserApiTransport();
const apiClient = new ManatosApiClient(apiTransport);
const browserServices = Object.freeze({
  apiClient,
  expressionCapabilityDelegate: new UiExpressionCapabilityClient(apiClient),
});
const bootstrapRuntime = new UiBootstrapRuntime(new UiBootstrapClient(browserServices.apiClient));
const uiState = createBrowserUiStateRuntime();
const state = new ApplicationState('EJS', '1', uiState);
// One foreground-operation runtime for the entire EJS1 application, as in NG1.
const busyRuntime = new UiBusyRuntime();

/** NG1-equivalent API outage latch; cleared only by explicit successful recovery. */
let systemOutage = false;
let systemRetrying = false;
let systemRetryStatus = '';
let popupDebuggerForeground = false;
let lastDebuggerAllowed: boolean | null = null;

function debuggerAllowed(): boolean {
  if (
    systemOutage ||
    accountSession.status === 'restoring' ||
    accountSession.status === 'unverified' ||
    accountSession.status === 'signing-out'
  )
    return false;
  const root = state.context.root();
  return (
    root.system.runtime.developerMode === true ||
    root.runtime.user?.permissions.userRole === 'Admin'
  );
}

function enforceDebuggerPermissions(): void {
  const allowed = debuggerAllowed();
  if (!allowed) {
    // Permission changes must hide privileged presentation, not overwrite the
    // persisted choices for Debugging Tools and CTX diagnostics. Otherwise a
    // page refresh during session restoration permanently unchecks both.
    popupDebuggerForeground = false;
    document.body.classList.remove('ejs-popup-debugger-foreground');
  }
  debuggerHost?.sync();
  authSurfaceHost.refreshDebuggerControls(allowed);
  // NG1 updates the menu only when the permission projection changes.
  // Replacing the EJS navigation DOM on every unrelated CTX mutation loses
  // the currently focused menu item and an open dropdown's interaction state.
  if (lastDebuggerAllowed !== allowed) {
    lastDebuggerAllowed = allowed;
    renderPrimaryNavigationState();
  }
}

function localizeStatus(message: string): string {
  return multilingual(state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN', []).status(
    message,
  );
}

let renderedAuthNoticeSignature: string | null = null;

function renderAuthNotice(notice: Ejs1SessionNotice | null): void {
  const previous = document.getElementById('ejs1-auth-notice');
  if (!notice || systemOutage) {
    previous?.remove();
    renderedAuthNoticeSignature = null;
    return;
  }
  // A session or language notification must not discard the focused Retry or
  // Dismiss button when neither the notice nor its translation has changed.
  const signature = JSON.stringify({
    severity: notice.severity,
    message: notice.localizedMessage
      ? state.currentLanguageId.toLowerCase() === 'el'
        ? notice.localizedMessage[1]
        : notice.localizedMessage[0]
      : localizeStatus(notice.message),
    retry: notice.retry,
    language: state.currentLanguageId,
  });
  if (previous && renderedAuthNoticeSignature === signature) return;
  previous?.remove();
  renderedAuthNoticeSignature = signature;
  const container = document.createElement('div');
  container.id = 'ejs1-auth-notice';
  container.className = `auth-status-notice is-${notice.severity}`;
  container.setAttribute('role', notice.severity === 'danger' ? 'alert' : 'status');
  const message = document.createElement('span');
  message.textContent = notice.localizedMessage
    ? state.currentLanguageId.toLowerCase() === 'el'
      ? notice.localizedMessage[1]
      : notice.localizedMessage[0]
    : localizeStatus(notice.message);
  container.append(message);
  if (notice.retry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = multilingual(state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN', [
      'Retry',
    ]).Retry;
    retry.dataset.ejs1AuthRetry = '';
    container.append(retry);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute(
    'aria-label',
    multilingual(state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN', [
      'DismissNotification',
    ]).DismissNotification,
  );
  close.dataset.ejs1AuthDismiss = '';
  container.append(close);
  const header = document.querySelector('header');
  if (header) header.after(container);
  else document.body.prepend(container);
}

function renderSystemOutage(): void {
  // NG1 replaces its active page with the outage surface. EJS preserves
  // its mounted PageHost for recovery but must not leave its stale page
  // interactive or visually exposed behind the outage notice.
  const page = document.querySelector<HTMLElement>('[data-manatos-page]');
  if (page) {
    page.hidden = systemOutage;
    page.toggleAttribute('inert', systemOutage);
    page.setAttribute('aria-hidden', String(systemOutage));
  }
  let overlay = document.getElementById('ejs1-system-outage');
  if (!systemOutage) {
    overlay?.remove();
    document.title = document.title.replace(
      /^System unavailable - |^Το σύστημα δεν είναι διαθέσιμο - /,
      '',
    );
    return;
  }
  if (!overlay) {
    overlay = document.createElement('section');
    overlay.id = 'ejs1-system-outage';
    overlay.className = 'system-unavailable';
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-live', 'assertive');
    document.querySelector('[data-manatos-page]')?.before(overlay);
    if (!overlay.isConnected) document.body.append(overlay);
  }
  const greek = state.currentLanguageId.toLowerCase() === 'el';
  overlay.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = multilingual(greek ? 'EL' : 'EN', [
    'ManatOsSystemUnavailable',
  ]).ManatOsSystemUnavailable;
  const reason = document.createElement('p');
  reason.textContent = multilingual(greek ? 'EL' : 'EN', [
    'ManatOsUnresponsive',
  ]).ManatOsUnresponsive;
  const detail = document.createElement('p');
  detail.textContent = multilingual(greek ? 'EL' : 'EN', [
    'AccessRevokedPollingStopped',
  ]).AccessRevokedPollingStopped;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.dataset.ejs1OutageRetry = '';
  retry.disabled = systemRetrying;
  retry.textContent = multilingual(greek ? 'EL' : 'EN', ['Retry']).Retry;
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = localizeStatus(systemRetryStatus);
  // Reuse NG1's visual hierarchy; the outage remains a regular Page replacement
  // and does not dispose the retained EJS PageHost underneath.
  const body = document.createElement('div');
  body.className = 'system-unavailable-body';
  const icon = document.createElement('i');
  icon.className = 'bi bi-wifi-off system-unavailable-icon';
  icon.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  detail.className = 'system-unavailable-detail';
  const retryRow = document.createElement('div');
  retryRow.className = 'system-unavailable-retry';
  retryRow.append(retry, status);
  content.append(heading, reason, detail, retryRow);
  body.append(icon, content);
  overlay.append(body);
  document.title = multilingual(greek ? 'EL' : 'EN', [
    'SystemUnavailableTitle',
  ]).SystemUnavailableTitle;
}

async function retrySystemOutage(): Promise<void> {
  if (!systemOutage || systemRetrying) return;
  systemRetrying = true;
  systemRetryStatus = 'Checking connectivity…';
  renderSystemOutage();
  try {
    if (!(await bootstrapRuntime.retry())) {
      systemRetryStatus = 'ManatOS is still unavailable.';
      return;
    }
    systemRetryStatus = 'Connected. Closing the previous session…';
    renderSystemOutage();
    await accountSession.revokeAfterOutage();
    accountSession.unblockAfterRecovery();
    systemOutage = false;
    systemRetryStatus = '';
    navigateUiPage('/');
    void authFlows
      .run('auth.signin')
      .catch((error: unknown) =>
        reportDiagnostic({ kind: 'outage-signin', message: String(error) }),
      );
  } catch {
    systemRetryStatus = 'Could not close the previous session. Retry when connected.';
  } finally {
    systemRetrying = false;
    renderSystemOutage();
    enforceDebuggerPermissions();
  }
}

/**
 * The popup title and opening Flow step have deliberately different foreground
 * semantics. Re-clicking the popup CTX tool toggles the dock behind the modal;
 * the Flow tool always selects and reveals the opening step, as in NG1.
 */
function revealPopupDebuggerPath(
  path: string,
  toggleForeground: boolean,
  popupWindow = true,
): boolean {
  if (!debuggerAllowed() || state.context.get(path) === undefined) return false;
  if (toggleForeground && popupDebuggerForeground) {
    popupDebuggerForeground = false;
    document.body.classList.remove('ejs-popup-debugger-foreground');
    debuggerHost?.focusMain();
    authSurfaceHost.refreshDebuggerControls(debuggerAllowed());
    mountedEntryPage?.refreshPictureDebugger();
    return false;
  }
  const view = state.debuggerState.ctxView('ctx');
  const ancestors: string[] = ['ctx'];
  let current = 'ctx';
  for (const member of tokenizeContextPath(path)) {
    current = appendContextPathMember(current, member);
    ancestors.push(current);
  }
  state.debuggerState.updateCtxView('ctx', {
    selectedPath: path,
    expandedPaths: [...new Set([...view.expandedPaths, ...ancestors])],
  });
  state.selectDebuggerView('ctx');
  state.setDebuggerVisible(true);
  // The state projection alone does not produce a new reveal token when the
  // requested popup path is unchanged. Ask the mounted main viewer explicitly.
  debuggerHost?.revealCtxPath(path);
  if (popupWindow) popupDebuggerForeground = true;
  if (popupWindow) document.body.classList.add('ejs-popup-debugger-foreground');
  debuggerHost?.focusDetached();
  if (popupWindow) {
    authSurfaceHost.refreshDebuggerControls(debuggerAllowed());
    mountedEntryPage?.refreshPictureDebugger();
  }
  return true;
}

const authSurfaceHost = new EjsUiSurfaceManager(
  state.context,
  () => (state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN'),
  (path) => revealPopupDebuggerPath(path, true),
  (language) => state.selectLanguage(language),
  busyRuntime,
  () => state.preferences.fontScalePercent,
  (stepPath) => revealPopupDebuggerPath(stepPath, false),
  () => popupDebuggerForeground,
  () => {
    // A dismissed semantic surface cannot retain debugger foreground ownership.
    // Match NG1's SurfacesHost closed output, including nested ErrorInfo surfaces.
    popupDebuggerForeground = false;
    document.body.classList.remove('ejs-popup-debugger-foreground');
  },
  () => {
    // NG1 also clears foreground ownership when a new (possibly nested)
    // surface opens, so its first field receives keyboard focus.
    popupDebuggerForeground = false;
    document.body.classList.remove('ejs-popup-debugger-foreground');
  },
  () => {
    const dock = document.querySelector<HTMLElement>(
      '[data-manatos-debugger-host] .developer-tools-dock',
    );
    if (!dock || !state.debuggerVisible) return null;
    const width = dock.getBoundingClientRect().width;
    return width > 0 ? width : null;
  },
  () => state.languages,
  (entityKey) => state.entityCapabilitiesFor(entityKey),
);
const browserAuth = new Ejs1TrackedBrowserAuthClient();
const flowApi = new ApiHandler(apiClient, browserAuth, authSurfaceHost);
/** Keep the same current account-menu behavior as NG1; unavailable actions remain disabled. */
let accountMenuOpen = false;
// NG1 serves profile photos from its trusted same-origin session host. Never
// put photo bytes, provider tokens, or credentials into the browser CTX.
let headerPhotoUserId: string | null = null;
let headerPhotoSessionRevision = -1;
let headerPhotoGeneration = 0;
let headerPhotoUnavailable = false;
let renderedHeaderIdentity: string | null = null;
let lastHomeAuthAvailable: boolean | null = null;
/** The same session-bound menu embargo as NG1's navigation computed signals. */
const navigationRestricted = (): boolean =>
  accountSession.status === 'restoring' || accountSession.status === 'unverified';
let lastNavigationRestricted: boolean | null = null;
const accountSession = new Ejs1BrowserSession(
  state,
  (user, pending, notice) => {
    const restricted = navigationRestricted();
    if (lastNavigationRestricted !== restricted) {
      lastNavigationRestricted = restricted;
      renderNavigation();
    }
    renderAuthNotice(notice);
    enforceDebuggerPermissions();
    applyWorkspaceNavigationState();
    // A session becoming unverified/anonymous must immediately hide and release
    // privileged content; asynchronous page translation cannot be the guard.
    if (!accountSession.authenticated && mountedListPage) {
      authSurfaceHost.closeDescendants('ctx.ui.level');
      mountedListPage.destroy();
      mountedListPage = null;
      const renderedList = document.querySelector<HTMLElement>('[data-list-page-host]');
      if (renderedList) renderedList.hidden = true;
    }
    if (!accountSession.authenticated && mountedAdministrationPage) {
      authSurfaceHost.closeDescendants('ctx.ui.level');
      mountedAdministrationPage.destroy();
      mountedAdministrationPage = null;
      mountedAdministrationPath = null;
      mountedAdministrationLanguage = null;
      const renderedAdmin = document.querySelector<HTMLElement>(
        '[data-administration-configuration], [data-administration-storage]',
      );
      if (renderedAdmin) renderedAdmin.hidden = true;
    }
    if (!accountSession.authenticated && mountedEntryPage) {
      authSurfaceHost.closeDescendants('ctx.ui.level');
      mountedEntryPage.destroy();
      mountedEntryPage = null;
      const renderedEntry = document.querySelector<HTMLElement>('[data-entry-page-host]');
      if (renderedEntry) renderedEntry.hidden = true;
    }
    if (
      isUiEntityPageRoute(resolveUiPageRoute(window.location.pathname, state.company)) ||
      resolveUiPageRoute(window.location.pathname, state.company)?.kind === 'administration' ||
      mountedListPage ||
      mountedEntryPage ||
      mountedAdministrationPage
    ) {
      void refreshPagePresentation();
    }
    settleProtectedPageRequest();
    const homeAuthAvailable = accountSession.status === 'anonymous' && !systemOutage;
    if (lastHomeAuthAvailable !== homeAuthAvailable) {
      lastHomeAuthAvailable = homeAuthAvailable;
      if (window.location.pathname === '/') void refreshPagePresentation();
    }
    const host = document.querySelector<HTMLElement>('[data-ejs1-auth-actions]');
    if (!host) return;
    const userId = user?.id ?? null;
    // Do not discard the previous photo owner during a routine session check.
    // On successful restoration the host may return the same ID with a newer
    // photo, so identity comparison alone is insufficient.
    if (
      !pending &&
      (userId !== headerPhotoUserId ||
        (userId !== null && headerPhotoSessionRevision !== accountSession.photoRevision))
    ) {
      headerPhotoUserId = userId;
      headerPhotoSessionRevision = accountSession.photoRevision;
      headerPhotoUnavailable = false;
      ++headerPhotoGeneration;
    }
    const uiText = multilingual(state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN', []);
    // NG1's Header owns live buttons independently of session-state signals.
    // Reuse the EJS controls when the semantic identity and language match:
    // opening/closing the menu must not replace the focused toggle or re-fetch
    // an already loaded profile photo. Rebuild only when its inputs change.
    const identity = JSON.stringify({
      pending,
      userId,
      name: user?.name ?? null,
      role: user?.role ?? null,
      language: state.currentLanguageId,
      photoVersion: headerPhotoGeneration,
    });
    if (renderedHeaderIdentity === identity && (pending || host.hasChildNodes())) {
      const toggle = host.querySelector<HTMLButtonElement>('[data-ejs1-account-toggle]');
      const menu = host.querySelector<HTMLElement>('[data-ejs1-account-menu]');
      if (toggle) toggle.setAttribute('aria-expanded', String(accountMenuOpen));
      if (menu) menu.hidden = !accountMenuOpen;
      return;
    }
    renderedHeaderIdentity = identity;
    host.replaceChildren();
    if (pending) return;
    if (user) {
      const wrapper = document.createElement('div');
      wrapper.className = 'ejs1-account-menu-host';
      // NG1 presents Notifications and Account as separate header actions.
      // Its Notifications event is intentionally not wired to a feature yet.
      const notifications = document.createElement('button');
      notifications.type = 'button';
      notifications.className = 'header-auth-button header-notifications-button';
      notifications.title = uiText.resolve('@CM.Notifications');
      notifications.setAttribute('aria-label', notifications.title);
      const bell = document.createElement('i');
      bell.className = 'bi bi-bell';
      bell.setAttribute('aria-hidden', 'true');
      notifications.append(bell);
      host.append(notifications);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'header-auth-button header-account-button';
      toggle.dataset.ejs1AccountToggle = '';
      toggle.setAttribute('aria-expanded', String(accountMenuOpen));
      toggle.setAttribute('aria-haspopup', 'true');
      toggle.title = uiText.resolve('@CM.OpenAccountMenu');
      toggle.setAttribute('aria-label', toggle.title);
      const accountIcon = document.createElement('i');
      accountIcon.className = 'bi bi-person-circle';
      accountIcon.setAttribute('aria-hidden', 'true');
      if (!headerPhotoUnavailable) {
        const photo = document.createElement('img');
        photo.className = 'header-account-photo';
        photo.src = '/_manatos/auth/photo?v=' + headerPhotoGeneration;
        photo.alt = '';
        accountIcon.hidden = true;
        photo.addEventListener(
          'error',
          () => {
            headerPhotoUnavailable = true;
            photo.remove();
            accountIcon.hidden = false;
          },
          { once: true },
        );
        toggle.append(photo);
      }
      const caret = document.createElement('span');
      caret.className = 'header-account-caret';
      caret.setAttribute('aria-hidden', 'true');
      toggle.append(accountIcon, document.createTextNode(uiText.resolve('@CM.Account')), caret);
      wrapper.append(toggle);
      const menu = document.createElement('div');
      menu.className = 'ejs1-account-menu';
      menu.dataset.ejs1AccountMenu = '';
      menu.hidden = !accountMenuOpen;
      menu.setAttribute('role', 'group');
      menu.setAttribute('aria-label', uiText.resolve('@CM.AccountMenu'));
      const identity = document.createElement('div');
      identity.className = 'ejs1-account-identity';
      const person = document.createElement('div');
      person.className = 'ejs1-account-person header-account-person';
      const personIcon = document.createElement('i');
      personIcon.className = 'bi bi-person-circle ejs1-account-person-fallback';
      personIcon.setAttribute('aria-hidden', 'true');
      if (!headerPhotoUnavailable) {
        const photo = document.createElement('img');
        photo.className = 'header-account-menu-photo';
        photo.src = '/_manatos/auth/photo?v=' + headerPhotoGeneration;
        photo.alt = '';
        personIcon.hidden = true;
        photo.addEventListener(
          'error',
          () => {
            headerPhotoUnavailable = true;
            photo.remove();
            personIcon.hidden = false;
          },
          { once: true },
        );
        person.append(photo);
      }
      const name = document.createElement('strong');
      name.className = 'header-account-name';
      name.textContent = user.name || user.id;
      const role = document.createElement('span');
      role.className = 'header-account-role';
      role.textContent = user.role;
      person.append(personIcon, name);
      identity.append(person, role);
      menu.append(identity);
      const divider = () => {
        const element = document.createElement('div');
        element.className = 'ejs1-account-divider';
        menu.append(element);
      };
      divider();
      const menuIcon = (name: string): HTMLElement => {
        const icon = document.createElement('i');
        icon.className = `bi ${name}`;
        icon.setAttribute('aria-hidden', 'true');
        return icon;
      };
      const unavailable = uiText.resolve('@CM.AccountPageUnavailable');
      const accountDetails = document.createElement('button');
      accountDetails.type = 'button';
      accountDetails.className = 'ejs1-account-menu-item';
      accountDetails.title = unavailable;
      accountDetails.disabled = true;
      accountDetails.append(
        menuIcon('bi-person-vcard'),
        document.createTextNode(uiText.resolve('@CM.AccountDetails')),
      );
      menu.append(accountDetails);
      const changePassword = document.createElement('button');
      changePassword.type = 'button';
      changePassword.className = 'ejs1-account-menu-item';
      changePassword.dataset.ejs1ChangePassword = '';
      changePassword.append(
        menuIcon('bi-key'),
        document.createTextNode(uiText.resolve('@CM.ChangePassword')),
      );
      menu.append(changePassword);
      divider();
      const signout = document.createElement('button');
      signout.type = 'button';
      signout.className = 'ejs1-account-menu-item ejs1-account-signout';
      signout.dataset.ejs1Signout = '';
      signout.append(
        menuIcon('bi-box-arrow-right'),
        document.createTextNode(uiText.resolve('@CM.Logout')),
      );
      menu.append(signout);
      wrapper.append(menu);
      host.append(wrapper);
    } else {
      accountMenuOpen = false;
      const authActions = [
        ['auth.signin', '@CM.SignIn', 'header-sign-in', 'bi-box-arrow-in-right'],
        ['auth.register', '@CM.SignUp', 'header-sign-up', 'bi-person-plus'],
      ] as const;
      for (const [action, labelKey, style, icon] of authActions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'header-auth-button ' + style;
        button.dataset.ejs1AuthFlow = action;
        button.title = uiText.resolve(action === 'auth.register' ? '@CM.CreateAccount' : labelKey);
        button.setAttribute('aria-label', button.title);
        const symbol = document.createElement('i');
        symbol.className = 'bi ' + icon;
        symbol.setAttribute('aria-hidden', 'true');
        button.append(symbol, document.createTextNode(uiText.resolve(labelKey)));
        host.append(button);
      }
    }
  },
  browserAuth,
);

const authFlows = new FlowRunner(state.context, authSurfaceHost, flowApi, {
  signedIn: (user) => accountSession.signedIn(user),
});

const diagnosticsHost = mountCtxDiagnostics(document, state.diagnostics);
// The live Page and its static-content/Documentation host remain mounted across
// navigation and language/context changes, as their NG1 counterparts do.
const pageHost = mountPage(document);
const pageContentHost = mountPageHost(document, (location) =>
  state.rememberDocumentationPage(location),
);
let pendingDocumentationLocation: DocumentationLocation | null = null;
let mountedListPage: MountedListPageHost | null = null;
/** Park the actual live List DOM, never rebuild its query/selection runtime. */
let retainedListElement: HTMLElement | null = null;
let retainedListParking: HTMLDivElement | null = null;
function parkListPage(): void {
  const element = document.querySelector<HTMLElement>('[data-list-page-host]');
  if (!element || !mountedListPage) return;
  retainedListParking ??= document.createElement('div');
  retainedListParking.hidden = true;
  retainedListParking.dataset.retainedListPage = '';
  if (!retainedListParking.isConnected) document.body.append(retainedListParking);
  retainedListParking.append(element);
  retainedListElement = element;
}
function restoreListPage(): void {
  if (!retainedListElement) return;
  const placeholder = document.querySelector<HTMLElement>('[data-list-page-host]');
  if (!placeholder) return;
  placeholder.replaceWith(retainedListElement);
  retainedListElement = null;
  retainedListParking?.remove();
  retainedListParking = null;
}

let mountedEntryPage: MountedEntryPageHost | null = null;
let mountedEntryViewSelector: MountedEntryUIViewSelector | null = null;
function restoreEntryUIViewTitle(): void {
  const slot = document.querySelector<HTMLElement>('[data-entry-ui-view-title-slot]');
  if (!slot || !mountedEntryPage) return;
  const page = mountedEntryPage;
  if (mountedEntryViewSelector) {
    // The generic Page title renderer can replace its slot during an unrelated
    // caption update. Move the existing control, preserving menu/focus state.
    if (mountedEntryViewSelector.element.parentElement !== slot)
      slot.append(mountedEntryViewSelector.element);
    mountedEntryViewSelector.refresh();
    return;
  }
  mountedEntryViewSelector = mountEntryUIViewSelector(
    slot,
    page.entityKey,
    () => (state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN'),
    () => ({
      key: page.getSelectedUIView(),
      mode: page.getEntryMode(),
      busy: page.isUIViewBusy(),
    }),
    (key) => page.selectUIView(key),
  );
}
function entryUIViewTitleSlot(): string {
  return '<span data-entry-ui-view-title-slot></span>';
}

let mountedAdministrationPage: {
  destroy(): void;
  refreshLanguage(): void;
  hasUnsavedChanges?(): boolean;
} | null = null;
let mountedAdministrationPath: string | null = null;
let mountedAdministrationLanguage: string | null = null;
let presentedPagePath = window.location.pathname;
/** A direct or clicked /bo/... link is an explicit protected navigation request. */
let pendingProtectedPage: string | null =
  isUiEntityPageRoute(resolveUiPageRoute(window.location.pathname, state.company)) ||
  resolveUiPageRoute(window.location.pathname, state.company)?.kind === 'administration'
    ? window.location.pathname + window.location.search + window.location.hash
    : null;
let protectedSignInInFlight = false;
// A direct /bo/... HTTP request redirects here through the trusted UI host.
// Never accept an external destination or an unregistered entity route.
const protectedRedirectQuery = new URLSearchParams(window.location.search);
const protectedRedirectTarget =
  protectedRedirectQuery.get('auth') === 'signin' ? protectedRedirectQuery.get('next') : null;
if (protectedRedirectTarget) {
  try {
    const target = new URL(protectedRedirectTarget, window.location.origin);
    if (
      target.origin === window.location.origin &&
      (isUiEntityPageRoute(resolveUiPageRoute(target.pathname, state.company)) ||
        resolveUiPageRoute(target.pathname, state.company)?.kind === 'administration')
    ) {
      pendingProtectedPage = target.pathname + target.search + target.hash;
    }
  } catch {
    // Reject invalid or external redirect targets.
  }
  protectedRedirectQuery.delete('auth');
  protectedRedirectQuery.delete('next');
  const remaining = protectedRedirectQuery.toString();
  window.history.replaceState(window.history.state, '', '/' + (remaining ? `?${remaining}` : ''));
}
const documentationPopupManager = new DocumentationPopupManager({
  mainWindow: window,
  windowNamePrefix: `ManatOSDocumentation_${state.uiState.tabId}`,
  state,
  attachRequested: (location) => {
    // Attach can be requested while Home (or another page) is active. Keep the
    // location until the asynchronous PageHost has mounted Documentation.
    pendingDocumentationLocation = location;
    if (window.location.pathname !== '/documentation') navigateUiPage('/documentation');
    else if (pageContentHost.hasDocumentation()) {
      pageContentHost.navigateDocumentation(location);
      pendingDocumentationLocation = null;
    } else void refreshPagePresentation();
  },
});
let diagnosticsMenuVisible = state.debugDiagnosticsVisible;

const debuggerHostElement = document.querySelector<HTMLElement>('[data-manatos-debugger-host]');
const debuggerHost = debuggerHostElement
  ? mountDebugger(debuggerHostElement, {
      state,
      expressionCapabilityDelegate: browserServices.expressionCapabilityDelegate,
      visibilityChanged: () => renderPrimaryNavigationState(),
      allowed: debuggerAllowed,
    })
  : null;

function developerMenu() {
  return debuggerAllowed() ? state.debugMenu : [];
}

const unsubscribeDiagnosticsMenu = state.diagnostics.subscribe(() => {
  const visible = state.debugDiagnosticsVisible;
  if (visible === diagnosticsMenuVisible) return;
  diagnosticsMenuVisible = visible;
  renderPrimaryNavigationState();
});

function applyTheme(theme: UiTheme): void {
  document.documentElement.dataset.uiTheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'lighter' ? '#557da9' : '#071a3d');
}

function openPreferences(): void {
  const preferences = document.querySelector<HTMLElement>('[data-preferences]');

  if (!preferences) return;

  const theme = state.preferences.theme;

  preferences.querySelectorAll<HTMLInputElement>('[data-ui-theme-option]').forEach((option) => {
    option.checked = option.value === theme;
  });

  const preview = preferences.querySelector<HTMLElement>('[data-ui-theme-preview]');

  if (preview) {
    preview.dataset.previewTheme = theme;
  }

  preferences.hidden = false;
}

function closePreferences(): void {
  const preferences = document.querySelector<HTMLElement>('[data-preferences]');

  if (preferences) {
    preferences.hidden = true;
  }
}

function currentDocumentationLocation(): DocumentationLocation {
  const current = pageContentHost.getDocumentationLocation();
  if (current?.path) return current;

  const url = new URL(window.location.href);
  return {
    path: url.searchParams.get('doc') ?? '',
    anchor: url.hash.slice(1),
  };
}

function reportDiagnostic(event: Record<string, unknown>): void {
  console.error('[ManatOS EJS1]', event);

  void fetch('/debug/ui-runtime/diagnostic', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {
    // Diagnostics must never create another application failure.
  });
}

function currentPlatform() {
  return state.currentPlatformId === null
    ? null
    : resolveUiPlatformIdentity(
        state.currentPlatformId,
        state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
      );
}

function replaceElement(selector: string, html: string): void {
  const current = document.querySelector<HTMLElement>(selector);

  if (!current) return;

  current.outerHTML = html;
}

/** NG1 LanguageSelection starts left-aligned and clamps only on overflow. */
function positionNavigationLanguageMenu(menu: HTMLElement): void {
  if (menu.hidden) return;
  menu.style.left = '0';
  menu.style.right = 'auto';
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  const viewportWidth = document.documentElement.clientWidth;
  if (viewportWidth <= 0) return;
  const left = Math.min(
    Math.max(rect.left, margin),
    Math.max(margin, viewportWidth - rect.width - margin),
  );
  menu.style.left = `${Math.round(left - rect.left)}px`;
}

/** A semantic child identity, stable across language and permission changes. */
function navigationElementKey(element: Element): string | null {
  const control = element as HTMLElement;
  const { dataset } = control;
  for (const key of [
    'navigationId',
    'primaryNavigationId',
    'language',
    'developerAction',
    'platformId',
    'shellMenu',
    'fontScaleDelta',
  ] as const) {
    if (dataset[key] !== undefined) return `${key}:${dataset[key]}`;
  }
  for (const attribute of [
    'data-documentation-open',
    'data-platform-toggle',
    'data-platform-none',
    'data-font-scale-reset',
    'data-primary-navigation-toggle',
    'data-primary-navigation-menu',
    'data-platform-menu',
    'data-shell-menu-toggle',
    'data-shell-menu-popup',
  ]) {
    if (element.hasAttribute(attribute)) return attribute;
  }
  // The tool-group wrapper has no metadata identifier; class membership is
  // stable even when individual tools appear/disappear due to permissions.
  for (const name of [
    'primary-navigation-items',
    'primary-navigation-tools',
    'primary-navigation-documentation',
    'primary-navigation-developer-toggle',
    'primary-navigation-font-scale',
    'language-selection',
    'workspace-navigation-bottom',
    'workspace-navigation-children',
  ]) {
    if (element.classList.contains(name)) return `class:${name}`;
  }
  return null;
}

/**
 * Update live EJS navigation DOM instead of reconstructing every component.
 * NG1 retains component instances when signals change; this reconciler
 * preserves their equivalent EJS nodes, focus, native menu state and listeners.
 * Only renderer-owned attributes and children are synchronized.
 */
function reconcileNavigationNode(current: Node, template: Node): void {
  if (current.nodeType === Node.TEXT_NODE && template.nodeType === Node.TEXT_NODE) {
    if (current.textContent !== template.textContent) current.textContent = template.textContent;
    return;
  }
  if (!(current instanceof Element) || !(template instanceof Element)) return;
  const preserveHidden = current.matches(
    '[data-shell-menu-popup], [data-primary-navigation-menu], [data-platform-menu]',
  );
  const preserveExpanded = current.matches(
    '[data-shell-menu-toggle], [data-primary-navigation-toggle], [data-platform-toggle]',
  );
  const preserveOpen = current.matches('details.workspace-navigation-group');
  const oldHidden = preserveHidden ? current.hasAttribute('hidden') : false;
  const oldExpanded = preserveExpanded ? current.getAttribute('aria-expanded') : null;
  const oldOpen = preserveOpen ? current.hasAttribute('open') : false;
  for (const attribute of Array.from(current.attributes)) {
    if (!template.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(template.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value)
      current.setAttribute(attribute.name, attribute.value);
  }
  if (preserveHidden) current.toggleAttribute('hidden', oldHidden);
  if (preserveExpanded && oldExpanded !== null) current.setAttribute('aria-expanded', oldExpanded);
  if (preserveOpen) current.toggleAttribute('open', oldOpen);

  const oldChildren = Array.from(current.childNodes);
  const used = new Set<Node>();
  let position = 0;
  for (const desired of Array.from(template.childNodes)) {
    const key = desired instanceof Element ? navigationElementKey(desired) : null;
    const matches = (candidate: Node): boolean =>
      candidate.nodeType === desired.nodeType &&
      candidate.nodeName === desired.nodeName &&
      (key !== null
        ? candidate instanceof Element && navigationElementKey(candidate) === key
        : !(candidate instanceof Element && navigationElementKey(candidate)));
    const samePosition = oldChildren[position];
    const match =
      key !== null
        ? oldChildren.find((candidate) => !used.has(candidate) && matches(candidate))
        : samePosition && !used.has(samePosition) && matches(samePosition)
          ? samePosition
          : oldChildren.find((candidate) => !used.has(candidate) && matches(candidate));
    const node = match ?? desired.cloneNode(true);
    if (match) {
      used.add(match);
      reconcileNavigationNode(match, desired);
    }
    if (current.childNodes[position] !== node)
      current.insertBefore(node, current.childNodes[position] ?? null);
    position += 1;
  }
  for (const child of oldChildren) if (!used.has(child)) child.parentNode?.removeChild(child);
}

function replaceNavigationRegion(selector: string, html: string): void {
  const current = document.querySelector<HTMLElement>(selector);
  if (!current) return;
  const template = current.ownerDocument.createElement('template');
  template.innerHTML = html.trim();
  const next = template.content.firstElementChild;
  if (!(next instanceof HTMLElement)) return;
  if (current.outerHTML === next.outerHTML) return;
  reconcileNavigationNode(current, next);
  const languageMenu = current.querySelector<HTMLElement>('.primary-navigation-language-menu');
  if (languageMenu) positionNavigationLanguageMenu(languageMenu);
}

function refreshShellControlLabels(): void {
  const labelsText = multilingual(state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN', []);
  const labels: ReadonlyArray<readonly [selector: string, title: string, description: string]> = [
    [
      '[data-workspace-navigation-collapse]',
      labelsText.resolve('@CM.CollapseNavigation'),
      labelsText.resolve('@CM.CollapseApplicationNavigation'),
    ],
    [
      '[data-workspace-navigation-restore]',
      labelsText.resolve('@CM.ShowNavigation'),
      labelsText.resolve('@CM.ShowApplicationNavigation'),
    ],
  ];
  for (const [selector, title, description] of labels) {
    const control = document.querySelector<HTMLElement>(selector);
    control?.setAttribute('title', title);
    control?.setAttribute('aria-label', description);
  }
}

function applyWorkspaceNavigationState(): void {
  const available = accountSession.authenticated && !systemOutage;
  const visible = available && !state.workspaceNavigationCollapsed;
  const shellBody = document.querySelector<HTMLElement>('[data-shell-body]');
  const navigation = document.querySelector<HTMLElement>('[data-workspace-navigation-region]');
  const collapse = document.querySelector<HTMLButtonElement>(
    '[data-workspace-navigation-collapse]',
  );
  const restore = document.querySelector<HTMLButtonElement>('[data-workspace-navigation-restore]');

  if (!shellBody || !navigation || !restore) return;

  shellBody.classList.toggle('navigation-collapsed', !visible);
  shellBody.classList.toggle('navigation-unavailable', !available);
  navigation.classList.toggle('collapsed', !visible);
  navigation.setAttribute('aria-hidden', String(!visible));

  collapse?.setAttribute('aria-expanded', String(visible));

  restore.hidden = !available || visible;
  restore.setAttribute('aria-expanded', String(visible));
}

function renderPlatform(): void {
  replaceNavigationRegion(
    '[data-platform-selector]',
    renderPlatformSelector({
      current: currentPlatform(),
      platforms: getUiPlatforms(state.currentLanguageId.toUpperCase() as 'EN' | 'EL'),
      navigation: navigationRestricted() ? null : state.platformNavigation,
    }),
  );
}

/** Update active state without replacing DOM or resetting expanded groups. */
function updateActiveWorkspaceNavigation(): void {
  const activeId = activeWorkspaceNavigationItemId(
    state.workspaceNavigation,
    window.location.pathname,
  );
  document
    .querySelectorAll<HTMLElement>('.workspace-navigation-item[data-navigation-id]')
    .forEach((element) => {
      const active = element.dataset['navigationId'] === activeId;
      element.classList.toggle('is-active', active);
      if (active) element.setAttribute('aria-current', 'page');
      else element.removeAttribute('aria-current');
    });
}

function renderNavigation(): void {
  replaceNavigationRegion(
    '.primary-navigation',
    renderPrimaryNavigation({
      items: navigationRestricted() ? [] : state.primaryNavigation,
      languages: state.languages,
      developerItems: developerMenu(),
      currentLanguage: state.currentLanguage,
      fontScalePercent: state.preferences.fontScalePercent,
      debuggerAllowed: debuggerAllowed(),
    }),
  );

  replaceNavigationRegion(
    '.workspace-navigation',
    renderWorkspaceNavigation({
      items: navigationRestricted() ? [] : state.workspaceNavigation,
      pathname: window.location.pathname,
      language: state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
    }),
  );

  renderPlatform();
  updateActiveWorkspaceNavigation();
  applyWorkspaceNavigationState();
}

function renderPrimaryNavigationState(): void {
  replaceNavigationRegion(
    '.primary-navigation',
    renderPrimaryNavigation({
      items: navigationRestricted() ? [] : state.primaryNavigation,
      languages: state.languages,
      developerItems: developerMenu(),
      currentLanguage: state.currentLanguage,
      fontScalePercent: state.preferences.fontScalePercent,
      debuggerAllowed: debuggerAllowed(),
    }),
  );
}

// NG1 PageHost reacts to language and page context. EJS1 starts with SSR,
// but after hydration the same shared static-content translator must be used
// when its presentation context changes. A generation guard prevents an older
// translation response from undoing a newer language selection.
const pageContentSource = new BrowserUiPageContentSource();
let pagePresentationRevision = 0;
let lastFooterMarkup: string | null = null;
async function refreshPagePresentation(): Promise<void> {
  const revision = ++pagePresentationRevision;
  const language = state.currentLanguageId.toLowerCase() === 'el' ? 'EL' : 'EN';
  const requestedRoute = resolveUiPageRoute(window.location.pathname, state.company, language);
  // Neither SSR nor browser hydration may mount a protected List before verification.
  const route =
    (isUiEntityPageRoute(requestedRoute) || requestedRoute?.kind === 'administration') &&
    !accountSession.authenticated
      ? resolveUiPageRoute('/', state.company, language)
      : requestedRoute;
  const page = route?.page ?? UI_NOT_FOUND_PAGE;
  const presentation = route?.presentation ?? UI_NOT_FOUND_PAGE_PRESENTATION;
  let displayedPage = page;
  let displayedPresentation = presentation;
  const context = route
    ? createUiPageContext(route, state.company, language)
    : { company: state.company, requestPath: window.location.pathname };
  const pageContext = {
    ...context,
    auth: { anonymous: accountSession.status === 'anonymous' && !systemOutage },
    $language: language,
  };
  let html: string;
  try {
    html =
      route?.path === '/configuration'
        ? renderConfigurationPageHost()
        : route?.path === '/system-settings'
          ? renderStoragePageHost()
          : isUiListPageRoute(route)
            ? renderListPageHost()
            : isUiEntryPageRoute(route)
              ? renderEntryPageHost()
              : await renderUiPage(pageContentSource, page, pageContext);
  } catch (error) {
    if (revision !== pagePresentationRevision) return;
    reportDiagnostic({ kind: 'page-translation-failed', error: String(error) });
    // NG1's PageHost renders the shared error page rather than leaving an
    // unrelated previously selected page on screen after a failed navigation.
    displayedPage = UI_ERROR_PAGE;
    displayedPresentation = UI_ERROR_PAGE_PRESENTATION;
    try {
      html = await renderUiPage(pageContentSource, UI_ERROR_PAGE, {
        ...pageContext,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } catch {
      html = 'ManatOS could not prepare this page.';
    }
  }
  if (revision !== pagePresentationRevision) return;

  // Navigating away resets the transient details model; translating or
  // refreshing the same route keeps it, as in NG1's mounted Page.
  const samePage = presentedPagePath === window.location.pathname;
  const documentationLocation =
    pendingDocumentationLocation ?? (samePage ? pageContentHost.getDocumentationLocation() : null);
  const isDocumentation =
    displayedPage.folder === UI_DOCUMENTATION_PAGE.folder &&
    displayedPage.name === UI_DOCUMENTATION_PAGE.name;

  pageHost.updatePresentation(
    {
      language,
      presentation: displayedPresentation,
      ...(isUiListPageRoute(route) || isUiEntryPageRoute(route)
        ? {
            titleActions: `${isUiEntryPageRoute(route) ? entryUIViewTitleSlot() : ''}${renderSurfaceTitleDebuggerTools(
              state.context.get('ctx.ui.level.flow') &&
                typeof state.context.get('ctx.ui.level.flow') === 'object'
                ? 'ctx.ui.level.flow'
                : null,
            )}`,
          }
        : isDocumentation
          ? {
              titleActions: renderSurfaceAction({
                label: multilingual(language, []).resolve('@CM.OpenNewDocumentationPopup'),
                icon: 'bi-box-arrow-up-right',
                action: 'open-documentation-popup',
              }),
            }
          : {}),
    },
    samePage,
  );
  const nextEntry = displayedPage === page && isUiEntryPageRoute(route) ? route : null;
  const listRouteKey = displayedPage === page && isUiListPageRoute(route) ? route.entityKey : null;
  const keepParentList = Boolean(
    mountedListPage && nextEntry && mountedListPage.entityKey === nextEntry.entityKey,
  );
  const nextEntityKey =
    listRouteKey ?? (keepParentList ? (mountedListPage?.entityKey ?? null) : null);
  // Teardown is child-first; a surviving List still owns ctx.ui.level.
  if (
    mountedEntryPage &&
    (mountedEntryPage.entityKey !== nextEntry?.entityKey ||
      mountedEntryPage.recordId !== nextEntry?.recordId)
  ) {
    authSurfaceHost.closeDescendants(mountedListPage ? 'ctx.ui.level.level' : 'ctx.ui.level');
    mountedEntryViewSelector?.dispose();
    mountedEntryViewSelector = null;
    mountedEntryPage.destroy();
    mountedEntryPage = null;
  }
  if (mountedListPage && mountedListPage.entityKey !== nextEntityKey) {
    authSurfaceHost.closeDescendants('ctx.ui.level');
    mountedListPage.destroy();
    mountedListPage = null;
    retainedListElement = null;
    retainedListParking?.remove();
    retainedListParking = null;
  }
  if (keepParentList && nextEntry && !retainedListElement) parkListPage();
  const nextAdmin = displayedPage === page && route?.kind === 'administration' ? route.path : null;
  if (mountedAdministrationPage && (mountedAdministrationPath !== nextAdmin || !samePage)) {
    mountedAdministrationPage.destroy();
    mountedAdministrationPage = null;
    mountedAdministrationPath = null;
    mountedAdministrationLanguage = null;
  }
  pageContentHost.present(displayedPage, html, documentationLocation);
  if (nextAdmin && !mountedAdministrationPage) {
    const isAdmin = state.context.root().runtime.user?.permissions.userRole === 'Admin';
    mountedAdministrationPage =
      nextAdmin === '/configuration'
        ? mountConfigurationPageHost(
            document,
            () => (state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN'),
            !isAdmin,
          )
        : mountStoragePageHost(
            document,
            () => (state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN'),
            !isAdmin,
            authSurfaceHost,
          );
    mountedAdministrationPath = nextAdmin;
    mountedAdministrationLanguage = language;
  }
  if (mountedAdministrationPage && mountedAdministrationLanguage !== language) {
    mountedAdministrationPage.refreshLanguage();
    mountedAdministrationLanguage = language;
  }

  if (listRouteKey && mountedListPage) restoreListPage();
  if (nextEntry && !mountedEntryPage) {
    mountedEntryPage = mountEntryPageHost(
      document,
      state.context,
      nextEntry.entityKey,
      nextEntry.recordId,
      language,
      {
        parentLevelPath: keepParentList ? 'ctx.ui.level' : null,
        permissions: state.entityCapabilitiesFor(nextEntry.entityKey),
        canReadEntity: (entityKey) => state.entityCapabilitiesFor(entityKey).read === true,
        canCreateEntity: (entityKey) => state.entityCapabilitiesFor(entityKey).create === true,
        inspectorAllowed: () => debuggerAllowed(),
        debuggerForeground: () => popupDebuggerForeground,
        debuggerRequested: (path) => revealPopupDebuggerPath(path, true),
        debuggerDockWidth: () => {
          const dock = document.querySelector<HTMLElement>(
            '[data-manatos-debugger-host] .developer-tools-dock',
          );
          return dock && state.debuggerVisible ? dock.getBoundingClientRect().width : null;
        },
        languages: () => state.languages,
        selectLanguage: (selected) => state.selectLanguage(selected),
        initialFontScalePercent: () => state.preferences.fontScalePercent,
        inspectCtx: (path) => {
          revealPopupDebuggerPath(path, false, false);
        },
        openReferenceList: (relatedEntity, parentLevelPath, select) => {
          authSurfaceHost.openListSelector(relatedEntity, parentLevelPath, select);
        },
        openReferenceViewer: (relatedEntity, parentLevelPath, recordId) => {
          authSurfaceHost.openEntryViewer(relatedEntity, parentLevelPath, recordId);
        },
        openReferenceCreator: (relatedEntity, parentLevelPath, accept) => {
          authSurfaceHost.openEntryCreator(relatedEntity, parentLevelPath, accept);
        },
        openChangeReport: (report) => {
          authSurfaceHost.open('semantic.changeReport', {
            params: { report },
            allowXClosure: true,
            allowBackdropClosure: true,
          });
        },
        onCancel: () => {
          navigateUiPage(`/bo/${encodeURIComponent(nextEntry.entityKey)}`, true);
        },
        onCaptionChanged: (caption) => {
          if (window.location.pathname !== nextEntry.path) return;
          document.title = `${caption} · ManatOS EJS1`;
          const editLabel = (language === 'EL' ? 'Επεξεργασία' : 'Edit') + ' ' + nextEntry.title;
          pageHost.updatePresentation(
            {
              language,
              presentation: {
                ...displayedPresentation,
                title: { ...displayedPresentation.title, title: caption },
                breadcrumb: [...displayedPresentation.breadcrumb, { label: editLabel, href: null }],
              },
              titleActions: `${entryUIViewTitleSlot()}${renderSurfaceTitleDebuggerTools(
                state.context.get('ctx.ui.level.flow') &&
                  typeof state.context.get('ctx.ui.level.flow') === 'object'
                  ? 'ctx.ui.level.flow'
                  : null,
              )}`,
            },
            true,
          );
          restoreEntryUIViewTitle();
        },
      },
    );
  }
  if (nextEntry && mountedEntryPage) {
    mountedEntryPage.updateLanguage(language);
    restoreEntryUIViewTitle();
  }
  if (nextEntityKey && !mountedListPage) {
    mountedListPage = mountListPageHost(document, state.context, nextEntityKey, language);
  }
  if (mountedListPage && nextEntityKey) mountedListPage.updateLanguage(language);
  if (pendingDocumentationLocation && pageContentHost.hasDocumentation()) {
    pendingDocumentationLocation = null;
  }
  presentedPagePath = window.location.pathname;
  document.title = `${displayedPage === UI_ERROR_PAGE ? 'Page unavailable' : route ? uiPageTitle(route) : presentation.title.title} · ManatOS EJS1`;
  renderSystemOutage();
  const footerMarkup = renderFooter({
    language,
    companyShortName: state.company.shortName,
    companyName: state.company.name,
    versionLabel: state.versionLabel,
  });
  // The Footer is a persistent shell component. Navigation and static-page
  // translations must not replace it unless its actual presentation changes.
  if (footerMarkup !== lastFooterMarkup) {
    replaceElement('.corporate-footer', footerMarkup);
    lastFooterMarkup = footerMarkup;
  }
}

function findNavigationItem(
  items: readonly UiNavigationItem[],
  id: string,
): UiNavigationItem | null {
  for (const item of items) {
    if (item.id === id) return item;

    const child = findNavigationItem(item.children, id);
    if (child) return child;
  }

  return null;
}

function resolveNavigationItem(id: string): UiNavigationItem | null {
  return (
    findNavigationItem(state.primaryNavigation, id) ??
    findNavigationItem(state.workspaceNavigation, id) ??
    (state.platformNavigation?.id === id ? state.platformNavigation : null)
  );
}

const dirtyClose = new UiDirtyCloseCoordinator();
// Suppress the native warning only for a host navigation explicitly authorized
// by the application's Unsaved Changes decision. Real reloads still warn.
let approvedHostUnload = false;
function navigateHostRoute(url: string): void {
  approvedHostUnload = true;
  try {
    window.location.assign(url);
  } catch (error) {
    approvedHostUnload = false;
    throw error;
  }
}
let uiHistoryIndex = initializeUiHistory();
let undoingHistoryMove = false;
let acceptingHistoryMove = false;
function initializeUiHistory(): number {
  const current = window.history.state;
  const index = typeof current?.__manatosUiIndex === 'number' ? current.__manatosUiIndex : 0;
  window.history.replaceState({ ...(current ?? {}), __manatosUiIndex: index }, '');
  return index;
}
function commitUiHistory(url: string, replace: boolean): void {
  if (!replace) uiHistoryIndex++;
  const value = { ...(window.history.state ?? {}), __manatosUiIndex: uiHistoryIndex };
  if (replace) window.history.replaceState(value, '', url);
  else window.history.pushState(value, '', url);
}
function dirtyEntryPresentation() {
  const level = dirtyEntryInUiChain(state.context);
  const language = state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN';
  return level
    ? entryDirtyClosePresentation(level, language)
    : { ownerLabel: language === 'EL' ? 'Ρυθμίσεις' : 'Configuration' };
}
function entryHasUnsavedChanges(): boolean {
  return (
    dirtyEntryInUiChain(state.context) !== null ||
    mountedAdministrationPage?.hasUnsavedChanges?.() === true
  );
}
window.addEventListener('beforeunload', (event) => {
  if (approvedHostUnload || !entryHasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

/** Keep the one application CTX and open popups alive for internal page navigation. */
function navigateUiPage(url: string, replace = false, approved = false): void {
  const destination = new URL(url, window.location.origin);
  if (
    !approved &&
    (destination.origin !== window.location.origin ||
      destination.pathname !== window.location.pathname) &&
    entryHasUnsavedChanges()
  ) {
    dirtyClose.requestExit(
      entryHasUnsavedChanges,
      () => navigateUiPage(url, replace, true),
      authSurfaceHost,
      dirtyEntryPresentation(),
    );
    return;
  }
  const target = new URL(url, window.location.origin);
  if (
    target.origin !== window.location.origin ||
    !resolveUiPageRoute(target.pathname, state.company)
  ) {
    navigateHostRoute(target.href);
    return;
  }
  if (
    (isUiEntityPageRoute(resolveUiPageRoute(target.pathname, state.company)) ||
      resolveUiPageRoute(target.pathname, state.company)?.kind === 'administration') &&
    !accountSession.authenticated
  ) {
    pendingProtectedPage = target.pathname + target.search + target.hash;
    if (window.location.pathname !== '/') navigateUiPage('/', true);
    if (accountSession.status === 'anonymous') requestProtectedSignIn();
    return;
  }
  commitUiHistory(target.pathname + target.search + target.hash, replace);
  updateActiveWorkspaceNavigation();
  closeTopLevelShellMenus();
  void refreshPagePresentation();
}

/** Open Sign In on demand, and navigate only after the Flow has disposed its popup. */
function requestProtectedSignIn(): void {
  if (
    !pendingProtectedPage ||
    protectedSignInInFlight ||
    systemOutage ||
    accountSession.logoutPending ||
    accountSession.status !== 'anonymous'
  )
    return;
  protectedSignInInFlight = true;
  void authFlows
    .run('auth.signin')
    .then(() => {
      if (accountSession.authenticated && pendingProtectedPage) {
        const destination = pendingProtectedPage;
        pendingProtectedPage = null;
        navigateUiPage(destination);
      } else pendingProtectedPage = null;
    })
    .catch((error: unknown) => {
      pendingProtectedPage = null;
      reportDiagnostic({ kind: 'protected-navigation-signin', message: String(error) });
    })
    .finally(() => {
      protectedSignInInFlight = false;
    });
}

function settleProtectedPageRequest(): void {
  if (protectedSignInInFlight) return;
  if (pendingProtectedPage) {
    if (accountSession.authenticated) {
      const destination = pendingProtectedPage;
      pendingProtectedPage = null;
      navigateUiPage(destination, true);
    } else if (accountSession.status === 'anonymous') {
      if (window.location.pathname !== '/') navigateUiPage('/', true);
      requestProtectedSignIn();
    }
  } else if (
    accountSession.status === 'anonymous' &&
    (isUiEntityPageRoute(resolveUiPageRoute(window.location.pathname, state.company)) ||
      resolveUiPageRoute(window.location.pathname, state.company)?.kind === 'administration')
  ) {
    // Existing authenticated List lost its session: return Home without unsolicited Sign In.
    navigateUiPage('/', true);
  }
}

/**
 * Navigation/session boundary, as in NG1's AppComponent.signOut().
 * A sign-out revokes the visible identity synchronously and returns to Home;
 * the trusted Node host alone performs the cookie mutation.
 */
function signOut(approved = false): void {
  if (accountSession.logoutPending) return;
  closeTopLevelShellMenus();
  accountMenuOpen = false;
  if (!approved && entryHasUnsavedChanges()) {
    dirtyClose.requestExit(
      entryHasUnsavedChanges,
      () => signOut(true),
      authSurfaceHost,
      dirtyEntryPresentation(),
    );
    return;
  }
  if (window.location.pathname !== '/') navigateUiPage('/', true, true);
  void accountSession.signOut().catch((error: unknown) => {
    reportDiagnostic({ kind: 'signout', message: String(error) });
  });
}

function selectNavigation(item: UiNavigationItem): void {
  if (systemOutage) return;
  closeTopLevelShellMenus();

  // NG1 treats the metadata logout URL as an application command, not a
  // route. A full-page GET cannot revoke the trusted UI-host session.
  if (item.id === 'logout' || item.url === '/auth/logout') {
    signOut();
    return;
  }

  if (item.action === 'open-preferences') {
    openPreferences();
    return;
  }

  if (item.url) navigateUiPage(item.url);
}

function announceMenuOpening(): void {
  window.dispatchEvent(new Event('manatos:navigation-menu-open'));
}

function closeTopLevelShellMenus(except?: HTMLElement): void {
  document
    .querySelectorAll<HTMLElement>(
      '[data-platform-menu], [data-primary-navigation-menu], [data-shell-menu-popup]',
    )
    .forEach((menu) => {
      if (menu !== except) menu.hidden = true;
    });

  document
    .querySelectorAll<HTMLElement>(
      '[data-platform-toggle], [data-primary-navigation-toggle], [data-shell-menu-toggle]',
    )
    .forEach((toggle) => {
      const controlledMenu =
        toggle
          .closest('[data-platform-selector]')
          ?.querySelector<HTMLElement>('[data-platform-menu]') ??
        toggle
          .closest('[data-primary-navigation-dropdown]')
          ?.querySelector<HTMLElement>('[data-primary-navigation-menu]') ??
        toggle.closest('[data-shell-menu]')?.querySelector<HTMLElement>('[data-shell-menu-popup]');

      if (controlledMenu !== except) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
}

const unsubscribeState = state.subscribe((change) => {
  switch (change) {
    case 'platform':
      void accountSession.platformChanged();
      renderPlatform();
      void refreshPagePresentation();
      break;

    case 'navigation':
      renderNavigation();
      break;

    case 'runtime':
      // NG1's debugger eligibility is a computed projection of runtime CTX.
      // Recheck it even when developerMode/grants change without a new session
      // callback. Do not rebuild PageHost or Documentation on this notification.
      enforceDebuggerPermissions();
      break;

    case 'preferences':
      applyTheme(state.preferences.theme);
      applyDocumentFontScale(document, state.preferences.fontScalePercent);
      // Open semantic popups retain their own FontScale.
      renderPrimaryNavigationState();
      break;

    case 'language':
      refreshShellControlLabels();
      accountSession.refreshPresentation();
      authSurfaceHost.refreshLanguage();
      renderAuthNotice(accountSession.notice);
      renderSystemOutage();
      renderNavigation();
      void refreshPagePresentation();
      break;

    case 'uiState':
      applyWorkspaceNavigationState();
      break;
  }
});

renderNavigation();
applyTheme(state.preferences.theme);
applyDocumentFontScale(document, state.preferences.fontScalePercent);
applyWorkspaceNavigationState();
// The server initially emits English; browser preferences may restore Greek.
if (state.currentLanguageId.toLowerCase() === 'el') void refreshPagePresentation();
const initialSessionRestore = accountSession.restore();

// The OAuth redirect conveys only a fixed result code, never a provider token.
// Remove it before any subsequent navigation or diagnostics capture the URL.
const oauthResult = new URLSearchParams(window.location.search).get('externalAuth');
if (oauthResult) {
  const url = new URL(window.location.href);
  url.searchParams.delete('externalAuth');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  const descriptions: Readonly<Record<string, readonly [string, string]>> = {
    unlinked: [
      'This provider identity is not linked to an account. Register or link it explicitly.',
      'Αυτός ο εξωτερικός λογαριασμός δεν είναι συνδεδεμένος. Εγγραφείτε ή συνδέστε τον ρητά.',
    ],
    cancelled: ['External sign-in was cancelled.', 'Η εξωτερική σύνδεση ακυρώθηκε.'],
    expired: ['External sign-in expired. Try again.', 'Η εξωτερική σύνδεση έληξε. Δοκιμάστε ξανά.'],
    failed: ['External sign-in failed.', 'Η εξωτερική σύνδεση απέτυχε.'],
    unavailable: [
      'External sign-in is temporarily unavailable.',
      'Η εξωτερική σύνδεση δεν είναι προσωρινά διαθέσιμη.',
    ],
    'not-configured': [
      'The external provider is not configured.',
      'Ο εξωτερικός πάροχος δεν έχει ρυθμιστεί.',
    ],
    'already-signed-in': [
      'Sign out before switching accounts.',
      'Αποσυνδεθείτε πριν αλλάξετε λογαριασμό.',
    ],
    limited: [
      'Too many external sign-in attempts.',
      'Υπερβολικά πολλές προσπάθειες εξωτερικής σύνδεσης.',
    ],
    unsupported: [
      'The external provider is unsupported.',
      'Ο εξωτερικός πάροχος δεν υποστηρίζεται.',
    ],
  };
  const message = descriptions[oauthResult];
  if (message) {
    // NG1 presents callback failures through its canonical authNotice after
    // restoring the trusted session. The same EJS notice can now be dismissed,
    // localized, superseded by a session transition, or cleared on sign-in.
    void initialSessionRestore.finally(() => {
      if (accountSession.authenticated) return;
      accountSession.presentNotice({
        severity: oauthResult === 'failed' || oauthResult === 'expired' ? 'danger' : 'warning',
        message: message[0],
        localizedMessage: message,
        retry: false,
      });
    });
  }
}

// Registration verification returns a fixed status, never a credential. Consume the
// status from the URL and display the outcome alongside the restored session.
const emailVerified = new URLSearchParams(window.location.search).get('emailVerified');
if (emailVerified) {
  const url = new URL(window.location.href);
  url.searchParams.delete('emailVerified');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  const messages: Readonly<Record<string, readonly [string, string]>> = {
    success: [
      'Your email has been verified. You are now signed in.',
      'Το email σας επιβεβαιώθηκε. Έχετε πλέον συνδεθεί.',
    ],
    already: ['This email has already been verified.', 'Αυτό το email έχει ήδη επιβεβαιωθεί.'],
    invalid: [
      'The verification link is invalid or has expired.',
      'Ο σύνδεσμος επιβεβαίωσης δεν είναι έγκυρος ή έχει λήξει.',
    ],
    failed: [
      'Email verification could not be completed. Please try again.',
      'Η επιβεβαίωση email δεν ολοκληρώθηκε. Δοκιμάστε ξανά.',
    ],
  };
  const message = messages[emailVerified];
  if (message) {
    const notice = document.createElement('p');
    notice.className = 'ejs1-oauth-notice';
    notice.dataset.ejs1VerificationNotice = '';
    const update = () => {
      notice.textContent = state.currentLanguageId.toLowerCase() === 'el' ? message[1] : message[0];
    };
    update();
    document.querySelector('[data-ejs1-auth-actions]')?.after(notice);
    const unsubscribe = state.subscribe((change) => {
      if (change === 'language') update();
    });
    window.addEventListener('pagehide', () => unsubscribe(), { once: true });
  }
}

// Consume emailed one-time credentials without retaining them in browser history.
if (window.location.pathname === '/auth/password/reset') {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  // The token is one-time secret material: erase the URL synchronously, then
  // replace the server-rendered reset-link route with the ordinary home page.
  navigateUiPage('/', true);
  void authFlows.run('auth.resetPassword', { token }).catch((error: unknown) => {
    reportDiagnostic({ kind: 'password-reset-flow', message: String(error) });
  });
}

// Native UIS transients and host navigation menus are mutually exclusive.
window.addEventListener('manatos:transient-menu-open', () => {
  closeTopLevelShellMenus();
  if (accountMenuOpen) {
    accountMenuOpen = false;
    accountSession.refreshPresentation();
  }
});

// Match NG1's document-level menu dismissal without intercepting modal Escape.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeTopLevelShellMenus();
  if (accountMenuOpen) {
    accountMenuOpen = false;
    accountSession.refreshPresentation();
  }
});

document.querySelector('[data-preferences-cancel]')?.addEventListener('click', closePreferences);
document.querySelectorAll<HTMLInputElement>('[data-ui-theme-option]').forEach((option) => {
  option.addEventListener('change', () => {
    if (!option.checked) return;

    const preview = document.querySelector<HTMLElement>('[data-ui-theme-preview]');

    if (preview) {
      preview.dataset.previewTheme = normalizeUiTheme(option.value);
    }
  });
});
document.querySelector('[data-preferences-save]')?.addEventListener('click', () => {
  const selected = document.querySelector<HTMLInputElement>('[data-ui-theme-option]:checked');
  state.savePreferences(normalizeUiTheme(selected?.value));
  closePreferences();
});

document.addEventListener('click', (event) => {
  const accountToggle = (event.target as Element).closest('[data-ejs1-account-toggle]');
  if (accountToggle) {
    event.preventDefault();
    if (!accountMenuOpen) {
      closeTopLevelShellMenus();
      announceMenuOpening();
    }
    accountMenuOpen = !accountMenuOpen;
    accountSession.refreshPresentation();
    return;
  }
  if (accountMenuOpen && !(event.target as Element).closest('[data-ejs1-account-menu]')) {
    accountMenuOpen = false;
    accountSession.refreshPresentation();
  }
  const authFlow = (event.target as Element).closest<HTMLElement>('[data-ejs1-auth-flow]')?.dataset[
    'ejs1AuthFlow'
  ];
  if (authFlow) {
    event.preventDefault();
    if (systemOutage || accountSession.logoutPending) return;
    void authFlows
      .run(authFlow)
      .catch((error: unknown) => reportDiagnostic({ kind: 'auth-flow', message: String(error) }));
    return;
  }
  if ((event.target as Element).closest('[data-ejs1-auth-retry]')) {
    event.preventDefault();
    accountSession.retry();
    return;
  }
  if ((event.target as Element).closest('[data-ejs1-auth-dismiss]')) {
    event.preventDefault();
    accountSession.dismissNotice();
    return;
  }
  if ((event.target as Element).closest('[data-ejs1-outage-retry]')) {
    event.preventDefault();
    void retrySystemOutage();
    return;
  }
  if ((event.target as Element).closest('[data-ejs1-change-password]')) {
    event.preventDefault();
    if (accountSession.authenticated) {
      accountMenuOpen = false;
      accountSession.refreshPresentation();
      void authFlows.run('auth.changePassword').catch((error: unknown) => {
        reportDiagnostic({ kind: 'auth', message: String(error) });
      });
    }
    return;
  }
  if ((event.target as Element).closest('[data-ejs1-signout]')) {
    event.preventDefault();
    signOut();
    return;
  }

  const target = event.target as HTMLElement;

  const homeAuthFlow =
    target.closest<HTMLElement>('[data-home-auth-flow]')?.dataset['homeAuthFlow'];
  if (homeAuthFlow === 'auth.signin' || homeAuthFlow === 'auth.register') {
    event.preventDefault();
    if (!systemOutage && accountSession.status === 'anonymous') {
      void authFlows.run(homeAuthFlow).catch((error: unknown) => {
        reportDiagnostic({ kind: 'home-auth-flow', message: String(error) });
      });
    }
    return;
  }

  if (target.closest('[data-workspace-navigation-collapse]')) {
    state.setWorkspaceNavigationCollapsed(true);
    return;
  }

  if (target.closest('[data-workspace-navigation-restore]')) {
    state.setWorkspaceNavigationCollapsed(false);
    return;
  }

  const platformOption = target.closest<HTMLElement>('[data-platform-id], [data-platform-none]');

  if (platformOption) {
    event.preventDefault();
    if (systemOutage) return;
    closeTopLevelShellMenus();
    state.selectPlatform(
      platformOption.hasAttribute('data-platform-none')
        ? null
        : (platformOption.dataset['platformId'] ?? null),
    );
    return;
  }

  const navigationId = target.closest<HTMLElement>('[data-navigation-id]')?.dataset['navigationId'];

  if (navigationId) {
    // Preserve native open-in-new-tab and modified-click behavior for links.
    if (
      target.closest('a[href]') &&
      (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    ) {
      return;
    }
    event.preventDefault();
    const item = resolveNavigationItem(navigationId);
    if (item) selectNavigation(item);
    return;
  }

  if (target.closest('[data-documentation-open]')) {
    if (systemOutage) return;
    closeTopLevelShellMenus();
    navigateUiPage('/documentation');

    return;
  }

  if (target.closest('[data-surface-action="reveal-page-ctx"]')) {
    revealPopupDebuggerPath(mountedEntryPage?.levelPath ?? 'ctx.ui.level', false, false);
    return;
  }
  if (target.closest('[data-surface-action="reveal-page-flow"]')) {
    const path = `${mountedEntryPage?.levelPath ?? 'ctx.ui.level'}.flow`;
    if (state.context.get(path) !== undefined) revealPopupDebuggerPath(path, false, false);
    return;
  }
  if (target.closest('[data-surface-action="open-documentation-popup"]')) {
    documentationPopupManager?.open(
      documentationPopupState(
        pageContentHost.getDocumentationLocation() ?? currentDocumentationLocation(),
        state.preferences.fontScalePercent,
      ),
    );
    return;
  }

  if (target.closest('[data-font-scale-reset]')) {
    state.setFontScalePercent(100);
    return;
  }

  const fontScaleDelta =
    target.closest<HTMLElement>('[data-font-scale-delta]')?.dataset.fontScaleDelta;

  if (fontScaleDelta) {
    const delta = Number(fontScaleDelta);
    if (Number.isFinite(delta)) state.adjustFontScale(delta);
    return;
  }

  const language = target.closest<HTMLElement>('[data-language]')?.dataset['language'];

  if (language) {
    closeTopLevelShellMenus();
    state.selectLanguage(language);
    return;
  }

  const developerAction =
    target.closest<HTMLElement>('[data-developer-action]')?.dataset.developerAction;

  if (developerAction) {
    if (!debuggerAllowed()) return;
    closeTopLevelShellMenus();
    if (developerAction === 'debug-tools') debuggerHost?.toggle();
    else if (developerAction === 'debug-diagnostics') {
      state.setDebugDiagnosticsVisible(!state.debugDiagnosticsVisible);
    }
    return;
  }

  const platformToggle = target.closest<HTMLElement>('[data-platform-toggle]');
  const platformSelector = target.closest<HTMLElement>('[data-platform-selector]');

  if (platformToggle && platformSelector) {
    event.preventDefault();
    event.stopPropagation();

    const menu = platformSelector.querySelector<HTMLElement>('[data-platform-menu]');
    if (!menu) return;

    const opening = menu.hidden;
    if (opening) announceMenuOpening();
    closeTopLevelShellMenus(opening ? menu : undefined);
    menu.hidden = !opening;
    platformToggle.setAttribute('aria-expanded', String(opening));
    return;
  }

  const navigationToggle = target.closest<HTMLElement>('[data-primary-navigation-toggle]');
  const navigationDropdown = target.closest<HTMLElement>('[data-primary-navigation-dropdown]');

  if (navigationToggle && navigationDropdown) {
    event.preventDefault();
    event.stopPropagation();

    const menu = navigationDropdown.querySelector<HTMLElement>('[data-primary-navigation-menu]');
    if (!menu) return;

    const opening = menu.hidden;
    if (opening) announceMenuOpening();
    closeTopLevelShellMenus(opening ? menu : undefined);
    menu.hidden = !opening;
    navigationToggle.setAttribute('aria-expanded', String(opening));
    return;
  }

  if (target.closest('[data-navigation-parent]')) {
    event.preventDefault();
    return;
  }

  const shellMenuToggle = target.closest<HTMLElement>('[data-shell-menu-toggle]');
  const shellMenu = target.closest<HTMLElement>('[data-shell-menu]');

  if (shellMenuToggle && shellMenu) {
    if (shellMenu.dataset.shellMenu === 'developer' && !debuggerAllowed()) return;
    event.preventDefault();
    event.stopPropagation();

    const menu = shellMenu.querySelector<HTMLElement>('[data-shell-menu-popup]');
    if (!menu) return;

    const opening = menu.hidden;
    if (opening) announceMenuOpening();
    closeTopLevelShellMenus(opening ? menu : undefined);
    menu.hidden = !opening;
    shellMenuToggle.setAttribute('aria-expanded', String(opening));
    if (opening && shellMenu.dataset.shellMenu === 'language') positionNavigationLanguageMenu(menu);
    return;
  }

  closeTopLevelShellMenus();
});

// Keep an open language dropdown within the viewport on a browser resize.
window.addEventListener('resize', () => {
  const menu = document.querySelector<HTMLElement>('.primary-navigation-language-menu');
  if (menu) positionNavigationLanguageMenu(menu);
});

// NG1's PageHost uses the History API for local routes. Preserve the live EJS
// session/CTX and avoid a full SSR replacement for internal anchor navigation.
document.addEventListener('click', (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) return;
  if (anchor.matches('.brand[href="/"]')) return; // Normal browser reload, even during outage.
  if (url.pathname === '/auth/logout') {
    event.preventDefault();
    if (!systemOutage) signOut();
    return;
  }
  // Even ordinary same-origin host links must pass through the semantic
  // dirty-close decision before triggering a full document navigation.
  event.preventDefault();
  if (!systemOutage) navigateUiPage(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', () => {
  const targetIndex = window.history.state?.__manatosUiIndex;
  if (undoingHistoryMove) {
    undoingHistoryMove = false;
    return;
  }
  if (acceptingHistoryMove) {
    acceptingHistoryMove = false;
    if (typeof targetIndex === 'number') uiHistoryIndex = targetIndex;
  } else if (entryHasUnsavedChanges()) {
    const destination = window.location.pathname + window.location.search + window.location.hash;
    const delta = typeof targetIndex === 'number' ? uiHistoryIndex - targetIndex : 0;
    if (delta) {
      undoingHistoryMove = true;
      window.history.go(delta);
      dirtyClose.requestExit(
        entryHasUnsavedChanges,
        () => {
          acceptingHistoryMove = true;
          window.history.go(-delta);
        },
        authSurfaceHost,
        dirtyEntryPresentation(),
      );
    } else {
      window.history.replaceState(
        { ...(window.history.state ?? {}), __manatosUiIndex: uiHistoryIndex },
        '',
        presentedPagePath,
      );
      dirtyClose.requestExit(
        entryHasUnsavedChanges,
        () => navigateUiPage(destination, false, true),
        authSurfaceHost,
        dirtyEntryPresentation(),
      );
    }
    return;
  } else if (typeof targetIndex === 'number') {
    uiHistoryIndex = targetIndex;
  }
  updateActiveWorkspaceNavigation();
  // Documentation owns its inner history while the outer route is unchanged.
  if (window.location.pathname === presentedPagePath) return;
  void refreshPagePresentation();
});

window.addEventListener('error', (event) => {
  reportDiagnostic({
    type: 'browser-error',
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error instanceof Error ? event.error.stack : undefined,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;

  reportDiagnostic({
    type: 'unhandled-rejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

const unsubscribeBootstrapStatus = bootstrapRuntime.subscribe((bootstrap) => {
  if (bootstrap.unavailable && !systemOutage) {
    systemOutage = true;
    accountSession.blockForOutage();
    closeTopLevelShellMenus();
    systemRetryStatus = '';
    renderSystemOutage();
  } else if (!systemOutage && bootstrap.consecutiveFailures > 0) {
    // Never expose stale grants during a transient API outage.
    accountSession.blockForTransportFailure();
  } else if (!systemOutage && bootstrap.serverAlive && accountSession.status === 'unverified') {
    accountSession.retry();
  }

  const apiStatus = document.getElementById('api-status');
  const bootstrapStatus = document.getElementById('bootstrap-status');

  if (apiStatus) {
    // Match NG1 HeaderStatus: checking, retrying (n/3), online, offline.
    // A latched outage always remains offline until explicit recovery.
    const apiState =
      systemOutage || bootstrap.unavailable
        ? 'offline'
        : systemRetrying
          ? 'checking'
          : bootstrap.consecutiveFailures > 0
            ? 'retrying'
            : bootstrap.ready && bootstrap.serverAlive
              ? 'online'
              : 'checking';
    const caption =
      apiState === 'retrying' ? `retrying (${bootstrap.consecutiveFailures}/3)` : apiState;
    if (apiStatus.firstChild) apiStatus.firstChild.textContent = `API ${caption}`;
    for (const status of ['is-online', 'is-offline', 'is-retrying', 'is-checking'])
      apiStatus.classList.toggle(status, status === `is-${apiState}`);
    const indicator = apiStatus.querySelector('.header-api-indicator');
    indicator?.classList.toggle('is-online', apiState === 'online');
    indicator?.classList.toggle('is-spinning', apiState === 'checking' || apiState === 'retrying');
  }

  if (bootstrapStatus) {
    bootstrapStatus.textContent = `Bootstrap: ${bootstrap.ready ? 'ready' : 'not ready'}`;
  }
});

const onPageHide = (event: PageTransitionEvent) => {
  if (event.persisted) return;

  ++pagePresentationRevision; // Cancel in-flight translations before unmounting.
  authSurfaceHost.closeDescendants('ctx.ui.level');
  mountedListPage?.destroy();
  mountedListPage = null;
  mountedEntryPage?.destroy();
  mountedEntryPage = null;
  mountedAdministrationPage?.destroy();
  mountedAdministrationPage = null;
  mountedAdministrationPath = null;
  pageHost.destroy();
  accountSession.destroy();
  authSurfaceHost.destroy();
  document.body.classList.remove('ejs-popup-debugger-foreground');
  documentationPopupManager?.destroy();

  window.removeEventListener('pagehide', onPageHide);
  unsubscribeState();
  unsubscribeDiagnosticsMenu();
  unsubscribeBootstrapStatus();
  bootstrapRuntime.stop();
  debuggerHost?.destroy();
  pageContentHost.destroy();
  diagnosticsHost.destroy();
  state.destroy();
};

window.addEventListener('pagehide', onPageHide);

void bootstrapRuntime.start().catch((error: unknown) => {
  reportDiagnostic({
    type: 'bootstrap-start-failure',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});
