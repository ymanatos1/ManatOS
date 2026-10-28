import {
  UiPreferencesStore,
  type UiBrowserPreferences,
  type UiDocumentationPopupEndurance,
  type UiDocumentationRememberedPage,
  type UiPreferenceOwnerId,
  type UiPreferencesDocument,
  type UiPreferencesStorage,
  type UiPreferenceValues,
  type UiTheme,
  type UiWindowPlacement,
} from '../preferences/ui-preferences.js';
import {
  UI_TAB_LATEST_STORAGE_KEY,
  UI_TAB_SERIALIZED_MAX_BYTES,
  UI_TAB_STORAGE_KEY,
  UI_TAB_STATE_VERSION,
  createUiTabStateFromLatest,
  normalizeUiTabLatestDocument,
  normalizeUiTabSeedableState,
  normalizeUiTabSessionState,
  normalizeUiTabStateDocument,
  parseUiTabLatestDocument,
  parseUiTabStateDocument,
  type UiTabLatestDocument,
  type UiTabSeedableState,
  type UiTabSessionState,
  type UiTabStateDocument,
} from './ui-tab-state.js';

export type UiStateStorage = UiPreferencesStorage;

export class UiStatePersistence {
  private readonly preferencesStore: UiPreferencesStore;

  constructor(
    private readonly localStorage: UiStateStorage,
    private readonly sessionStorage: UiStateStorage,
    private readonly createTabId: () => string,
  ) {
    this.preferencesStore = new UiPreferencesStore(localStorage);
  }

  loadPreferences(): UiPreferencesDocument {
    return this.preferencesStore.load();
  }

  saveOwnerPreferences(
    ownerId: UiPreferenceOwnerId,
    patch: Partial<UiPreferenceValues>,
    fallback: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.preferencesStore.saveOwnerPreferences(ownerId, patch, fallback);
  }

  saveBrowserPreferences(
    patch: Partial<UiBrowserPreferences>,
    fallback: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.preferencesStore.saveBrowserPreferences(patch, fallback);
  }

  saveWindowPlacement(
    windowId: string,
    placement: UiWindowPlacement | null,
    fallback: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.preferencesStore.saveWindowPlacement(windowId, placement, fallback);
  }

  saveGlobalCliDetached(detached: boolean, fallback: UiPreferencesDocument): UiPreferencesDocument {
    return this.preferencesStore.saveGlobalCliDetached(detached, fallback);
  }

  saveGlobalCliFontScalePercent(
    percent: number,
    fallback: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.preferencesStore.saveGlobalCliFontScalePercent(percent, fallback);
  }

  saveDocumentationPopupEndurance(
    endurance: UiDocumentationPopupEndurance | null,
    fallback: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.preferencesStore.saveDocumentationPopupEndurance(endurance, fallback);
  }

  saveDocumentationRememberedPages(
    pages: readonly UiDocumentationRememberedPage[],
    fallback: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.preferencesStore.saveDocumentationRememberedPages(pages, fallback);
  }

