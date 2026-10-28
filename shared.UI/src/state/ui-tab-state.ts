import { MANATOS_COMPANY, resolvePlatform } from '@manatos/shared';

import type { CtxSearchMode, CtxSearchSyntax } from '../debugger/ctx-inspection.js';

export const UI_TAB_STATE_VERSION = 1 as const;
export const UI_TAB_STORAGE_KEY = 'manatos.ui.tab.v1';
export const UI_TAB_LATEST_STORAGE_KEY = 'manatos.ui.tab.latest.v1';
export const UI_TAB_SERIALIZED_MAX_BYTES = 128 * 1024;

export const UI_TAB_TARGET_CTX_LIMIT = 16;
export const UI_TAB_EXPANDED_CTX_LIMIT = 512;
export const UI_TAB_CTX_HISTORY_LIMIT = 100;
export const UI_TAB_HIDDEN_API_ROUTES_LIMIT = 256;
const UI_STATE_STRING_MAX_LENGTH = 1024;

export type UiCliMode = 'closed' | 'opened' | 'detached';

export interface UiPersistedCliSession {
  readonly currentPath: string;
  readonly command: string;
  readonly transcript: readonly {
    readonly id: number;
    readonly kind: 'command' | 'result' | 'error' | 'info';
    readonly text: string;
  }[];
  readonly transcriptSequence: number;
  readonly history: readonly string[];
  readonly historyIndex: number;
}

export type UiDebuggerMainView = 'ctx' | 'apiTraffic' | `ctx:${string}`;
export interface UiCtxViewState {
  readonly rootPath: string;
  readonly selectedPath: string;
  readonly expandedPaths: readonly string[];
  readonly watchedPath: string | null;
  readonly propertiesOpen: boolean;
  readonly findOpen: boolean;
  readonly findMode: CtxSearchMode;
  readonly findSyntax: CtxSearchSyntax;
  readonly cliOpen: boolean; // legacy compatibility for existing consumers
  readonly cliMode: UiCliMode;
  readonly cliCurrentPath: string;
}

export interface UiApiTrafficState {
  readonly errorsOnly: boolean;
  readonly ignoreRoutes: boolean;
  readonly hiddenRoutes: readonly string[];
}

export interface UiTabSeedableState {
  readonly platformId: string | null;
  readonly shell: {
    readonly workspaceNavigationCollapsed: boolean;
  };
  readonly debugger: {
    readonly visible: boolean;
    readonly diagnosticsVisible: boolean;
    readonly activeView: UiDebuggerMainView;
    readonly ctxViews: readonly UiCtxViewState[];
    readonly apiTraffic: UiApiTrafficState;
  };
}

export interface UiCtxNavigationHistoryState {
  readonly rootPath: string;
  readonly entries: readonly string[];
  readonly index: number;
}

export interface UiTabSessionState {
  readonly ctxNavigation: readonly UiCtxNavigationHistoryState[];
  readonly globalCliSession: UiPersistedCliSession | null;
}

export interface UiTabStateDocument {
  readonly version: typeof UI_TAB_STATE_VERSION;
  readonly tabId: string;
  readonly seedable: UiTabSeedableState;
  readonly session: UiTabSessionState;
}

export interface UiTabLatestDocument {
  readonly version: typeof UI_TAB_STATE_VERSION;
  readonly seedable: UiTabSeedableState;
}

export function defaultUiCtxViewState(rootPath = 'ctx'): UiCtxViewState {
  return {
    rootPath,
    selectedPath: rootPath,
    expandedPaths: [],
    watchedPath: null,
    propertiesOpen: false,
    findOpen: false,
    findMode: 'key',
    findSyntax: 'wildcard',
    cliOpen: false,
    cliMode: 'closed',
    cliCurrentPath: rootPath,
  };
}

