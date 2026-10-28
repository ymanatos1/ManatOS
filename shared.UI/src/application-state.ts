import {
  ContextTreeRuntime,
  MANATOS_COMPANY,
  createEffectiveRuntimeContext,
  createHostSystemContext,
  createRuntimeCompanyContext,
  createRuntimeSemanticContext,
  resolvePlatform,
  resolveMetadataText,
  type MetadataLanguage,
  type CompanyInfo,
  type ManatOSRuntimeRootContext,
  type ManatOSUserContext,
  type RuntimeSemanticProjection,
  type SysPlatform,
} from '@manatos/shared';

import {
  runtimeUserFromAuthorization,
  runtimeUserWithoutPlatform,
  type UiAuthorizationContextProjection,
} from './authorization/ui-authorization.js';
import { createUiNavigationState, type UiNavigationState } from './navigation/ui-navigation.js';
import { UiDebuggerState } from './debugger/debugger-ui-state.js';
import { UiDiagnosticsRuntime } from './diagnostics/ui-diagnostics-runtime.js';
import {
  UI_LANGUAGE_CATALOGUE,
  resolveUiLanguage,
  type UiLanguageCatalogue,
  type UiLanguageDefinition,
} from './multilingual/ui-language.js';
import {
  normalizeUiLanguage,
  UI_DOCUMENTATION_REMEMBERED_PAGE_LIMIT,
  UI_WINDOW_IDS,
  type UiPreferenceValues,
  type UiTheme,
  type UiDocumentationPopupEndurance,
  type UiDocumentationRememberedPage,
  type UiWindowPlacement,
} from './preferences/ui-preferences.js';
import type { DocumentationLocation } from './pages/documentation/documentation-browser.js';
import type { UiStateRuntime } from './state/ui-state-runtime.js';
import type { UiDebuggerMainView } from './state/ui-tab-state.js';

export interface UiMenuItem {
  id: string;
  label: string;
  icon: string;
  description: string;
  active?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
  children?: readonly UiMenuItem[];
}

export type ApplicationStateChange =
  'platform' | 'runtime' | 'navigation' | 'preferences' | 'language' | 'uiState';

export type ApplicationStateListener = (
  change: ApplicationStateChange,
  state: ApplicationState,
) => void;

export class ApplicationState {
  readonly debuggerState: UiDebuggerState;
  readonly diagnostics: UiDiagnosticsRuntime;
  readonly company: CompanyInfo = MANATOS_COMPANY;

  readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>;

  private readonly listeners = new Set<ApplicationStateListener>();
  private readonly runtimeSemanticCache = new Map<string, RuntimeSemanticProjection>();
  private readonly projectedSemanticPaths = new Set<string>();
  private readonly unsubscribeUiState: () => void;

  private navigationValue: UiNavigationState;
  /** API-returned, current-platform entity read grants, never inferred from entity presence. */
  private navigationEntityCapabilities: UiAuthorizationContextProjection['entities'] = {};
  private previousPreferences: UiPreferenceValues;
  private readonly languageCatalogueValue: UiLanguageCatalogue = UI_LANGUAGE_CATALOGUE;

  constructor(
    readonly clientKind: string,
    readonly clientVersion: string,
    readonly uiState: UiStateRuntime,
  ) {
    this.diagnostics = new UiDiagnosticsRuntime(uiState);
    this.debuggerState = new UiDebuggerState(uiState);
    const currentPlatform = this.resolveStoredPlatform(uiState.tab.platformId);

    this.context = new ContextTreeRuntime<ManatOSRuntimeRootContext>(
      this.createContextRoot(currentPlatform),
    );

    this.context.setDiagnosticSink((message) => {
      this.diagnostics.reportExpressionDiagnostic({
        phase: 'evaluate',
        timestamp: new Date().toISOString(),
        message,
        variablePath: 'ctx',
      });
    });
    this.registerRuntimeSemantics();

    this.navigationValue = createUiNavigationState(
      this.context,
      this.diagnostics.expressionDiagnosticSink,
      {},
      this.currentLanguageId.toUpperCase() as MetadataLanguage,
    );
    this.reconcilePreferredLanguage();
    this.previousPreferences = uiState.preferences;

    this.unsubscribeUiState = uiState.subscribe((change) => {
      if (change === 'tab') {
        this.applyUiTabState();
        this.emit('uiState');
        return;
      }

      if (change === 'preferences') {
        const next = this.uiState.preferences;
        const themeChanged = next.theme !== this.previousPreferences.theme;
        const languageChanged = next.language !== this.previousPreferences.language;
        const fontScaleChanged =
          next.fontScalePercent !== this.previousPreferences.fontScalePercent;
        this.previousPreferences = next;

        if (themeChanged || fontScaleChanged) this.emit('preferences');
        if (languageChanged) {
          if (this.reconcilePreferredLanguage()) return;
          this.reprojectNavigation();
          this.emit('language');
          this.emit('navigation');
        }
        return;
      }

      if (change === 'browser') this.emit('uiState');
    });
  }

