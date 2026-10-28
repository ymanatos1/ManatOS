/** Request header controlling optional ManatOS API diagnostics. */
export const MANATOS_API_DIAGNOSTICS_HEADER = 'x-manatos-diagnostics';

/**
 * Three-state diagnostics transport policy.
 * false        -> diagnostics disabled
 * true         -> diagnostics enabled, normal JSON response
 * 'compressed' -> diagnostics enabled, compressed JSON response
 */
export type ApiDiagnosticsMode = false | true | 'compressed';

/** Current development default. Configuration ownership is deliberately deferred. */
export const DEFAULT_API_DIAGNOSTICS_MODE: ApiDiagnosticsMode = true;

export function apiDiagnosticsModeHeaderValue(mode: ApiDiagnosticsMode): string {
  if (mode === 'compressed') return 'compressed';
  return mode ? 'true' : 'false';
}

export function parseApiDiagnosticsMode(value: unknown): ApiDiagnosticsMode {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'compressed') return 'compressed';
  if (normalized === 'true') return true;
  return false;
}

export interface ApiDiagnosticLogEntry {
  readonly timestamp: string;
  readonly level: string;
  readonly requestId: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

export interface ApiDiagnosticContextSnapshot {
  readonly path: string;
  readonly subsystem?: string;
  readonly levelIds?: readonly string[];
  readonly ctx: unknown;
}

export interface ApiRequestDiagnostics {
  readonly requestId: string;
  readonly capturedAt: string;
  readonly apiContext: ApiDiagnosticContextSnapshot | null;
  readonly storageContexts: readonly ApiDiagnosticContextSnapshot[];
  readonly logs: readonly ApiDiagnosticLogEntry[];
}

/** Reserved response envelope used only when diagnostics were requested and allowed. */
export interface ApiDiagnosticsResponseEnvelope<T = unknown> {
  readonly $manatosDiagnostics: ApiRequestDiagnostics;
  readonly response: T;
}

export function isApiDiagnosticsResponseEnvelope(
  value: unknown,
): value is ApiDiagnosticsResponseEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const diagnostics = record.$manatosDiagnostics;
  return (
    diagnostics !== null &&
    typeof diagnostics === 'object' &&
    !Array.isArray(diagnostics) &&
    typeof (diagnostics as Record<string, unknown>).requestId === 'string' &&
    'response' in record
  );
}
