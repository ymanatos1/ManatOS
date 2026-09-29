import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CLIENT_RUNTIME_LOG = resolve(process.cwd(), '../data/logs/client/ui-runtime.jsonl');
let failureReported = false;

/**
 * Persist one browser diagnostic atomically from the UI process. appendFileSync opens,
 * appends and closes the file for every event, so diagnostics are visible on disk
 * immediately and no long-lived file handle can retain unwritten client progress.
 */
export function appendClientRuntimeDiagnostic(event: unknown): void {
  try {
    mkdirSync(dirname(CLIENT_RUNTIME_LOG), { recursive: true });
    appendFileSync(
      CLIENT_RUNTIME_LOG,
      `${JSON.stringify({ receivedAt: new Date().toISOString(), event })}\n`,
      'utf8',
    );
  } catch (error) {
    if (failureReported) return;
    failureReported = true;
    console.error('[UI runtime] Unable to persist client diagnostic:', error);
  }
}

export function clientRuntimeLogPath(): string {
  return CLIENT_RUNTIME_LOG;
}