  get versionLabel(): string {
    return `v${this.clientVersion}.0.0`;
  }

  get tagline(): string {
    return resolveMetadataText(
      this.company.branding.tagline,
      this.currentLanguageId.toUpperCase() as MetadataLanguage,
    );
  }

  get currentPlatform(): SysPlatform | null {
    const platformId = this.currentPlatformId;
    return platformId === null ? null : resolvePlatform(this.company, platformId);
  }

  get currentPlatformId(): string | null {
    return this.context.root().company.currentPlatform;
  }

  get navigation(): UiNavigationState {
    return this.navigationValue;
  }

  get platformNavigation() {
    return this.navigationValue.platform;
  }

  get primaryNavigation() {
    return this.navigationValue.primary;
  }

  get workspaceNavigation() {
    return this.navigationValue.workspace;
  }

  get preferences(): UiPreferenceValues {
    return this.uiState.preferences;
  }

  get languages(): readonly UiLanguageDefinition[] {
    return this.languageCatalogueValue.languages;
  }

  get currentLanguageId(): string {
    return resolveUiLanguage(this.languageCatalogueValue, this.uiState.preferences.language).id;
  }

  get currentLanguage(): UiLanguageDefinition {
    return resolveUiLanguage(this.languageCatalogueValue, this.uiState.preferences.language);
  }

  get workspaceNavigationCollapsed(): boolean {
    return this.uiState.tab.shell.workspaceNavigationCollapsed;
  }

  get debuggerVisible(): boolean {
    return this.debuggerState.visible;
  }

  get debugDiagnosticsVisible(): boolean {
    return this.diagnostics.enabled;
  }

  get debugMenu(): readonly UiMenuItem[] {
    return [
      {
        id: 'debug-tools',
        label: 'Show/hide Debugging tools',
        icon: 'bi-tools',
        description: 'Show or hide the Debugging Tools dock',
        checked: this.debuggerVisible,
      },
      {
        id: 'debug-diagnostics',
        label: 'Show CTX errors/warnings',
        icon: 'bi-exclamation-triangle',
        description: 'Show CTX and expression warnings/errors as developer notifications',
        checked: this.debugDiagnosticsVisible,
        separatorBefore: true,
      },
    ];
  }

  get debuggerActiveView(): UiDebuggerMainView {
    return this.debuggerState.activeView;
  }

  get developerToolsWidth(): number | null {
    return this.debuggerState.browser.developerToolsWidth;
  }

  get globalCliDetached(): boolean {
    return this.uiState.preferencesDocument.endurance.globalCliDetached;
  }
  get globalCliFontScalePercent(): number {
    return this.uiState.preferencesDocument.endurance.globalCliFontScalePercent;
  }
  get globalCliWindowPlacement(): UiWindowPlacement | null {
    return this.uiState.windowPlacement(UI_WINDOW_IDS.globalCli);
  }

  get debuggerWindowPlacement(): UiWindowPlacement | null {
    return this.uiState.windowPlacement(UI_WINDOW_IDS.debugger);
  }

  get documentationWindowPlacement(): UiWindowPlacement | null {
    return this.uiState.documentationPopupEndurance?.placement ?? null;
  }