export function defaultUiTabSeedableState(): UiTabSeedableState {
  const platformId = resolvePlatform(MANATOS_COMPANY)?.id ?? null;

  return {
    platformId,
    shell: { workspaceNavigationCollapsed: false },
    debugger: {
      visible: false,
      diagnosticsVisible: true,
      activeView: 'ctx',
      ctxViews: [defaultUiCtxViewState()],
      apiTraffic: {
        errorsOnly: false,
        ignoreRoutes: false,
        hiddenRoutes: [],
      },
    },
  };
}

export function defaultUiTabSessionState(): UiTabSessionState {
  return {
    ctxNavigation: [{ rootPath: 'ctx', entries: ['ctx'], index: 0 }],
    globalCliSession: null,
  };
}

export function createDefaultUiTabState(tabId: string): UiTabStateDocument {
  return {
    version: UI_TAB_STATE_VERSION,
    tabId,
    seedable: defaultUiTabSeedableState(),
    session: defaultUiTabSessionState(),
  };
}

export function createUiTabStateFromLatest(
  tabId: string,
  latest: UiTabLatestDocument | null,
): UiTabStateDocument {
  return {
    version: UI_TAB_STATE_VERSION,
    tabId,
    seedable: normalizeUiTabSeedableState(latest?.seedable),
    session: defaultUiTabSessionState(),
  };
}

export function normalizeUiTabSeedableState(value: unknown): UiTabSeedableState {
  const defaults = defaultUiTabSeedableState();
  const candidate = asRecord(value);
  const shell = asRecord(candidate?.['shell']);
  const debuggerState = asRecord(candidate?.['debugger']);
  const apiTraffic = asRecord(debuggerState?.['apiTraffic']);

  const ctxViews = normalizeCtxViews(debuggerState?.['ctxViews']);
  const activeView = normalizeDebuggerMainView(debuggerState?.['activeView'], ctxViews);

  return {
    platformId: normalizeNullableString(candidate?.['platformId'], defaults.platformId),
    shell: {
      workspaceNavigationCollapsed: booleanOr(
        shell?.['workspaceNavigationCollapsed'],
        defaults.shell.workspaceNavigationCollapsed,
      ),
    },
    debugger: {
      visible: booleanOr(debuggerState?.['visible'], defaults.debugger.visible),
      diagnosticsVisible: booleanOr(
        debuggerState?.['diagnosticsVisible'],
        defaults.debugger.diagnosticsVisible,
      ),
      activeView,
      ctxViews,
      apiTraffic: {
        errorsOnly: booleanOr(apiTraffic?.['errorsOnly'], false),
        ignoreRoutes: booleanOr(apiTraffic?.['ignoreRoutes'], false),
        hiddenRoutes: uniqueStrings(apiTraffic?.['hiddenRoutes'], UI_TAB_HIDDEN_API_ROUTES_LIMIT),
      },
    },
  };
}

export function normalizeUiTabSessionState(value: unknown): UiTabSessionState {
  const candidate = asRecord(value);
  const rawHistory = Array.isArray(candidate?.['ctxNavigation']) ? candidate['ctxNavigation'] : [];
  const ctxNavigation: UiCtxNavigationHistoryState[] = [];

  for (const item of rawHistory) {
    const record = asRecord(item);
    const rootPath = normalizeCtxPath(record?.['rootPath']);
    if (!rootPath) continue;

    const { entries: normalizedEntries, index } = normalizeCtxHistory(
      record?.['entries'],
      record?.['index'],
      rootPath,
    );

    ctxNavigation.push({ rootPath, entries: normalizedEntries, index });
    if (ctxNavigation.length >= UI_TAB_TARGET_CTX_LIMIT + 1) break;
  }

  if (!ctxNavigation.some((item) => item.rootPath === 'ctx')) {
    ctxNavigation.unshift({ rootPath: 'ctx', entries: ['ctx'], index: 0 });
  }

  const rawCli = asRecord(candidate?.['globalCliSession']);
  const transcript: UiPersistedCliSession['transcript'] = Array.isArray(rawCli?.['transcript'])
    ? rawCli['transcript'].slice(-250).flatMap((entry) => {
        const item = asRecord(entry);
        const kind = item?.['kind'];
        if (
          !item ||
          (kind !== 'command' && kind !== 'result' && kind !== 'error' && kind !== 'info') ||
          typeof item['text'] !== 'string'
        )
          return [];
        return [
          {
            id: Number(item['id']) || 0,
            kind: kind as UiPersistedCliSession['transcript'][number]['kind'],
            text: item['text'].slice(0, 16000),
          },
        ];
      })
    : [];
  const cliPath = normalizeCtxPath(rawCli?.['currentPath']);
  const globalCliSession: UiPersistedCliSession | null =
    rawCli && cliPath
      ? {
          currentPath: cliPath,
          command: typeof rawCli['command'] === 'string' ? rawCli['command'].slice(0, 16000) : '',
          transcript,
          transcriptSequence: Number(rawCli['transcriptSequence']) || 0,
          history: uniqueStrings(rawCli['history'], 100),
          historyIndex: Number(rawCli['historyIndex']) || 0,
        }
      : null;
  return { ctxNavigation, globalCliSession };
}

