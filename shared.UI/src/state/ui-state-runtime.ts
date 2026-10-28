import {
  effectiveUiPreferences,
  type UiBrowserPreferences,
  type UiDocumentationPopupEndurance,
  type UiDocumentationRememberedPage,
  type UiFontScalePercent,
  type UiLanguage,
  type UiPreferenceOwnerId,
  type UiPreferencesDocument,
  type UiPreferenceValues,
  type UiTheme,
  type UiWindowPlacement,
} from '../preferences/ui-preferences.js';
import {
  defaultUiCtxViewState,
  normalizeUiTabSeedableState,
  normalizeUiTabSessionState,
  type UiTabSeedableState,
  type UiTabSessionState,
  type UiTabStateDocument,
} from './ui-tab-state.js';
import { UiCliHistoryRuntime } from './ui-cli-history.js';
import { UiStatePersistence, type UiStateStorage } from './ui-state-persistence.js';

export type UiStateRuntimeChange = 'preferences' | 'browser' | 'endurance' | 'tab';
export type UiStateRuntimeListener = (
  change: UiStateRuntimeChange,
  runtime: UiStateRuntime,
) => void;

export class UiStateRuntime {
  readonly cliHistory: UiCliHistoryRuntime;

  private readonly listeners = new Set<UiStateRuntimeListener>();
  private readonly disposers: Array<() => void> = [];

  private preferencesDocumentValue: UiPreferencesDocument;
  private preferenceOwnerIdValue: UiPreferenceOwnerId = null;
  private tabStateValue: UiTabStateDocument;

  constructor(private readonly persistence: UiStatePersistence) {
    this.cliHistory = new UiCliHistoryRuntime(persistence);
    this.preferencesDocumentValue = persistence.loadPreferences();
    this.tabStateValue = persistence.loadTabState();
  }

  get preferencesDocument(): UiPreferencesDocument {
    return this.preferencesDocumentValue;
  }

  get preferences(): UiPreferenceValues {
    return effectiveUiPreferences(this.preferencesDocumentValue, this.preferenceOwnerIdValue);
  }

  get browserPreferences(): UiBrowserPreferences {
    return this.preferencesDocumentValue.browser;
  }

  windowPlacement(windowId: string): UiWindowPlacement | null {
    return this.preferencesDocumentValue.endurance.windows[windowId] ?? null;
  }

  get documentationPopupEndurance(): UiDocumentationPopupEndurance | null {
    return this.preferencesDocumentValue.endurance.documentationPopup;
  }

  get documentationRememberedPages(): readonly UiDocumentationRememberedPage[] {
    return this.preferencesDocumentValue.endurance.documentationPages;
  }

  get preferenceOwnerId(): UiPreferenceOwnerId {
    return this.preferenceOwnerIdValue;
  }

  get tabState(): UiTabStateDocument {
    return this.tabStateValue;
  }

  get tabId(): string {
    return this.tabStateValue.tabId;
  }

  get tab(): UiTabSeedableState {
    return this.tabStateValue.seedable;
  }

  get session(): UiTabSessionState {
    return this.tabStateValue.session;
  }