  readRawLocal(key: string): string | null {
    try {
      return this.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  writeRawLocal(key: string, value: string): void {
    try {
      this.localStorage.setItem(key, value);
    } catch {
      // Optional browser persistence; the owning runtime keeps its in-memory snapshot.
    }
  }

  savePaintTheme(theme: UiTheme, fallback: UiPreferencesDocument): UiPreferencesDocument {
    return this.preferencesStore.savePaintTheme(theme, fallback);
  }

  loadTabState(): UiTabStateDocument {
    const newTabId = this.createTabId();

    try {
      const existing = parseUiTabStateDocument(
        this.sessionStorage.getItem(UI_TAB_STORAGE_KEY),
        newTabId,
      );
      // The same browser tab retains its open CLI across reloads. Only new tabs inherit a closed CLI.
      if (existing) return existing;
    } catch {
      // Fall through to the durable seed/defaults when session storage is unavailable.
    }

    const initial = withEphemeralDefaults(createUiTabStateFromLatest(newTabId, this.loadLatest()));
    this.saveSession(initial);
    return initial;
  }

  private loadLatest(): UiTabLatestDocument | null {
    try {
      return parseUiTabLatestDocument(this.localStorage.getItem(UI_TAB_LATEST_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  saveTabState(state: UiTabStateDocument, updateLatest: boolean): UiTabStateDocument {
    const normalized = this.fitTabState(normalizeUiTabStateDocument(state, state.tabId) ?? state);
    this.saveSession(normalized);

    if (updateLatest) {
      const latest = this.fitLatest({
        version: UI_TAB_STATE_VERSION,
        seedable: normalized.seedable,
      });

      try {
        this.localStorage.setItem(
          UI_TAB_LATEST_STORAGE_KEY,
          JSON.stringify({ ...latest, seedable: withClosedCli(latest.seedable) }),
        );
      } catch {
        // The tab-local state remains authoritative when durable storage is blocked.
      }
    }

    return normalized;
  }

  replaceTabFromLatest(): UiTabStateDocument {
    const state = withEphemeralDefaults(
      createUiTabStateFromLatest(this.createTabId(), this.loadLatest()),
    );
    this.saveSession(state);
    return state;
  }

  saveSessionOnly(
    tabId: string,
    seedable: UiTabSeedableState,
    session: UiTabSessionState,
  ): UiTabStateDocument {
    return this.saveTabState(
      {
        version: UI_TAB_STATE_VERSION,
        tabId,
        seedable,
        session,
      },
      false,
    );
  }

  private saveSession(state: UiTabStateDocument): void {
    try {
      this.sessionStorage.setItem(UI_TAB_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Session persistence is optional; the current in-memory state remains valid.
    }
  }

  private fitTabState(state: UiTabStateDocument): UiTabStateDocument {
    let seedable = normalizeUiTabSeedableState(state.seedable);
    let session = normalizeUiTabSessionState(state.session);
    let candidate: UiTabStateDocument = { ...state, seedable, session };

    if (serializedBytes(candidate) <= UI_TAB_SERIALIZED_MAX_BYTES) return candidate;

    seedable = reduceSeedable(seedable);
    session = reduceSession(session);
    candidate = { ...candidate, seedable, session };

    if (serializedBytes(candidate) <= UI_TAB_SERIALIZED_MAX_BYTES) return candidate;

    seedable = {
      ...seedable,
      debugger: {
        ...seedable.debugger,
        ctxViews: seedable.debugger.ctxViews.map((view) => ({ ...view, expandedPaths: [] })),
        apiTraffic: { ...seedable.debugger.apiTraffic, hiddenRoutes: [] },
      },
    };
    session = { ctxNavigation: [], globalCliSession: null };

    return { ...candidate, seedable, session };
  }

  private fitLatest(latest: UiTabLatestDocument): UiTabLatestDocument {
    let candidate = normalizeUiTabLatestDocument(latest) ?? {
      version: UI_TAB_STATE_VERSION,
      seedable: normalizeUiTabSeedableState(null),
    };

    if (serializedBytes(candidate) <= UI_TAB_SERIALIZED_MAX_BYTES) return candidate;

    candidate = { ...candidate, seedable: reduceSeedable(candidate.seedable) };
    if (serializedBytes(candidate) <= UI_TAB_SERIALIZED_MAX_BYTES) return candidate;

    return {
      ...candidate,
      seedable: {
        ...candidate.seedable,
        debugger: {
          ...candidate.seedable.debugger,
          ctxViews: candidate.seedable.debugger.ctxViews.map((view) => ({
            ...view,
            expandedPaths: [],
          })),
          apiTraffic: { ...candidate.seedable.debugger.apiTraffic, hiddenRoutes: [] },
        },
      },
    };
  }
}

function reduceSeedable(seedable: UiTabSeedableState): UiTabSeedableState {
  return {
    ...seedable,
    debugger: {
      ...seedable.debugger,
      ctxViews: seedable.debugger.ctxViews.map((view) => ({
        ...view,
        expandedPaths: view.expandedPaths.slice(-128),
      })),
      apiTraffic: {
        ...seedable.debugger.apiTraffic,
        hiddenRoutes: seedable.debugger.apiTraffic.hiddenRoutes.slice(-64),
      },
    },
  };
}

function reduceSession(session: UiTabSessionState): UiTabSessionState {
  return {
    globalCliSession: session.globalCliSession,
    ctxNavigation: session.ctxNavigation.map((history) => {
      const start = Math.max(0, history.entries.length - 32);
      const entries = history.entries.slice(start);
      const index = Math.max(0, Math.min(entries.length - 1, history.index - start));
      return { ...history, entries, index };
    }),
  };
}

function serializedBytes(value: unknown): number {
  const text = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  return text.length * 2;
}

function withClosedCli(seedable: UiTabSeedableState): UiTabSeedableState {
  return {
    ...seedable,
    debugger: {
      ...seedable.debugger,
      ctxViews: seedable.debugger.ctxViews.map((view) => ({
        ...view,
        cliOpen: false,
        cliMode: 'closed' as const,
      })),
    },
  };
}

function withEphemeralDefaults(state: UiTabStateDocument): UiTabStateDocument {
  return { ...state, seedable: withClosedCli(state.seedable) };
}
