import { readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SharedSystemSettingsDocument {
  storage?: {
    debugging?: {
      outputDirectory?: unknown;
    };
  };
}

export interface ApiTrafficLogFile {
  name: string;
  content: string;
  terminal?: boolean;
}

export function apiTrafficRepositoryRoot(moduleUrl = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), '../../..');
}

const repositoryRoot = apiTrafficRepositoryRoot();
const sharedSystemSettingsPath = () => resolve(repositoryRoot, 'data/system-settings.json');

/**
 * Resolve the API-owned debug directory from the shared bootstrap settings file.
 *
 * This deliberately supports the simple co-located UI/API deployment only. The
 * setting is defined relative to the API process, so a UI process that can see
 * the same repository layout resolves relative values against the sibling
 * `api/` directory rather than against its own working directory. Split-server
 * deployments simply return no local log files until a remote diagnostic
 * transport is introduced.
 */
async function apiDebugOutputDirectory(): Promise<string | null> {
  const settingsPath = sharedSystemSettingsPath();
  try {
    const settings = JSON.parse(
      await readFile(settingsPath, 'utf8'),
    ) as SharedSystemSettingsDocument;
    const configured = settings.storage?.debugging?.outputDirectory;
    if (typeof configured !== 'string' || !configured.trim()) return null;

    const value = configured.trim();
    if (isAbsolute(value)) return value;

    return resolve(repositoryRoot, 'api', value);
  } catch {
    return null;
  }
}

function safeRequestDirectoryName(requestId: string): string | null {
  const value = requestId.trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(value) ? value : null;
}

async function readStorageContextSnapshots(
  debugDirectory: string,
  requestId: string,
): Promise<ApiTrafficLogFile[]> {
  const safeRequestId = safeRequestDirectoryName(requestId);
  if (!safeRequestId) return [];

  const storageRoot = resolve(debugDirectory, safeRequestId, 'storage');
  const result: ApiTrafficLogFile[] = [];

  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'ctx.json') continue;

      try {
        const snapshotPath = relative(storageRoot, path).replaceAll('\\', '/');
        result.push({
          name: `Storage CTX · ${snapshotPath.replace(/\/ctx\.json$/, '')}`,
          content: await readFile(path, 'utf8'),
        });
      } catch {
        // A snapshot can disappear during inspection without affecting traffic.
      }
    }
  };

  await visit(storageRoot);
  return result;
}

async function readApiContextSnapshot(
  debugDirectory: string,
  requestId: string,
): Promise<ApiTrafficLogFile[]> {
  const safeRequestId = safeRequestDirectoryName(requestId);
  if (!safeRequestId) return [];

  try {
    return [
      {
        name: 'API CTX',
        content: await readFile(resolve(debugDirectory, safeRequestId, 'api.json'), 'utf8'),
      },
    ];
  } catch {
    return [];
  }
}

export function apiLogLineMatchesRequest(line: string, requestId: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed) as { requestId?: unknown };
    return parsed.requestId === requestId;
  } catch {
    return trimmed.includes(`[${requestId}]`);
  }
}

/**
 * Read every locally available diagnostic source for one captured API request.
 * Normal/error logs and rotated log files are filtered by request id. Existing
 * request API CTX and STORAGE CTX snapshots are returned as independent tabs.
 * When a transaction id is supplied, the same canonical API log files are also
 * correlated by transactionId into one transaction lifecycle tab; no parallel
 * diagnostic format is introduced.
 */
export function apiLogLineMatchesTransaction(line: string, transactionId: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed) as { transactionId?: unknown };
    return parsed.transactionId === transactionId;
  } catch {
    return trimmed.includes('"transactionId":"' + transactionId + '"');
  }
}

