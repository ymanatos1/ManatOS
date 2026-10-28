import { DEFAULT_LANGUAGE_ID } from '@manatos/shared';

export type UiTheme = 'lighter' | 'darker';
export type UiLanguage = string;
export type UiFontScalePercent = number;
export type UiPreferenceOwnerId = string | null;

export const DEFAULT_UI_THEME: UiTheme = 'lighter';
export const DEFAULT_UI_LANGUAGE: UiLanguage = DEFAULT_LANGUAGE_ID;
export const DEFAULT_UI_FONT_SCALE_PERCENT: UiFontScalePercent = 100;
export const UI_FONT_SCALE_STEP_PERCENT = 20;
export const MIN_UI_FONT_SCALE_PERCENT = 80;
export const MAX_UI_FONT_SCALE_PERCENT = 200;
export const UI_PREFERENCES_VERSION = 2 as const;
export const UI_PREFERENCES_STORAGE_KEY = 'manatos.ui.preferences.v2';
export const LEGACY_UI_PREFERENCES_STORAGE_KEY = 'manatos.ui.preferences.v1';
export const UI_WINDOW_IDS = Object.freeze({
  main: 'main',
  debugger: 'debugger',
  documentation: 'documentation',
  globalCli: 'global-cli',
} as const);
const UI_PREFERENCES_USER_LIMIT = 64;
const UI_PREFERENCE_OWNER_ID_MAX_LENGTH = 256;
const UI_WINDOW_LIMIT = 16;
const UI_WINDOW_ID_MAX_LENGTH = 64;
export const UI_DOCUMENTATION_REMEMBERED_PAGE_LIMIT = 32;

export interface UiPreferenceValues {
  readonly theme: UiTheme;
  readonly language: UiLanguage;
  readonly fontScalePercent: UiFontScalePercent;
}

export interface UiBrowserPreferences {
  readonly developerToolsWidth: number | null;
  readonly ctxPropertiesHeight: number | null;
  readonly cliHeight: number | null;
  readonly apiDetailsHeight: number | null;
  readonly apiColumnWidths: readonly number[];
}

export type UiWindowDisplayState = 'normal' | 'maximized';

export interface UiWindowPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly state: UiWindowDisplayState;
}

export interface UiDocumentationPopupEndurance {
  readonly placement: UiWindowPlacement;
}

export interface UiDocumentationRememberedPage {
  readonly path: string;
  readonly anchor: string;
}

export interface UiEndurancePreferences {
  readonly windows: Readonly<Record<string, UiWindowPlacement>>;
  readonly documentationPopup: UiDocumentationPopupEndurance | null;
  readonly documentationPages: readonly UiDocumentationRememberedPage[];
  readonly globalCliFontScalePercent: UiFontScalePercent;
  readonly globalCliDetached: boolean;
}

export interface UiPreferencesDocument {
  readonly version: typeof UI_PREFERENCES_VERSION;
  readonly anonymous: UiPreferenceValues;
  readonly users: Readonly<Record<string, UiPreferenceValues>>;
  readonly browser: UiBrowserPreferences;
  readonly endurance: UiEndurancePreferences;
  readonly paint: {
    readonly theme: UiTheme;
  };
}

export interface UiPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function normalizeUiTheme(value: unknown): UiTheme {
  return value === 'darker' ? 'darker' : DEFAULT_UI_THEME;
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return parseUiLanguage(value) ?? DEFAULT_UI_LANGUAGE;
}

export function normalizeUiFontScalePercent(value: unknown): UiFontScalePercent {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_UI_FONT_SCALE_PERCENT;

  const stepped = Math.round(value / UI_FONT_SCALE_STEP_PERCENT) * UI_FONT_SCALE_STEP_PERCENT;
  return Math.min(MAX_UI_FONT_SCALE_PERCENT, Math.max(MIN_UI_FONT_SCALE_PERCENT, stepped));
}

export function parseUiLanguage(value: unknown): UiLanguage | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,34}$/.test(normalized) ? normalized : null;
}

export function defaultUiPreferenceValues(): UiPreferenceValues {
  return {
    theme: DEFAULT_UI_THEME,
    language: DEFAULT_UI_LANGUAGE,
    fontScalePercent: DEFAULT_UI_FONT_SCALE_PERCENT,
  };
}

