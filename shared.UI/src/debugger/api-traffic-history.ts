import type { ApiRequestDiagnostics } from '@manatos/shared';

export const DEFAULT_API_TRAFFIC_HISTORY_CAPACITY = 500;

export type ApiTrafficEntryState = 'pending' | 'completed' | 'failed';

export interface ApiTrafficEntry {
  readonly id: number;
  readonly requestId: string;
  readonly source?: 'surface-upstream';
  readonly startedAt: string;
  readonly durationMs: number | null;
  readonly method: string;
  readonly path: string;
  readonly status: number | null;
  readonly statusText: string;
  readonly ok: boolean | null;
  readonly state: ApiTrafficEntryState;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly requestBody?: unknown;
  readonly responseBody?: unknown;
  readonly error?: string;
  readonly transactionId?: string;
  readonly diagnostics?: ApiRequestDiagnostics;
}

export interface ApiTrafficSnapshot {
  readonly revision: number;
  readonly entries: readonly ApiTrafficEntry[];
}

export interface ApiTrafficBeginInput {
  requestId: string;
  source?: 'surface-upstream';
  method: string;
  path: string;
  requestHeaders?: Headers | Readonly<Record<string, string>>;
  requestBody?: unknown;
}

export interface ApiTrafficCompleteInput {
  status: number;
  statusText?: string;
  ok: boolean;
  responseHeaders?: Headers | Readonly<Record<string, string>>;
  responseBody?: unknown;
  diagnostics?: ApiRequestDiagnostics;
  durationMs?: number;
}

export type ApiTrafficHistoryListener = (revision: number, history: ApiTrafficHistory) => void;

const sensitiveName =
  /(?:authorization|cookie|token|secret|password|credential|api[-_]?key|client[-_]?secret|private[-_]?key|connection[-_]?string|session[-_]?id|surface-upstream)/i;

function sanitizeValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && sensitiveName.test(key)) return '[REDACTED]';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, undefined, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitizeValue(childValue, childKey, seen),
      ]),
    );
    seen.delete(value);
    return result;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function sanitizedTrafficPath(path: string): string {
  try {
    // Relative URLs need an inert base solely for parsing query keys.
    const url = new URL(path, 'http://manatos.invalid');
    for (const key of url.searchParams.keys())
      if (sensitiveName.test(key)) url.searchParams.set(key, '[REDACTED]');
    return url.pathname + url.search + url.hash;
  } catch {
    return path.split('?')[0] ?? '/';
  }
}

function transactionIdFromBody(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.transactionId === 'string' && record.transactionId) return record.transactionId;
  const data = record.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const id = (data as Record<string, unknown>).transactionId;
  return typeof id === 'string' && id ? id : null;
}

function transactionIdFromPath(path: string): string | null {
  const match = path.match(/\/transactions\/([^/?]+)(?:\/|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function headerRecord(
  headers?: Headers | Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  if (!headers) return Object.freeze({});
  const result: Record<string, string> = {};

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, name) => {
      result[name] = sensitiveName.test(name) ? '[REDACTED]' : value;
    });
  } else {
    for (const [name, value] of Object.entries(headers)) {
      result[name] = sensitiveName.test(name) ? '[REDACTED]' : String(value);
    }
  }

  return Object.freeze(result);
}

function frozenEntries(entries: ApiTrafficEntry[]): readonly ApiTrafficEntry[] {
  return Object.freeze(entries);
}

/**
 * Canonical browser-side history of UI -> API exchanges.
 *
 * The transport owns recording. Debugger components only subscribe/select/filter
 * this history and never keep a second copy of the captured exchanges.
 *
 * Each revision owns one immutable entry-array snapshot. Paused viewers may retain
 * a snapshot reference while recording continues into later bounded revisions.
 */
export class ApiTrafficHistory {
  private readonly listeners = new Set<ApiTrafficHistoryListener>();
  private entriesValue: readonly ApiTrafficEntry[] = Object.freeze([]);
  private sequence = 0;
  private revisionValue = 0;
  private snapshotValue: ApiTrafficSnapshot = Object.freeze({
    revision: 0,
    entries: this.entriesValue,
  });

