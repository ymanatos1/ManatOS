import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { logger } from '../logging/logger.js';
import type {
  ApiContextSnapshotCapture,
  ApiLevelSnapshot,
  ApiRequestSnapshot,
} from './api-context-runtime.js';

const sensitiveKey =
  /(password|secret|token|authorization|cookie|api[-_]?key|client[-_]?secret|private[-_]?key|credential|connection[-_]?string|refresh[-_]?token|access[-_]?token|session[-_]?id)/i;

function safePathSegment(value: string): string {
  const safe = value
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+$/, '_')
    .slice(0, 180);
  return safe || '_';
}

function sanitizeDiagnosticValue(
  value: unknown,
  key?: string,
  seen = new WeakSet<object>(),
): unknown {
  if (key && sensitiveKey.test(key)) return '[REDACTED]';

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength} bytes]`;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, undefined, seen));
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitizeDiagnosticValue(childValue, childKey, seen),
      ]),
    );
    seen.delete(value);
    return result;
  }

  if (typeof value === 'bigint') return value.toString();
  return value;
}

export interface ApiContextSnapshotWriterOptions {
  settings: () => ApiContextSnapshotSettings;
  warn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ApiContextSnapshotSettings {
  enabled: boolean;
  outputDirectory: string;
}

/**
 * Post-request API CTX diagnostic writer.
 *
 * Capture is deliberately fire-and-forget from request lifecycle code: the CTX
 * subtree is sanitized synchronously before disposal and file I/O is queued.
 * Snapshot failures are diagnostics failures only and can never fail the API
 * operation that produced them.
 */
export class ApiContextSnapshotWriter implements ApiContextSnapshotCapture {
  private readonly pending = new Set<Promise<void>>();
  private readonly warn: (message: string, fields?: Record<string, unknown>) => void;

  constructor(private readonly options: ApiContextSnapshotWriterOptions) {
    this.warn = options.warn ?? logger.warn;
  }

  captureRequest(snapshot: ApiRequestSnapshot): void {
    if (!this.enabled()) return;
    const document = this.document('request-dispose', snapshot, snapshot.context);
    const filePath = resolve(this.outputRoot(), safePathSegment(snapshot.callId), 'api.json');
    this.queueWrite(filePath, document, snapshot);
  }

  captureLevel(snapshot: ApiLevelSnapshot): void {
    if (!this.enabled() || snapshot.diagnosticGroup !== 'storage') return;

    const ids = snapshot.diagnosticLevelIds.map(safePathSegment);
    if (!ids.length) return;
    const pathParts: string[] = [
      this.outputRoot(),
      safePathSegment(snapshot.callId),
      'storage',
      ids[0]!,
    ];
    for (const nestedId of ids.slice(1)) pathParts.push('levels', nestedId);
    pathParts.push('ctx.json');

    const document = this.document('level-dispose', snapshot, snapshot.context);
    this.queueWrite(resolve(...pathParts), document, snapshot);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  private enabled(): boolean {
    try {
      return this.options.settings().enabled === true;
    } catch (error) {
      this.warn('API CTX snapshot settings could not be read', { error });
      return false;
    }
  }

  private outputRoot(): string {
    const configured = this.options.settings().outputDirectory.trim();
    const directory = configured || '../data/logs/api/';
    return isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
  }

  private document(
    reason: 'request-dispose' | 'level-dispose',
    snapshot: ApiRequestSnapshot | ApiLevelSnapshot,
    context: unknown,
  ) {
    return {
      snapshot: sanitizeDiagnosticValue({
        callId: snapshot.callId,
        callPath: snapshot.callPath,
        levelPath: snapshot.levelPath,
        capturedAt: new Date().toISOString(),
        reason,
        ...('diagnosticGroup' in snapshot && snapshot.diagnosticGroup
          ? {
              subsystem: snapshot.diagnosticGroup,
              levelIds: snapshot.diagnosticLevelIds,
            }
          : {}),
      }),
      ctx: sanitizeDiagnosticValue(context),
    };
  }

  private queueWrite(
    filePath: string,
    document: unknown,
    snapshot: ApiRequestSnapshot | ApiLevelSnapshot,
  ): void {
    const task = (async () => {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
      } catch (error) {
        this.warn('API CTX snapshot could not be written', {
          callId: snapshot.callId,
          levelPath: snapshot.levelPath,
          filePath,
          error,
        });
      }
    })();
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }
}

let configuredWriter: ApiContextSnapshotWriter | null = null;

export function configureApiContextSnapshots(settings: () => ApiContextSnapshotSettings): void {
  configuredWriter = new ApiContextSnapshotWriter({ settings });
}

export function apiContextSnapshotCapture(): ApiContextSnapshotCapture | null {
  return configuredWriter;
}