export function defaultUiBrowserPreferences(): UiBrowserPreferences {
  return {
    developerToolsWidth: null,
    ctxPropertiesHeight: null,
    cliHeight: null,
    apiDetailsHeight: null,
    apiColumnWidths: [],
  };
}

export function defaultUiEndurancePreferences(): UiEndurancePreferences {
  return {
    windows: {},
    documentationPopup: null,
    documentationPages: [],
    globalCliFontScalePercent: 100,
    globalCliDetached: false,
  };
}

export function defaultUiPreferences(): UiPreferencesDocument {
  return {
    version: UI_PREFERENCES_VERSION,
    anonymous: defaultUiPreferenceValues(),
    users: {},
    browser: defaultUiBrowserPreferences(),
    endurance: defaultUiEndurancePreferences(),
    paint: { theme: DEFAULT_UI_THEME },
  };
}

export function normalizeUiPreferenceValues(value: unknown): UiPreferenceValues {
  const candidate = asRecord(value);

  return {
    theme: normalizeUiTheme(candidate?.['theme']),
    language: normalizeUiLanguage(candidate?.['language']),
    fontScalePercent: normalizeUiFontScalePercent(candidate?.['fontScalePercent']),
  };
}

export function normalizeUiBrowserPreferences(value: unknown): UiBrowserPreferences {
  const candidate = asRecord(value);
  const rawColumnWidths = Array.isArray(candidate?.['apiColumnWidths'])
    ? candidate['apiColumnWidths']
    : [];

  return {
    developerToolsWidth: normalizeOptionalDimension(candidate?.['developerToolsWidth']),
    ctxPropertiesHeight: normalizeOptionalDimension(candidate?.['ctxPropertiesHeight']),
    cliHeight: normalizeOptionalDimension(candidate?.['cliHeight']),
    apiDetailsHeight: normalizeOptionalDimension(candidate?.['apiDetailsHeight']),
    apiColumnWidths: rawColumnWidths
      .map(normalizeOptionalDimension)
      .filter((value): value is number => value !== null)
      .slice(0, 32),
  };
}

export function normalizeUiWindowPlacement(value: unknown): UiWindowPlacement | null {
  const candidate = asRecord(value);
  if (!candidate) return null;

  const left = normalizeCoordinate(candidate['left']);
  const top = normalizeCoordinate(candidate['top']);
  const width = normalizeWindowDimension(candidate['width']);
  const height = normalizeWindowDimension(candidate['height']);
  if (left === null || top === null || width === null || height === null) return null;

  return {
    left,
    top,
    width,
    height,
    state: candidate['state'] === 'maximized' ? 'maximized' : 'normal',
  };
}

export function normalizeUiEndurancePreferences(value: unknown): UiEndurancePreferences {
  const candidate = asRecord(value);
  const rawWindows = asRecord(candidate?.['windows']) ?? {};
  const windows: Record<string, UiWindowPlacement> = {};
  let legacyDocumentationPlacement: UiWindowPlacement | null = null;

  for (const [rawId, rawPlacement] of Object.entries(rawWindows)) {
    const id = normalizeWindowId(rawId);
    const placement = normalizeUiWindowPlacement(rawPlacement);
    if (!id || !placement) continue;
    if (id === UI_WINDOW_IDS.documentation) {
      legacyDocumentationPlacement = placement;
      continue;
    }
    windows[id] = placement;
    if (Object.keys(windows).length >= UI_WINDOW_LIMIT) break;
  }

  const documentationPopup = normalizeUiDocumentationPopupEndurance(
    candidate?.['documentationPopup'],
    legacyDocumentationPlacement,
  );
  const documentationPages = normalizeUiDocumentationRememberedPages(
    candidate?.['documentationPages'],
    candidate?.['documentationPopup'],
  );

  return {
    windows,
    documentationPopup,
    documentationPages,
    globalCliFontScalePercent: normalizeUiFontScalePercent(
      candidate?.['globalCliFontScalePercent'],
    ),
    globalCliDetached: candidate?.['globalCliDetached'] === true,
  };
}

export function normalizeUiDocumentationPopupEndurance(
  value: unknown,
  fallbackPlacement: UiWindowPlacement | null = null,
): UiDocumentationPopupEndurance | null {
  const candidate = asRecord(value);
  const placement = normalizeUiWindowPlacement(candidate?.['placement']) ?? fallbackPlacement;
  if (!placement) return null;

  return { placement };
}

