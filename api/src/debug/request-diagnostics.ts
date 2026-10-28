import type {
  ApiDiagnosticContextSnapshot,
  ApiDiagnosticLogEntry,
  ApiRequestDiagnostics,
} from '@manatos/shared';

import type {
  ApiContextSnapshotCapture,
  ApiLevelSnapshot,
  ApiRequestSnapshot,
} from '../context/api-context-runtime.js';
import { sanitizeDiagnosticValue } from '../context/api-context-snapshot.js';
import { logger } from '../logging/logger.js';
import type { LogEntry } from '../logging/log-sink.js';

interface ActiveRequestDiagnostics {
  readonly requestId: string;
  readonly logs: ApiDiagnosticLogEntry[];
  readonly storageContexts: ApiDiagnosticContextSnapshot[];
}

/**
 * Request-scoped in-memory diagnostics collector used only to enrich an opted-in
 * original API response. It does not own persistent logs or CTX state.
 */
export class ApiRequestDiagnosticsCollector implements ApiContextSnapshotCapture {
  private readonly active = new Map<string, ActiveRequestDiagnostics>();

  constructor() {
    logger.subscribe((entry) => this.captureLog(entry));
  }

  begin(requestId: string): void {
    this.active.set(requestId, { requestId, logs: [], storageContexts: [] });
  }

  discard(requestId: string): void {
    this.active.delete(requestId);
  }

  complete(requestId: string, requestSnapshot: ApiRequestSnapshot | null): ApiRequestDiagnostics {
    const active = this.active.get(requestId) ?? { requestId, logs: [], storageContexts: [] };
    this.active.delete(requestId);

    return Object.freeze({
      requestId,
      capturedAt: new Date().toISOString(),
      apiContext: requestSnapshot ? this.projectContext(requestSnapshot) : null,
      storageContexts: Object.freeze([...active.storageContexts]),
      logs: Object.freeze([...active.logs]),
    });
  }

  captureRequest(): void {
    // The response middleware captures the request root immediately before the
    // original response is serialized. Post-finish request disposal is too late
    // to include in that same response and is still handled by the file writer.
  }

  captureLevel(snapshot: ApiLevelSnapshot): void {
    const active = this.active.get(snapshot.callId);
    if (!active || snapshot.diagnosticGroup !== 'storage') return;
    active.storageContexts.push(this.projectContext(snapshot));
  }

  private captureLog(entry: Readonly<LogEntry>): void {
    const active = this.active.get(entry.requestId);
    if (!active) return;
    active.logs.push(Object.freeze(sanitizeDiagnosticValue(entry) as ApiDiagnosticLogEntry));
  }

  private projectContext(
    snapshot: ApiRequestSnapshot | ApiLevelSnapshot,
  ): ApiDiagnosticContextSnapshot {
    return Object.freeze({
      path: snapshot.levelPath,
      ...('diagnosticGroup' in snapshot && snapshot.diagnosticGroup
        ? {
            subsystem: snapshot.diagnosticGroup,
            levelIds: Object.freeze([...snapshot.diagnosticLevelIds]),
          }
        : {}),
      ctx: sanitizeDiagnosticValue(snapshot.context),
    });
  }
}

export const apiRequestDiagnostics = new ApiRequestDiagnosticsCollector();
