/**
 * Structured log entry produced by the ManatOS server logger.
 *
 * Sinks deliberately receive an already-sanitized entry. This keeps secret
 * redaction in one place and makes it safe to add additional persistence
 * targets later (for example a database-backed Admin diagnostics store).
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
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