type TransactionDiagnosticEvent = {
  timestamp?: unknown;
  transactionId?: unknown;
  transactionEvent?: unknown;
  method?: unknown;
  path?: unknown;
  statusCode?: unknown;
  durationMs?: unknown;
  phase?: unknown;
  trigger?: unknown;
  failures?: unknown;
  history?: unknown;
  code?: unknown;
  location?: unknown;
  operationId?: unknown;
  kind?: unknown;
  entityKey?: unknown;
  entityLabel?: unknown;
  identity?: unknown;
  description?: unknown;
  changes?: unknown;
  pictures?: unknown;
  collections?: unknown;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function parseTransactionEvents(lines: string[]): TransactionDiagnosticEvent[] {
  const seen = new Set<string>();
  const events: TransactionDiagnosticEvent[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line.trim()) as TransactionDiagnosticEvent;
      const key = JSON.stringify(event);
      if (!seen.has(key)) {
        seen.add(key);
        events.push(event);
      }
    } catch {
      // Transaction execution diagnostics are structured JSON. Ignore unrelated
      // legacy/plain-text lines rather than leaking raw log formatting here.
    }
  }
  return events.sort((left, right) => text(left.timestamp).localeCompare(text(right.timestamp)));
}

function formatFailure(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? 'Unknown failure');
  const failure = value as Record<string, unknown>;
  return (
    [failure.code, failure.message, failure.description]
      .filter((part): part is string => typeof part === 'string' && Boolean(part))
      .join(' · ') || JSON.stringify(value)
  );
}