  get documentationPopupEndurance(): UiDocumentationPopupEndurance | null {
    return this.uiState.documentationPopupEndurance;
  }

  get documentationRememberedPages(): readonly UiDocumentationRememberedPage[] {
    return this.uiState.documentationRememberedPages;
  }

  get cliHistory() {
    return this.uiState.cliHistory;
  }

  subscribe(listener: ApplicationStateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.unsubscribeUiState();
    this.diagnostics.destroy();
    this.uiState.destroy();
    this.listeners.clear();
  }

  selectPlatform(platformId: string | null): void {
    const platform = this.resolveSelectedPlatform(platformId);
    const selectedId = platform?.id ?? null;
    if (this.currentPlatformId === selectedId) return;

    this.uiState.updateSeedable((current) => ({ ...current, platformId: selectedId }));
  }

  savePreferences(theme: UiTheme): void {
    this.uiState.saveTheme(theme);
  }

  setFontScalePercent(fontScalePercent: number): void {
    this.uiState.saveFontScalePercent(fontScalePercent);
  }

  adjustFontScale(deltaPercent: number): void {
    this.setFontScalePercent(this.preferences.fontScalePercent + deltaPercent);
  }

  selectLanguage(language: string): void {
    const languageId = normalizeUiLanguage(language);
    if (!this.languageCatalogueValue.languages.some((candidate) => candidate.id === languageId)) {
      return;
    }

    this.uiState.selectLanguage(languageId);
  }

  setWorkspaceNavigationCollapsed(collapsed: boolean): void {
    this.uiState.updateSeedable((current) => ({
      ...current,
      shell: { ...current.shell, workspaceNavigationCollapsed: collapsed },
    }));
  }

  setDebuggerVisible(visible: boolean): void {
    this.debuggerState.setVisible(visible);
  }

  setDebugDiagnosticsVisible(visible: boolean): void {
    this.diagnostics.setEnabled(visible);
  }

  selectDebuggerView(activeView: UiDebuggerMainView): void {
    this.debuggerState.selectView(activeView);
  }

  saveDeveloperToolsWidth(width: number | null): void {
    this.debuggerState.saveBrowserPreferences({ developerToolsWidth: width });
  }

  saveGlobalCliDetached(detached: boolean): void {
    this.uiState.saveGlobalCliDetached(detached);
  }
  saveGlobalCliFontScalePercent(percent: number): void {
    this.uiState.saveGlobalCliFontScalePercent(percent);
  }
  saveGlobalCliWindowPlacement(placement: UiWindowPlacement | null): void {
    this.uiState.saveWindowPlacement(UI_WINDOW_IDS.globalCli, placement);
  }

  saveDebuggerWindowPlacement(placement: UiWindowPlacement | null): void {
    this.uiState.saveWindowPlacement(UI_WINDOW_IDS.debugger, placement);
  }

  saveDocumentationWindowPlacement(placement: UiWindowPlacement | null): void {
    if (!placement) {
      this.uiState.saveDocumentationPopupEndurance(null);
      return;
    }

    this.uiState.saveDocumentationPopupEndurance({ placement });
  }

  saveDocumentationPopupEndurance(endurance: UiDocumentationPopupEndurance | null): void {
    this.uiState.saveDocumentationPopupEndurance(endurance);
  }

  rememberDocumentationPage(location: DocumentationLocation): void {
    const path = location.path.trim();
    if (!path) return;
    const anchor = location.anchor.trim();
    const next = [
      { path, anchor },
      ...this.uiState.documentationRememberedPages.filter(
        (page) => page.path !== path || page.anchor !== anchor,
      ),
    ].slice(0, UI_DOCUMENTATION_REMEMBERED_PAGE_LIMIT);
    this.uiState.saveDocumentationRememberedPages(next);
  }

  /** Advisory UI capabilities supplied by the authenticated API authorization projection.
   * Never infer grants from the entity's presence in metadata/navigation.
   */
  entityCapabilitiesFor(entityKey: string): Readonly<Record<string, boolean>> {
    return this.navigationEntityCapabilities[entityKey] ?? {};
  }