  constructor(readonly capacity = DEFAULT_API_TRAFFIC_HISTORY_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('API traffic history capacity must be a positive integer.');
    }
  }

  get revision(): number {
    return this.revisionValue;
  }

  entries(): readonly ApiTrafficEntry[] {
    return this.entriesValue;
  }

  snapshot(): ApiTrafficSnapshot {
    return this.snapshotValue;
  }

  get(id: number): ApiTrafficEntry | null {
    return this.entriesValue.find((entry) => entry.id === id) ?? null;
  }

  subscribe(listener: ApiTrafficHistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  begin(input: ApiTrafficBeginInput): number {
    const id = ++this.sequence;
    const requestHeaders = headerRecord(input.requestHeaders);
    const transactionId =
      Object.entries(requestHeaders).find(
        ([name]) => name.toLowerCase() === 'x-manatos-transaction-id',
      )?.[1] ?? transactionIdFromPath(input.path);

    const entry: ApiTrafficEntry = Object.freeze({
      id,
      requestId: input.requestId,
      ...(input.source ? { source: input.source } : {}),
      startedAt: new Date().toISOString(),
      durationMs: null,
      method: input.method,
      path: sanitizedTrafficPath(input.path),
      status: null,
      statusText: '',
      ok: null,
      state: 'pending' as const,
      requestHeaders,
      responseHeaders: Object.freeze({}),
      ...(input.requestBody === undefined ? {} : { requestBody: sanitizeValue(input.requestBody) }),
      ...(transactionId ? { transactionId } : {}),
    });

    const next = [...this.entriesValue, entry];
    this.entriesValue = frozenEntries(
      next.length > this.capacity ? next.slice(next.length - this.capacity) : next,
    );
    this.emit();
    return id;
  }

  complete(id: number, input: ApiTrafficCompleteInput): void {
    const index = this.entriesValue.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const current = this.entriesValue[index]!;
    const durationMs = Math.max(0, Date.now() - Date.parse(current.startedAt));

    const responseHeaders = headerRecord(input.responseHeaders);
    const transactionId =
      current.transactionId ??
      Object.entries(responseHeaders).find(
        ([name]) => name.toLowerCase() === 'x-manatos-transaction-id',
      )?.[1] ??
      transactionIdFromBody(input.responseBody) ??
      undefined;

    const next = [...this.entriesValue];
    next[index] = Object.freeze({
      ...current,
      durationMs: input.durationMs ?? durationMs,
      status: input.status,
      statusText: input.statusText ?? '',
      ok: input.ok,
      state: 'completed' as const,
      responseHeaders,
      ...(transactionId ? { transactionId } : {}),
      ...(input.responseBody === undefined
        ? {}
        : { responseBody: sanitizeValue(input.responseBody) }),
      ...(input.diagnostics
        ? { diagnostics: sanitizeValue(input.diagnostics) as ApiRequestDiagnostics }
        : {}),
    });
    this.entriesValue = frozenEntries(next);
    this.emit();
  }

  fail(id: number, error: unknown): void {
    const index = this.entriesValue.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const current = this.entriesValue[index]!;
    const next = [...this.entriesValue];
    next[index] = Object.freeze({
      ...current,
      durationMs: Math.max(0, Date.now() - Date.parse(current.startedAt)),
      ok: false,
      state: 'failed' as const,
      error: error instanceof Error ? error.message : String(error),
    });
    this.entriesValue = frozenEntries(next);
    this.emit();
  }

  clear(): void {
    if (!this.entriesValue.length) return;
    this.entriesValue = Object.freeze([]);
    this.emit();
  }

  private emit(): void {
    const revision = ++this.revisionValue;
    this.snapshotValue = Object.freeze({ revision, entries: this.entriesValue });
    for (const listener of this.listeners) {
      try {
        listener(revision, this);
      } catch {
        // A viewer failure must never affect transport recording.
      }
    }
  }
}

export const apiTrafficHistory = new ApiTrafficHistory();
