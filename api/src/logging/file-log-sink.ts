import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { config } from '../config.js';
import type { LogEntry, LogSink } from './log-sink.js';

const priorities: Record<LogEntry['level'], number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Persist structured JSON-lines logs under the runtime data area.
 *
 * Two files are maintained intentionally:
 *
 *   manatos-api.log       configured minimum level and above;
 *   manatos-api-error.log ERROR entries only.
 *
 * A simple size rotation keeps one previous generation. This is deliberately
 * dependency-free for now and can later be replaced by a richer rolling-file
 * sink without changing callers.
 */
export class FileLogSink implements LogSink {
  private readonly directory: string;
  private readonly normalFile: string;
  private readonly errorFile: string;
  private failureReported = false;

  constructor() {
    this.directory = isAbsolute(config.LOG_DIR)
      ? config.LOG_DIR
      : resolve(process.cwd(), config.LOG_DIR);

    this.normalFile = resolve(this.directory, 'manatos-api.log');
    this.errorFile = resolve(this.directory, 'manatos-api-error.log');

    try {
      mkdirSync(this.directory, { recursive: true });
    } catch (error) {
      this.reportFailure('Unable to create log directory', error);
    }
  }

  write(entry: LogEntry): void {
    if (!config.LOG_FILE_ENABLED) return;

    try {
      const line = `${JSON.stringify(entry)}\n`;

      if (priorities[entry.level] >= priorities[config.LOG_FILE_MIN_LEVEL]) {
        this.rotateIfNeeded(this.normalFile, Buffer.byteLength(line));
        appendFileSync(this.normalFile, line, 'utf8');
      }

      if (entry.level === 'error') {
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

    // This fallback intentionally bypasses the logger to avoid recursion when
    // the logging infrastructure itself is the failing component.
    console.error(`[ManatOS logging] ${message}:`, error);
  }
}
