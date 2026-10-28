import {
  type ApiTrafficEntry,
  type ApiTrafficHistory,
  type ApiTrafficSnapshot,
} from '../api-traffic-history.js';

export interface ApiTrafficRouteFilterItem {
  readonly key: string;
  readonly method: string;
  readonly path: string;
  readonly count: number;
  readonly visible: boolean;
}

export interface ApiTrafficViewFilter {
  readonly errorsOnly?: boolean;
  readonly ignoreRoutes?: boolean;
  readonly searchText?: string;
  readonly hiddenRoutes?: ReadonlySet<string>;
}

export interface ApiTrafficViewState {
  readonly pausedSnapshot: ApiTrafficSnapshot | null;
  readonly selectedId: number | null;
}

export function toggleApiTrafficPause(
  history: ApiTrafficHistory,
  state: ApiTrafficViewState,
): ApiTrafficViewState {
  if (state.pausedSnapshot) {
    return Object.freeze({
      pausedSnapshot: null,
      selectedId:
        state.selectedId !== null && history.get(state.selectedId) ? state.selectedId : null,
    });
  }

  return Object.freeze({
    pausedSnapshot: history.snapshot(),
    selectedId: state.selectedId,
  });
}

export function clearApiTrafficView(
  history: ApiTrafficHistory,
  state: ApiTrafficViewState,
): ApiTrafficViewState {
  const paused = state.pausedSnapshot !== null;
  history.clear();
  return Object.freeze({
    pausedSnapshot: paused ? history.snapshot() : null,
    selectedId: null,
  });
}

export function apiTrafficRouteKey(entry: ApiTrafficEntry): string {
  const raw = entry.path.split('?')[0] ?? entry.path;
  const normalized = raw
    .replace(/^\/api\/v1(?:\/|$)/, './')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '{id}')
    .replace(/\/[0-9]+(?=\/|$)/g, '/{id}');
  return `${entry.method.toUpperCase()} ${normalized}`;
}

export function projectApiTrafficRoutes(
  entries: readonly ApiTrafficEntry[],
  hiddenRoutes: ReadonlySet<string> = new Set(),
): readonly ApiTrafficRouteFilterItem[] {
  const counts = new Map<string, { method: string; path: string; count: number }>();
  for (const entry of entries) {
    const key = apiTrafficRouteKey(entry);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { method: entry.method, path: entry.path, count: 1 });
  }

  return [...counts.entries()]
    .map(([key, route]) => Object.freeze({ key, ...route, visible: !hiddenRoutes.has(key) }))
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
    );
}

export function projectApiTrafficEntries(
  entries: readonly ApiTrafficEntry[],
  filter: ApiTrafficViewFilter = {},
): readonly ApiTrafficEntry[] {
  const search = (filter.searchText ?? '').trim().toLocaleLowerCase();
  const hidden = filter.hiddenRoutes ?? new Set<string>();

  return entries
    .filter((entry) => {
      if (filter.errorsOnly && entry.ok !== false) return false;
      if (!filter.ignoreRoutes && hidden.has(apiTrafficRouteKey(entry))) return false;
      if (!search) return true;
      const haystack = `${entry.method} ${entry.path} ${entry.status ?? ''} ${entry.requestId}`;
      return haystack.toLocaleLowerCase().includes(search);
    })
    .reverse();
}

export function findApiTrafficEntry(
  entries: readonly ApiTrafficEntry[],
  id: number | null,
): ApiTrafficEntry | null {
  if (id === null) return null;
  return entries.find((entry) => entry.id === id) ?? null;
}

export function projectApiTrafficTransactionEntries(
  entries: readonly ApiTrafficEntry[],
  transactionId: string | undefined,
): readonly ApiTrafficEntry[] {
  if (!transactionId) return [];
  return entries.filter((entry) => entry.transactionId === transactionId);
}

/**
 * A UI server response is related to (but is NOT the raw body of) one upstream
 * entity GET. Provide that already-captured body for inspection without
 * duplicating it in the history or shipping private API bodies in HTTP headers.
 */
export function correlatedUiResourceResponse(
  entries: readonly ApiTrafficEntry[],
  selected: ApiTrafficEntry,
): ApiTrafficEntry | null {
  if (selected.source !== 'surface-upstream') return null;
  if (!/^\/api\/v1\/(?!public\/)/.test(selected.path)) return null;
  const related = entries.find(
    (entry) =>
      entry.requestId === selected.requestId &&
      entry.source !== 'surface-upstream' &&
      entry.method === selected.method &&
      entry.path.startsWith('/_manatos/auth/resources/') &&
      entry.state === 'completed' &&
      entry.ok === true &&
      entry.responseBody !== undefined,
  );
  return related ?? null;
}

/**
 * A captured JSON null is a body, not an absent body. Prefer the selected
 * request's captured body and fall back to the correlated UI resource result
 * only when that body is undefined (upstream summaries do not capture bodies).
 */
export function apiTrafficResponseBody(
  entries: readonly ApiTrafficEntry[],
  selected: ApiTrafficEntry,
): unknown {
  if (selected.responseBody !== undefined) return selected.responseBody;
  return correlatedUiResourceResponse(entries, selected)?.responseBody;
}