export function normalizeUiDocumentationRememberedPages(
  value: unknown,
  legacyPopup: unknown = null,
): readonly UiDocumentationRememberedPage[] {
  const pages: UiDocumentationRememberedPage[] = [];
  const seen = new Set<string>();

  const add = (candidate: unknown): void => {
    const record = asRecord(candidate);
    if (!record) return;
    const path = normalizeDocumentationLocationPart(record['path']);
    if (!path) return;
    const anchor = normalizeDocumentationLocationPart(record['anchor']);
    const key = `${path}\n${anchor}`;
    if (seen.has(key)) return;
    seen.add(key);
    pages.push({ path, anchor });
  };

  if (Array.isArray(value)) {
    for (const candidate of value) {
      add(candidate);
      if (pages.length >= UI_DOCUMENTATION_REMEMBERED_PAGE_LIMIT) break;
    }
  }

  if (pages.length < UI_DOCUMENTATION_REMEMBERED_PAGE_LIMIT) add(legacyPopup);
  return pages.slice(0, UI_DOCUMENTATION_REMEMBERED_PAGE_LIMIT);
}

export function normalizeUiPreferences(value: unknown): UiPreferencesDocument {
  const candidate = asRecord(value);
  if (candidate?.['version'] !== UI_PREFERENCES_VERSION) return defaultUiPreferences();

  const rawUsers = asRecord(candidate['users']) ?? {};
  const users: Record<string, UiPreferenceValues> = {};

  for (const [id, preferences] of Object.entries(rawUsers)) {
    if (!id.trim() || id.length > UI_PREFERENCE_OWNER_ID_MAX_LENGTH) continue;
    users[id] = normalizeUiPreferenceValues(preferences);
    if (Object.keys(users).length >= UI_PREFERENCES_USER_LIMIT) break;
  }

  const paint = asRecord(candidate['paint']);

  return {
    version: UI_PREFERENCES_VERSION,
    anonymous: normalizeUiPreferenceValues(candidate['anonymous']),
    users,
    browser: normalizeUiBrowserPreferences(candidate['browser']),
    endurance: normalizeUiEndurancePreferences(candidate['endurance']),
    paint: { theme: normalizeUiTheme(paint?.['theme']) },
  };
}

export function parseUiPreferences(raw: string | null): UiPreferencesDocument {
  if (!raw) return defaultUiPreferences();

  try {
    return normalizeUiPreferences(JSON.parse(raw));
  } catch {
    return defaultUiPreferences();
  }
}

export function effectiveUiPreferences(
  document: UiPreferencesDocument,
  ownerId: UiPreferenceOwnerId,
): UiPreferenceValues {
  if (!ownerId) return document.anonymous;
  return document.users[ownerId] ?? document.anonymous;
}

export class UiPreferencesStore {
  constructor(private readonly storage: UiPreferencesStorage) {}