  /**
   * Replace the effective authenticated-user projection without duplicating it
   * outside CTX. `$user` resolves to `$runtime.user` without a root mirror.
   */
  setRuntimeUser(
    user: ManatOSUserContext | null,
    entityCapabilities: UiAuthorizationContextProjection['entities'] = {},
  ): void {
    this.navigationEntityCapabilities = entityCapabilities;
    const root = this.context.root();
    const runtime = Object.freeze({ ...root.runtime, user });
    const previousPreferenceOwner = this.uiState.preferenceOwnerId;

    this.context.setRootMembers({ runtime });
    this.registerRuntimeSemantics();
    this.uiState.setPreferenceOwner(runtimeUserPreferenceOwnerId(user));
    if (this.uiState.preferenceOwnerId !== previousPreferenceOwner) this.diagnostics.clear();
    this.reprojectNavigation();

    this.emit('runtime');
    this.emit('navigation');
  }

  /** Apply one API-authoritative authorization projection to the active runtime. */
  applyAuthorizationContext(projection: UiAuthorizationContextProjection): void {
    if (projection.platformId !== this.currentPlatformId) {
      throw new Error(
        `Authorization context platform '${projection.platformId}' does not match current platform '${this.currentPlatformId ?? '<none>'}'.`,
      );
    }

    this.setRuntimeUser(runtimeUserFromAuthorization(projection), projection.entities);
  }

  private applyUiTabState(): void {
    const platform = this.resolveStoredPlatform(this.uiState.tab.platformId);
    const selectedId = platform?.id ?? null;
    if (selectedId === this.currentPlatformId) return;

    // Platform changes cannot reuse capabilities granted to a different platform.
    // Invalidate them before the first navigation projection and change event.
    this.navigationEntityCapabilities = {};
    this.reprojectRuntime(platform);
    const previousUser = this.context.root().runtime.user;
    if (previousUser) {
      const id = previousUser.fields['id']?.value;
      const name = previousUser.fields['name']?.value;
      const role = previousUser.fields['role']?.value;
      if (typeof id === 'string' && typeof name === 'string' && typeof role === 'string') {
        const runtime = this.context.root().runtime;
        this.context.setRootMembers({
          runtime: Object.freeze({
            ...runtime,
            user: runtimeUserWithoutPlatform({ id, name, role }, selectedId),
          }),
        });
      }
    }
    this.reprojectNavigation();

    this.emit('platform');
    this.emit('runtime');
    this.emit('navigation');
  }

  private resolveStoredPlatform(platformId: string | null): SysPlatform | null {
    if (platformId === null) return null;

    const platform = this.company.platforms.find(
      (candidate) => candidate.enabled && candidate.id === platformId,
    );
    if (platform) return platform;

    const fallback = resolvePlatform(this.company);
    this.uiState.recoverSeedable((current) => ({
      ...current,
      platformId: fallback?.id ?? null,
    }));
    return fallback;
  }

  private resolveSelectedPlatform(platformId: string | null): SysPlatform | null {
    if (platformId === null || platformId.trim().length === 0) return null;

    const platform = this.company.platforms.find(
      (candidate) => candidate.enabled && candidate.id === platformId,
    );

    if (!platform) {
      throw new Error(`Unknown or disabled platform '${platformId}'.`);
    }

    return platform;
  }

  private createContextRoot(platform: SysPlatform | null): ManatOSRuntimeRootContext {
    const runtime = createEffectiveRuntimeContext(
      this.company,
      platform,
      null,
      this.runtimeSemantics(platform),
    );

    return {
      system: createHostSystemContext({
        clientKind: this.clientKind,
        clientVersion: this.clientVersion,
        company: this.company,
        currentPlatform: platform,
      }),
      company: createRuntimeCompanyContext(this.company, platform),
      runtime,
      flow: null,
    };
  }

