import { operationContext } from '@manatos/shared';

import { config } from '../config.js';
import { FileLogSink } from './file-log-sink.js';
import type { LogEntry, LogSink } from './log-sink.js';

export type LogLevel = LogEntry['level'];
export type LogFields = Record<string, unknown>;

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKey = /(password|secret|token|authorization|cookie|api[-_]?key|client[-_]?secret)/i;

/**
 * Fields intentionally excluded from server logs.
 *
 * The semantic operation trace remains available in API error responses for
 * permitted power-user diagnostics, but serializing the complete tree into
 * normal server logs produces very large, repetitive entries. The requestId
 * and operationId are enough to correlate routine logs.
 */
const excludedLogKey = /^operationTrace$/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return '[REDACTED]';
  if (key && excludedLogKey.test(key)) return undefined;

  if (value instanceof Error) {
    const anyError = value as Error & {
      code?: unknown;
      response?: unknown;
      responseCode?: unknown;
      command?: unknown;
    };

    return {
      name: value.name,
      message: value.message,
      ...(anyError.code !== undefined ? { code: anyError.code } : {}),
      ...(anyError.responseCode !== undefined ? { responseCode: anyError.responseCode } : {}),
      ...(anyError.response !== undefined ? { response: anyError.response } : {}),
      ...(anyError.command !== undefined ? { command: anyError.command } : {}),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([childKey]) => !excludedLogKey.test(childKey))
        .map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)])
        .filter(([, childValue]) => childValue !== undefined),
    );
  }

  return value;
}

function sanitizeFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => !excludedLogKey.test(key))
      .map(([key, value]) => [key, sanitize(value, key)])
      .filter(([, value]) => value !== undefined),
  );
}

/**
 * Logging destinations are intentionally pluggable.
 *
 * File logging is the first persistence sink. A database sink can later be
 * added to this array (with its own minimum severity/configuration) so a log
 * entry can be written to console + files + database independently. A broken
 * database sink must never prevent the file/console sinks from succeeding.
 */
const sinks: LogSink[] = [new FileLogSink()];

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (priorities[level] < priorities[config.LOG_LEVEL]) return;

  const sanitizedFields = sanitizeFields(fields);
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: operationContext.getRequestId(),
    message,
    ...sanitizedFields,
  };

  writeConsole(entry);

  for (const sink of sinks) {
    try {
      sink.write(entry);
    } catch (error) {
      // A custom/future sink is not allowed to break application execution or
      // prevent the remaining destinations from receiving the entry.
      console.error('[ManatOS logging] Log sink failed:', error);
    }
  }
}

function writeConsole(entry: LogEntry): void {
  if (config.LOG_FORMAT === 'json') {
    const line = JSON.stringify(entry);
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const { timestamp, level, requestId, message, ...details } = entry;
  const serializedDetails = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${requestId}]`;

  if (level === 'error') console.error(`${prefix} ${message}${serializedDetails}`);
  else if (level === 'warn') console.warn(`${prefix} ${message}${serializedDetails}`);
  else console.log(`${prefix} ${message}${serializedDetails}`);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
  error: (message: string, fields?: LogFields) => write('error', message, fields),
};