  subscribe(listener: UiStateRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setPreferenceOwner(ownerId: UiPreferenceOwnerId): void {
    const normalized = normalizeOwnerId(ownerId);
    if (normalized === this.preferenceOwnerIdValue) return;

    const previousOwner = this.preferenceOwnerIdValue;
    this.preferenceOwnerIdValue = normalized;

    if (previousOwner !== normalized) {
      // The anonymous Global CLI is a tab-owned developer surface, not part of
      // an authenticated user. Keep it mounted on the first sign-in, including
      // detached mode, while continuing to clear account-bound CLI state on
      // sign-out and on switches between authenticated identities.
      this.clearUserSensitiveTabState(previousOwner === null && normalized !== null);
    }

    this.preferencesDocumentValue = this.persistence.savePaintTheme(
      this.preferences.theme,
      this.preferencesDocumentValue,
    );
    this.emit('preferences');
  }

  saveFontScalePercent(fontScalePercent: UiFontScalePercent): void {
    this.preferencesDocumentValue = this.persistence.saveOwnerPreferences(
      this.preferenceOwnerIdValue,
      { fontScalePercent },
      this.preferencesDocumentValue,
    );
    this.emit('preferences');
  }

  saveTheme(theme: UiTheme): void {
    this.preferencesDocumentValue = this.persistence.saveOwnerPreferences(
      this.preferenceOwnerIdValue,
      { theme },
      this.preferencesDocumentValue,
    );
    this.emit('preferences');
  }

  selectLanguage(language: UiLanguage): void {
    this.preferencesDocumentValue = this.persistence.saveOwnerPreferences(
      this.preferenceOwnerIdValue,
      { language },
      this.preferencesDocumentValue,
    );
    this.emit('preferences');
  }

  saveWindowPlacement(windowId: string, placement: UiWindowPlacement | null): void {
    this.preferencesDocumentValue = this.persistence.saveWindowPlacement(
      windowId,
      placement,
      this.preferencesDocumentValue,
    );
    this.emit('endurance');
  }

  saveGlobalCliDetached(detached: boolean): void {
    this.preferencesDocumentValue = this.persistence.saveGlobalCliDetached(
      detached,
      this.preferencesDocumentValue,
    );
    this.emit('endurance');
  }

  saveGlobalCliFontScalePercent(percent: number): void {
    this.preferencesDocumentValue = this.persistence.saveGlobalCliFontScalePercent(
      percent,
      this.preferencesDocumentValue,
    );
    this.emit('endurance');
  }

  saveDocumentationPopupEndurance(endurance: UiDocumentationPopupEndurance | null): void {
    this.preferencesDocumentValue = this.persistence.saveDocumentationPopupEndurance(
      endurance,
      this.preferencesDocumentValue,
    );
    this.emit('endurance');
  }

  saveDocumentationRememberedPages(pages: readonly UiDocumentationRememberedPage[]): void {
    this.preferencesDocumentValue = this.persistence.saveDocumentationRememberedPages(
      pages,
      this.preferencesDocumentValue,
    );
    this.emit('endurance');
  }

  saveBrowserPreferences(patch: Partial<UiBrowserPreferences>): void {
    this.preferencesDocumentValue = this.persistence.saveBrowserPreferences(
      patch,
      this.preferencesDocumentValue,
    );
    this.emit('browser');
  }

  updateSeedable(change: (current: UiTabSeedableState) => UiTabSeedableState): void {
    const seedable = normalizeUiTabSeedableState(change(this.tabStateValue.seedable));
    if (sameJson(seedable, this.tabStateValue.seedable)) return;

    this.tabStateValue = this.persistence.saveTabState({ ...this.tabStateValue, seedable }, true);
    this.emit('tab');
  }

  updateSession(change: (current: UiTabSessionState) => UiTabSessionState): void {
    const session = normalizeUiTabSessionState(change(this.tabStateValue.session));
    if (sameJson(session, this.tabStateValue.session)) return;

    this.tabStateValue = this.persistence.saveSessionOnly(
      this.tabStateValue.tabId,
      this.tabStateValue.seedable,
      session,
    );
    this.emit('tab');
  }

  recoverSeedable(change: (current: UiTabSeedableState) => UiTabSeedableState): void {
    const seedable = normalizeUiTabSeedableState(change(this.tabStateValue.seedable));
    if (sameJson(seedable, this.tabStateValue.seedable)) return;

    this.tabStateValue = this.persistence.saveSessionOnly(
      this.tabStateValue.tabId,
      seedable,
      this.tabStateValue.session,
    );
    this.emit('tab');
  }

  resolveTabIdentityCollision(): void {
    this.tabStateValue = this.persistence.replaceTabFromLatest();
    this.emit('tab');
  }

  reloadSharedPreferences(): void {
    const previous = this.preferencesDocumentValue;
    const next = this.persistence.loadPreferences();
    if (sameJson(next, previous)) return;

    const previousEffective = effectiveUiPreferences(previous, this.preferenceOwnerIdValue);
    const nextEffective = effectiveUiPreferences(next, this.preferenceOwnerIdValue);
    this.preferencesDocumentValue = next;
    if (!sameJson(nextEffective, previousEffective)) this.emit('preferences');
    if (!sameJson(next.browser, previous.browser)) this.emit('browser');
    if (!sameJson(next.endurance, previous.endurance)) this.emit('endurance');
  }

  addDisposer(disposer: () => void): void {
    this.disposers.push(disposer);
  }

  destroy(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.listeners.clear();
  }

  private clearUserSensitiveTabState(preserveAnonymousCli = false): void {
    const debuggerState = this.tabStateValue.seedable.debugger;
    const previousGlobalView = debuggerState.ctxViews.find((view) => view.rootPath === 'ctx');
    const globalView = defaultUiCtxViewState();
    const preservedGlobalView =
      preserveAnonymousCli && previousGlobalView
        ? {
            ...globalView,
            cliOpen: previousGlobalView.cliOpen,
            cliMode: previousGlobalView.cliMode,
            cliCurrentPath: 'ctx',
          }
        : globalView;
    const seedable: UiTabSeedableState = {
      ...this.tabStateValue.seedable,
      debugger: {
        ...debuggerState,
        activeView: debuggerState.activeView === 'apiTraffic' ? 'apiTraffic' : 'ctx',
        ctxViews: [preservedGlobalView],
      },
    };

    // Anonymous CLI session state may safely follow the first login, but a
    // logout or identity switch must not expose a previous user's transcript.
    const session: UiTabSessionState = preserveAnonymousCli
      ? {
          ...normalizeUiTabSessionState(null),
          globalCliSession: this.tabStateValue.session.globalCliSession,
        }
      : normalizeUiTabSessionState(null);
    this.tabStateValue = this.persistence.saveTabState(
      { ...this.tabStateValue, seedable, session },
      true,
    );
    this.emit('tab');
  }

  private emit(change: UiStateRuntimeChange): void {
    for (const listener of this.listeners) listener(change, this);
  }
}

export function createTransientUiStateRuntime(): UiStateRuntime {
  const storage = createMemoryStorage();
  return new UiStateRuntime(
    new UiStatePersistence(storage, createMemoryStorage(), createRuntimeTabId),
  );
}

export function createMemoryUiStateRuntime(
  localStorage: UiStateStorage = createMemoryStorage(),
  sessionStorage: UiStateStorage = createMemoryStorage(),
  createTabId: () => string = createRuntimeTabId,
): UiStateRuntime {
  return new UiStateRuntime(new UiStatePersistence(localStorage, sessionStorage, createTabId));
}

function createRuntimeTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createMemoryStorage(): UiStateStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function normalizeOwnerId(value: UiPreferenceOwnerId): UiPreferenceOwnerId {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 ? value : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
