import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { config } from '../config.js';
import type { LogEntry, LogSink } from './log-sink.js';

const transientFileErrorCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);
const transientRetryDelaysMs = [10, 25, 50];

const priorities: Record<LogEntry['level'], number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function resolveConfiguredPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function isTransientFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    transientFileErrorCodes.has(String((error as NodeJS.ErrnoException).code ?? '')),
  );
}

/**
 * The sink is synchronous by design so log ordering matches application order.
 * A very short synchronous wait is used only after Windows reports a transient
 * file lock (for example antivirus/indexing touching the active log file).
 */
function waitForTransientFileRetry(delayMs: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, delayMs);
}

function withTransientFileRetry(operation: () => void): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      operation();
      return;
    } catch (error) {
      if (!isTransientFileError(error) || attempt >= transientRetryDelaysMs.length) throw error;
      waitForTransientFileRetry(transientRetryDelaysMs[attempt]!);
    }
  }
}

/**
 * JSON-lines file sink.
 *
 * File storage is enabled purely by configured path presence. This keeps the
 * configuration symmetric with future sinks (for example a database URL).
 * Any file-system failure is best-effort and never terminates the API.
 */
export class FileLogSink implements LogSink {
  private readonly normalFile = resolveConfiguredPath(config.LOG_FILE_PATH);
  private readonly errorFile = resolveConfiguredPath(config.LOG_ERROR_FILE_PATH);
  private failureReported = false;

  constructor() {
    for (const file of [this.normalFile, this.errorFile]) {
      if (!file) continue;
      try {
        mkdirSync(dirname(file), { recursive: true });
      } catch (error) {
        this.reportFailure(`Unable to create log directory for ${file}`, error);
      }
    }
  }

  write(entry: LogEntry): void {
    const line = `${JSON.stringify(entry)}\n`;

    if (this.normalFile && priorities[entry.level] >= priorities[config.LOG_FILE_MIN_LEVEL]) {
      this.writeFile(this.normalFile, line);
    }

    /*
     * Treat destinations independently: a temporary lock on one file must not
     * prevent another configured destination from receiving the same entry.
     */
    if (this.errorFile && priorities[entry.level] >= priorities[config.LOG_ERROR_FILE_MIN_LEVEL]) {
      this.writeFile(this.errorFile, line);
    }
  }

  private writeFile(file: string, line: string): void {
    try {
      withTransientFileRetry(() => {
        this.rotateIfNeeded(file, Buffer.byteLength(line));
        appendFileSync(file, line, 'utf8');
      });
    } catch (error) {
      this.reportFailure(`Unable to persist server log entry to ${file}`, error);
    }
  }

  private rotateIfNeeded(file: string, incomingBytes: number): void {
    if (!existsSync(file)) return;

    const currentBytes = statSync(file).size;
    if (currentBytes + incomingBytes <= config.LOG_FILE_MAX_BYTES) return;

    const previous = `${file}.1`;
    rmSync(previous, { force: true });
    renameSync(file, previous);
  }

  private reportFailure(message: string, error: unknown): void {
    if (this.failureReported) return;
    this.failureReported = true;

    // Intentionally bypass the logger to avoid recursion when logging itself fails.
    console.error(`[ManatOS logging] ${message}:`, error);
  }
}
