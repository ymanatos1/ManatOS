import { randomUUID } from 'node:crypto';

/**
 * One sanitized UI -> API transport trace shown by the developer API Traffic
 * Viewer. The trace deliberately contains transport facts only; subsystem-
 * specific diagnostics can be added later without coupling the viewer to any
 * business entity or expression function.
 */
export interface ApiTrafficEntry {
  id: string;
  requestId: string;
  startedAt: string;
  durationMs: number;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

const MAX_ENTRIES = 500;
const entries: ApiTrafficEntry[] = [];
let sequence = 0;

const sensitiveName = /(?:authorization|cookie|token|secret|password|credential|api[-_]?key|hash)/i;

/**
 * Redact sensitive material before it ever enters the in-memory developer
 * buffer. Rendering-time masking would be too late because developer state can
 * be inspected by other code in the browser once exposed through the endpoint.
 */
export function sanitizeTrafficValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Depth limit]';
  if (typeof value === 'string') {
    if (/^Bearer\s+/i.test(value)) return '[REDACTED]';
    return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeTrafficValue(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sensitiveName.test(key) ? '[REDACTED]' : sanitizeTrafficValue(child, depth + 1);
    }
    return result;
  }
  return String(value);
}

export function addApiTrafficEntry(entry: Omit<ApiTrafficEntry, 'id'>): ApiTrafficEntry {
  sequence += 1;
  const stored: ApiTrafficEntry = { ...entry, id: `${sequence}-${randomUUID()}` };
  entries.push(stored);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  return stored;
}

export function listApiTrafficEntries(afterId?: string): ApiTrafficEntry[] {
  if (!afterId) return [...entries];
  const index = entries.findIndex((entry) => entry.id === afterId);
  return index < 0 ? [...entries] : entries.slice(index + 1);
}

export function clearApiTrafficEntries(): void {
  entries.length = 0;
}
