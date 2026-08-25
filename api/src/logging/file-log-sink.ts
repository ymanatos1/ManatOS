import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { config } from '../config.js';
import type { LogEntry, LogSink } from './log-sink.js';

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
    try {
      const line = `${JSON.stringify(entry)}\n`;

      if (
        this.normalFile &&
        priorities[entry.level] >= priorities[config.LOG_FILE_MIN_LEVEL]
      ) {
        this.rotateIfNeeded(this.normalFile, Buffer.byteLength(line));
        appendFileSync(this.normalFile, line, 'utf8');
      }

      if (
        this.errorFile &&
        priorities[entry.level] >= priorities[config.LOG_ERROR_FILE_MIN_LEVEL]
      ) {
        this.rotateIfNeeded(this.errorFile, Buffer.byteLength(line));
        appendFileSync(this.errorFile, line, 'utf8');
      }
    } catch (error) {
      this.reportFailure('Unable to persist server log entry', error);
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