export function projectTransactionDiagnostic(
  transactionId: string,
  lines: string[],
): { content: string; terminal: boolean } {
  const events = parseTransactionEvents(lines);
  const begin = events.find((event) => event.transactionEvent === 'begin');
  const terminalEvent = [...events]
    .reverse()
    .find((event) =>
      ['committed', 'rolled-back', 'expired-rolled-back'].includes(text(event.transactionEvent)),
    );
  const completed = events.filter((event) => event.transactionEvent === 'operation-completed');
  const workspaceOperations = events.filter(
    (event) => event.transactionEvent === 'workspace-operation-completed',
  );
  const startedAt = text(begin?.timestamp) || text(events[0]?.timestamp) || '—';
  const completedAt = text(terminalEvent?.timestamp) || 'In progress';
  const durationMs = (() => {
    if (!terminalEvent || startedAt === '—') return null;
    const startedMs = Date.parse(startedAt);
    const completedMs = Date.parse(completedAt);
    return Number.isFinite(startedMs) && Number.isFinite(completedMs)
      ? Math.max(0, completedMs - startedMs)
      : null;
  })();
  const duration = durationMs === null ? (terminalEvent ? '—' : 'In progress') : `${durationMs} ms`;
  const outcome = terminalEvent
    ? text(terminalEvent.transactionEvent).replaceAll('-', ' ').toUpperCase()
    : 'IN PROGRESS';

  const rows: string[] = [
    'Transaction-wide trace',
    `Transaction: ${transactionId}`,
    `Outcome: ${outcome}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    `Duration: ${duration}`,
    '',
    'Requests',
  ];
  if (!completed.length) rows.push('  (none completed yet)');
  completed.forEach((event, index) => {
    const status = Number(event.statusCode);
    const result =
      Number.isFinite(status) && status < 400 ? 'OK' : `FAILED${status ? ` (${status})` : ''}`;
    const duration = Number(event.durationMs);
    const timing = Number.isFinite(duration) ? ` · ${duration} ms` : '';
    rows.push(
      `${index + 1}. ${text(event.method) || '?'} ${text(event.path) || '?'}    ${result}${timing}`,
    );
  });
  if (workspaceOperations.length) {
    rows.push('', 'Operations');
    workspaceOperations.forEach((event, index) => {
      const duration = Number(event.durationMs);
      const timing = Number.isFinite(duration) ? ` · ${duration} ms` : '';
      const kind = text(event.kind).toUpperCase() || '?';
      const entity = text(event.entityLabel) || text(event.entityKey) || 'Entry';
      const description = text(event.description) || text(event.identity) || '—';
      rows.push(`${index + 1}. ${kind} ${entity} — ${description}    OK${timing}`);

      const changes = Array.isArray(event.changes) ? event.changes : [];
      changes.forEach((raw) => {
        const change = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        const before = change.before === undefined ? '∅' : JSON.stringify(change.before);
        const after = change.after === undefined ? '∅' : JSON.stringify(change.after);
        rows.push(
          `   JSON · ${text(change.label) || text(change.field) || 'Field'}: ${before} → ${after}`,
        );
      });
      const pictures = Array.isArray(event.pictures) ? event.pictures : [];
      pictures.forEach((raw) => {
        const change = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        const before = change.before == null ? '∅' : JSON.stringify(change.before);
        const after = change.after == null ? '∅' : JSON.stringify(change.after);
        rows.push(
          `   Picture · ${text(change.label) || text(change.field) || 'Picture'}: ${before} → ${after}`,
        );
      });
      const collections = Array.isArray(event.collections) ? event.collections : [];
      collections.forEach((raw) => {
        const collection = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        rows.push(
          `   Collection · ${text(collection.key) || 'Collection'}: ${Number(collection.itemCount) || 0} items`,
        );
      });
    });
  }

  const injectedFault = events.find((event) => event.transactionEvent === 'fault-injected');
  if (injectedFault) {
    rows.push(
      '',
      `Injected fault: ${text(injectedFault.code) || 'DEBUG_TRANSACTION_FAILURE'}`,
      `Location: ${text(injectedFault.location) || 'workspace transaction'}`,
    );
  }

  const history = (Array.isArray(terminalEvent?.history) ? terminalEvent.history : []).filter(
    (item) =>
      item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).phase ===
        (terminalEvent?.phase === 'rollback' ? 'rollback' : 'commit'),
  );
  if (terminalEvent) {
    rows.push('', terminalEvent.phase === 'rollback' ? 'Rollback' : 'Finalization');
    if (!history.length) rows.push('  (no deferred actions)');
    history.forEach((item, index) => {
      const action = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const description = text(action.description) || text(action.phase) || 'Transaction action';
      const status = text(action.status).toLowerCase();
      rows.push(
        `${index + 1}. ${description}    ${
          status === 'completed' ? 'OK' : status ? status.toUpperCase() : 'UNKNOWN'
        }`,
      );
    });
  }

  const failures = Array.isArray(terminalEvent?.failures) ? terminalEvent.failures : [];
  if (failures.length) {
    rows.push('', 'Failures');
    failures.forEach((failure, index) => rows.push(`${index + 1}. ${formatFailure(failure)}`));
  }
  rows.push('', `Result: ${outcome}${failures.length ? ' WITH FAILURES' : ''}`);
  return { content: rows.join('\n'), terminal: Boolean(terminalEvent) };
}

export async function readApiTrafficLogs(
  requestId: string,
  transactionId?: string,
): Promise<ApiTrafficLogFile[]> {
  const debugDirectory = await apiDebugOutputDirectory();
  if (!debugDirectory) return [];

  const logsDirectory = dirname(debugDirectory);
  try {
    const names = (await readdir(logsDirectory))
      .filter((name) => /\.log(?:\.\d+)?$/i.test(name))
      .sort((left, right) => left.localeCompare(right));

    const result: ApiTrafficLogFile[] = [];
    const transactionLines: string[] = [];
    for (const name of names) {
      try {
        const content = await readFile(resolve(logsDirectory, name), 'utf8');
        const matching = content
          .split(/\r?\n/)
          .filter((line) => apiLogLineMatchesRequest(line, requestId));
        if (matching.length) result.push({ name, content: matching.join('\n') });
        if (transactionId) {
          transactionLines.push(
            ...content
              .split(/\r?\n/)
              .filter((line) => apiLogLineMatchesTransaction(line, transactionId)),
          );
        }
      } catch {
        // A rotated/deleted/inaccessible diagnostic file is simply unavailable.
      }
    }
    if (transactionLines.length) {
      const diagnostic = projectTransactionDiagnostic(transactionId ?? '', transactionLines);
      result.push({ name: 'Transaction', ...diagnostic });
    }
    result.push(...(await readApiContextSnapshot(debugDirectory, requestId)));
    result.push(...(await readStorageContextSnapshots(debugDirectory, requestId)));
    return result;
  } catch {
    return [
      ...(await readApiContextSnapshot(debugDirectory, requestId)),
      ...(await readStorageContextSnapshots(debugDirectory, requestId)),
    ];
  }
}
