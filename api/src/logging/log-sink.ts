/**
 * Structured log entry produced by the ManatOS server logger.
 *
 * Sinks receive an already-sanitized entry so secret redaction remains
 * centralized and every destination gets the same safe payload.
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  requestId: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Pluggable log destination.
 *
 * Logging is deliberately best-effort: sink failures must never make the API
 * unavailable. Implementations therefore handle their own I/O failures.
 */
export interface LogSink {
  write(entry: LogEntry): void;
}