  load(): UiPreferencesDocument {
    try {
      const current = this.readCurrent();
      if (current) return current;

      const legacy = this.readLegacy();
      if (!legacy) return defaultUiPreferences();

      const migrated: UiPreferencesDocument = {
        ...defaultUiPreferences(),
        anonymous: {
          theme: legacy.theme,
          language: DEFAULT_UI_LANGUAGE,
          fontScalePercent: DEFAULT_UI_FONT_SCALE_PERCENT,
        },
        paint: { theme: legacy.theme },
      };

      try {
        this.storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(migrated));
        this.storage.removeItem?.(LEGACY_UI_PREFERENCES_STORAGE_KEY);
      } catch {
        // Keep the legacy source intact when migration cannot be persisted.
      }

      return migrated;
    } catch {
      return defaultUiPreferences();
    }
  }

  saveOwnerPreferences(
    ownerId: UiPreferenceOwnerId,
    patch: Partial<UiPreferenceValues>,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.update((current) => {
      const existing = effectiveUiPreferences(current, ownerId);
      const next = normalizeUiPreferenceValues({ ...existing, ...patch });

      if (!ownerId) {
        return {
          ...current,
          anonymous: next,
          paint: { theme: next.theme },
        };
      }

      return {
        ...current,
        users: { ...current.users, [ownerId]: next },
        paint: { theme: next.theme },
      };
    }, fallback);
  }

  saveBrowserPreferences(
    patch: Partial<UiBrowserPreferences>,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.update(
      (current) => ({
        ...current,
        browser: normalizeUiBrowserPreferences({ ...current.browser, ...patch }),
      }),
      fallback,
    );
  }

  saveWindowPlacement(
    windowId: string,
    placement: UiWindowPlacement | null,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    const id = normalizeWindowId(windowId);
    if (!id) return fallback ? normalizeUiPreferences(fallback) : this.load();

    return this.update((current) => {
      const windows = { ...current.endurance.windows };
      if (placement === null) delete windows[id];
      else {
        const normalized = normalizeUiWindowPlacement(placement);
        if (normalized) windows[id] = normalized;
      }

      const bounded = Object.fromEntries(
        Object.entries(windows)
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(0, UI_WINDOW_LIMIT),
      );
      return { ...current, endurance: { ...current.endurance, windows: bounded } };
    }, fallback);
  }

  /** The Global CLI's detached state belongs to durable UI endurance, not a browser tab. */
  saveGlobalCliDetached(
    detached: boolean,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.update(
      (current) => ({
        ...current,
        endurance: { ...current.endurance, globalCliDetached: detached },
      }),
      fallback,
    );
  }

  /** Persist the Global CLI scale independently of page and documentation scale. */
  saveGlobalCliFontScalePercent(
    percent: number,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.update(
      (current) => ({
        ...current,
        endurance: {
          ...current.endurance,
          globalCliFontScalePercent: normalizeUiFontScalePercent(percent),
        },
      }),
      fallback,
    );
  }

  saveDocumentationPopupEndurance(
    endurance: UiDocumentationPopupEndurance | null,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.update(
      (current) => ({
        ...current,
        endurance: {
          ...current.endurance,
          documentationPopup: endurance ? normalizeUiDocumentationPopupEndurance(endurance) : null,
        },
      }),
      fallback,
    );
  }

  saveDocumentationRememberedPages(
    pages: readonly UiDocumentationRememberedPage[],
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    return this.update(
      (current) => ({
        ...current,
        endurance: {
          ...current.endurance,
          documentationPages: normalizeUiDocumentationRememberedPages(pages),
        },
      }),
      fallback,
    );
  }

  savePaintTheme(theme: UiTheme, fallback?: UiPreferencesDocument): UiPreferencesDocument {
    return this.update(
      (current) => ({
        ...current,
        paint: { theme: normalizeUiTheme(theme) },
      }),
      fallback,
    );
  }

  private update(
    change: (current: UiPreferencesDocument) => UiPreferencesDocument,
    fallback?: UiPreferencesDocument,
  ): UiPreferencesDocument {
    const current = this.currentForUpdate(fallback);
    const next = normalizeUiPreferences(change(current));

    try {
      this.storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Browser persistence is optional. The normalized in-memory value
      // remains authoritative for this runtime when storage is unavailable.
    }

    return next;
  }

  private currentForUpdate(fallback?: UiPreferencesDocument): UiPreferencesDocument {
    try {
      const current = this.readCurrent();
      if (current) return current;

      const legacy = this.readLegacy();
      if (legacy) return this.load();
    } catch {
      // Prefer the caller's current normalized in-memory state when storage is blocked.
    }

    return fallback ? normalizeUiPreferences(fallback) : defaultUiPreferences();
  }

  private readCurrent(): UiPreferencesDocument | null {
    const raw = this.storage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidate = asRecord(parsed);
      return candidate?.['version'] === UI_PREFERENCES_VERSION
        ? normalizeUiPreferences(parsed)
        : null;
    } catch {
      return null;
    }
  }

  private readLegacy(): { readonly theme: UiTheme } | null {
    const raw = this.storage.getItem(LEGACY_UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;

    try {
      const candidate = asRecord(JSON.parse(raw));
      if (candidate?.['version'] !== 1) return null;
      return { theme: normalizeUiTheme(candidate['theme']) };
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeOptionalDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function normalizeCoordinate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000) {
    return null;
  }
  return Math.round(value);
}

function normalizeWindowDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= 100_000 ? rounded : null;
}

function normalizeWindowId(value: string): string | null {
  const normalized = value.trim();
  return normalized && normalized.length <= UI_WINDOW_ID_MAX_LENGTH ? normalized : null;
}

function normalizeDocumentationLocationPart(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 4096) : '';
}