export function normalizeUiTabStateDocument(
  value: unknown,
  fallbackTabId: string,
): UiTabStateDocument | null {
  const candidate = asRecord(value);
  if (candidate?.['version'] !== UI_TAB_STATE_VERSION) return null;

  const tabId = nonEmptyString(candidate['tabId']) ?? fallbackTabId;

  return {
    version: UI_TAB_STATE_VERSION,
    tabId,
    seedable: normalizeUiTabSeedableState(candidate['seedable']),
    session: normalizeUiTabSessionState(candidate['session']),
  };
}

export function normalizeUiTabLatestDocument(value: unknown): UiTabLatestDocument | null {
  const candidate = asRecord(value);
  if (candidate?.['version'] !== UI_TAB_STATE_VERSION) return null;

  return {
    version: UI_TAB_STATE_VERSION,
    seedable: normalizeUiTabSeedableState(candidate['seedable']),
  };
}

export function parseUiTabStateDocument(
  raw: string | null,
  fallbackTabId: string,
): UiTabStateDocument | null {
  if (!raw) return null;

  try {
    return normalizeUiTabStateDocument(JSON.parse(raw), fallbackTabId);
  } catch {
    return null;
  }
}

export function parseUiTabLatestDocument(raw: string | null): UiTabLatestDocument | null {
  if (!raw) return null;

  try {
    return normalizeUiTabLatestDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}

function normalizeCtxViews(value: unknown): readonly UiCtxViewState[] {
  const raw = Array.isArray(value) ? value : [];
  const byRoot = new Map<string, UiCtxViewState>();
  let targetCount = 0;

  for (const item of raw) {
    const candidate = asRecord(item);
    const rootPath = normalizeCtxPath(candidate?.['rootPath']);
    if (!rootPath || byRoot.has(rootPath)) continue;
    if (rootPath !== 'ctx' && targetCount >= UI_TAB_TARGET_CTX_LIMIT) continue;

    const selectedCandidate = normalizeCtxPath(candidate?.['selectedPath']);
    const selectedPath =
      selectedCandidate && isCtxPathWithinRoot(selectedCandidate, rootPath)
        ? selectedCandidate
        : rootPath;
    const watchedCandidate = normalizeCtxPath(candidate?.['watchedPath']);
    const cliCandidate = normalizeCtxPath(candidate?.['cliCurrentPath']);
    byRoot.set(rootPath, {
      rootPath,
      selectedPath,
      expandedPaths: uniqueStrings(candidate?.['expandedPaths'], UI_TAB_EXPANDED_CTX_LIMIT).filter(
        (path) => isCtxPathWithinRoot(path, rootPath),
      ),
      watchedPath:
        watchedCandidate && isCtxPathWithinRoot(watchedCandidate, rootPath)
          ? watchedCandidate
          : null,
      propertiesOpen: booleanOr(candidate?.['propertiesOpen'], false),
      findOpen: booleanOr(candidate?.['findOpen'], false),
      findMode: normalizeSearchMode(candidate?.['findMode']),
      findSyntax: normalizeSearchSyntax(candidate?.['findSyntax']),
      cliOpen:
        candidate?.['cliMode'] === 'opened' ||
        candidate?.['cliMode'] === 'detached' ||
        (candidate?.['cliMode'] === undefined && booleanOr(candidate?.['cliOpen'], false)),
      cliMode:
        candidate?.['cliMode'] === 'opened' || candidate?.['cliMode'] === 'detached'
          ? candidate['cliMode']
          : candidate?.['cliMode'] === 'closed'
            ? 'closed'
            : booleanOr(candidate?.['cliOpen'], false)
              ? 'opened'
              : 'closed',
      cliCurrentPath:
        cliCandidate && isCtxPathWithinRoot(cliCandidate, rootPath) ? cliCandidate : rootPath,
    });
    if (rootPath !== 'ctx') targetCount += 1;
  }

  if (!byRoot.has('ctx')) byRoot.set('ctx', defaultUiCtxViewState());

  const root = byRoot.get('ctx')!;
  return [
    root,
    ...[...byRoot.values()]
      .filter((item) => item.rootPath !== 'ctx')
      .slice(0, UI_TAB_TARGET_CTX_LIMIT),
  ];
}

function normalizeDebuggerMainView(
  value: unknown,
  ctxViews: readonly UiCtxViewState[],
): UiDebuggerMainView {
  if (value === 'ctx' || value === 'apiTraffic') return value;
  if (typeof value !== 'string' || !value.startsWith('ctx:')) return 'ctx';

  const rootPath = value.slice(4);
  return ctxViews.some((view) => view.rootPath === rootPath)
    ? (value as UiDebuggerMainView)
    : 'ctx';
}

function normalizeSearchMode(value: unknown): CtxSearchMode {
  return value === 'value' || value === 'both' ? value : 'key';
}

function normalizeSearchSyntax(value: unknown): CtxSearchSyntax {
  return value === 'regex' ? 'regex' : 'wildcard';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= UI_STATE_STRING_MAX_LENGTH ? value : null;
}

function normalizeCtxPath(value: unknown): string | null {
  const path = nonEmptyString(value);
  if (!path) return null;
  return path === 'ctx' || path.startsWith('ctx.') || path.startsWith('ctx[') ? path : null;
}

function isCtxPathWithinRoot(path: string, rootPath: string): boolean {
  return (
    rootPath === 'ctx' ||
    path === rootPath ||
    path.startsWith(`${rootPath}.`) ||
    path.startsWith(`${rootPath}[`)
  );
}

function normalizeNullableString(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  return nonEmptyString(value) ?? fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function uniqueStrings(value: unknown, limit: number): readonly string[] {
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const normalized = nonEmptyString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function normalizeCtxHistory(
  value: unknown,
  rawIndexValue: unknown,
  rootPath: string,
): { entries: readonly string[]; index: number } {
  const raw = Array.isArray(value) ? value : [];
  const normalized: Array<{ path: string; rawIndex: number }> = [];

  raw.forEach((item, rawIndex) => {
    const path = normalizeCtxPath(item);
    if (path && isCtxPathWithinRoot(path, rootPath)) normalized.push({ path, rawIndex });
  });

  if (!normalized.length) return { entries: [rootPath], index: 0 };

  const rawIndex =
    typeof rawIndexValue === 'number'
      ? Math.max(0, Math.min(raw.length - 1, Math.trunc(rawIndexValue)))
      : normalized[normalized.length - 1]!.rawIndex;
  const retained = normalized.slice(-UI_TAB_CTX_HISTORY_LIMIT);
  let index = -1;
  for (let position = retained.length - 1; position >= 0; position -= 1) {
    if (retained[position]!.rawIndex <= rawIndex) {
      index = position;
      break;
    }
  }
  if (index < 0) index = 0;

  return { entries: retained.map((entry) => entry.path), index };
}