  private reprojectRuntime(platform: SysPlatform | null): void {
    const root = this.context.root();
    const user = root.runtime.user;
    const runtime = createEffectiveRuntimeContext(
      this.company,
      platform,
      user,
      this.runtimeSemantics(platform),
    );

    // Preserve the stable Company object, but publish selector changes through
    // CTX rather than mutating it behind statistics and viewer observers.
    this.context.setMembers('ctx.company', {
      currentPlatform: platform?.id ?? null,
      currentPlatformIndex:
        platform === null
          ? -1
          : root.company.platforms.findIndex((candidate) => candidate.id === platform.id),
    });

    this.context.setRootMembers({ runtime });
    this.registerRuntimeSemantics();
  }

  /**
   * Describe the typed runtime projection at its producing boundary. These are
   * CTX *member* roles, not properties on values; convenience aliases
   * resolve to the canonical `$runtime` member.
   * Dynamic catalogue keys are refreshed after each platform projection.
   */
  private registerRuntimeSemantics(): void {
    const root = this.context.root();
    const roles: readonly [string, string][] = [
      ['ctx', 'context-root'],
      ['ctx.company', 'company-context'],
      ['ctx.system', 'system-context'],
      ['ctx.runtime', 'runtime-context'],
      ['ctx.runtime.subsystems', 'subsystems-context'],
      ['ctx.runtime.entities', 'entities-context'],
      ['ctx.runtime.enums', 'enums-context'],
      ['ctx.runtime.user', 'user-context'],
    ];
    for (const path of this.projectedSemanticPaths) this.context.unregisterSemanticKind(path);
    this.projectedSemanticPaths.clear();
    for (const [path, kind] of roles) this.context.registerSemanticKind(path, kind);
    // The authenticated user projection is the authoritative producer of its
    // named field container. Short aliases resolve to this canonical branch.
    if (root.runtime.user) {
      const fieldsPath = 'ctx.runtime.user.fields';
      this.context.registerSemanticKind(fieldsPath, 'fields');
      this.projectedSemanticPaths.add(fieldsPath);
      for (const fieldKey of Object.keys(root.runtime.user.fields)) {
        const suffix = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(fieldKey)
          ? '.' + fieldKey
          : '[' + JSON.stringify(fieldKey) + ']';
        const fieldPath = fieldsPath + suffix;
        this.context.registerSemanticKind(fieldPath, 'field');
        this.projectedSemanticPaths.add(fieldPath);
      }
    }

    // Clear registrations from a previous platform: removed entity catalogue
    // members must not retain stale semantic roles if a key returns later.
    for (const [collection, kind] of [
      ['subsystems', 'subsystem'],
      ['entities', 'entity'],
      ['enums', 'enum'],
    ] as const) {
      const members = root.runtime[collection];
      for (const key of Object.keys(members)) {
        const suffix = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
          ? '.' + key
          : '[' + JSON.stringify(key) + ']';
        const path = 'ctx.runtime.' + collection + suffix;
        this.context.registerSemanticKind(path, kind);
        this.projectedSemanticPaths.add(path);
      }
    }
  }

  private reprojectNavigation(): void {
    this.diagnostics.clearNavigation();
    this.navigationValue = createUiNavigationState(
      this.context,
      this.diagnostics.expressionDiagnosticSink,
      this.navigationEntityCapabilities,
      this.currentLanguageId.toUpperCase() as MetadataLanguage,
    );
  }

  private reconcilePreferredLanguage(): boolean {
    const preferredLanguage = normalizeUiLanguage(this.uiState.preferences.language);
    if (
      this.languageCatalogueValue.languages.some((language) => language.id === preferredLanguage)
    ) {
      return false;
    }

    this.uiState.selectLanguage(this.languageCatalogueValue.defaultLanguage);
    return true;
  }

  private runtimeSemantics(platform: SysPlatform | null): RuntimeSemanticProjection {
    const key = platform?.id ?? '<none>';
    const cached = this.runtimeSemanticCache.get(key);
    if (cached) return cached;

    const semantic = createRuntimeSemanticContext(this.company, platform);
    this.runtimeSemanticCache.set(key, semantic);
    return semantic;
  }

  private emit(change: ApplicationStateChange): void {
    for (const listener of this.listeners) {
      listener(change, this);
    }
  }
}

function runtimeUserPreferenceOwnerId(user: ManatOSUserContext | null): string | null {
  const value = user?.fields['id']?.value;
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
