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
 * request API CTX and STORAGE CTX snapshots are returned as independent tabs
 * from the same configured debug root; no parallel diagnostic format is
 * introduced.
 */
export async function readApiTrafficLogs(requestId: string): Promise<ApiTrafficLogFile[]> {
  const debugDirectory = await apiDebugOutputDirectory();
  if (!debugDirectory) return [];

  const logsDirectory = dirname(debugDirectory);
  try {
    const names = (await readdir(logsDirectory))
      .filter((name) => /\.log(?:\.\d+)?$/i.test(name))
      .sort((left, right) => left.localeCompare(right));

    const result: ApiTrafficLogFile[] = [];
    for (const name of names) {
      try {
        const content = await readFile(resolve(logsDirectory, name), 'utf8');
        const matching = content
          .split(/\r?\n/)
          .filter((line) => apiLogLineMatchesRequest(line, requestId));
        if (matching.length) result.push({ name, content: matching.join('\n') });
      } catch {
        // A rotated/deleted/inaccessible diagnostic file is simply unavailable.
      }
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
