/**
 * OPTIONAL UIS SOURCE TRACE — developer source debugging, not the CTX Debugger.
 *
 * Breakpoint here to observe recursive component lifecycle and event ownership.
 * Call setUiComponentSourceTraceSink() from development/bootstrap code to
 * collect structural events. Put a breakpoint in the sink and filter by
 * componentKind/layoutPath to follow one component across mount → event →
 * disposal. No console output or listeners when disabled.
 *
 * Only semantic identity and event *type* cross this boundary. Never add
 * control values, passwords, DOM Events, component data or CTX snapshots.
 *
 * See: runtime/surface/embedded-runtime.ts (emission points),
 * runtime/component.ts (component hooks), runtime/layout/writer.ts (children).
 */
export type UiComponentSourceTracePhase =
  | 'mount'
  | 'layout'
  | 'attached'
  | 'event'
  | 'update'
  | 'reconcile'
  | 'replace'
  | 'dispose'
  | 'rollback';

/** A structural trace record. All fields are safe for credential-bearing Surfaces. */
export interface UiComponentSourceTraceRecord {
  readonly phase: UiComponentSourceTracePhase;
  readonly surfacePath: string;
  readonly layoutPath: string;
  readonly parentLayoutPath: string | null;
  readonly componentKind: string;
  readonly componentId: string;
  readonly eventType?: string;
  readonly handled?: boolean;
  readonly consumed?: boolean;
  readonly preventDefault?: boolean;
}

export type UiComponentSourceTraceSink = (record: UiComponentSourceTraceRecord) => void;

let sourceTraceSink: UiComponentSourceTraceSink | null = null;
let emitting = false;

/** Install a developer-only sink; null disables tracing with no subscriptions. */
export function setUiComponentSourceTraceSink(sink: UiComponentSourceTraceSink | null): void {
  sourceTraceSink = sink;
}

/** Fast disabled check: callers do not allocate trace records in normal operation. */
export function isUiComponentSourceTracingEnabled(): boolean {
  return sourceTraceSink !== null && !emitting;
}

/** Internal emission boundary: tracing must never affect component behavior. */
export function emitUiComponentSourceTrace(record: UiComponentSourceTraceRecord): void {
  const sink = sourceTraceSink;
  if (!sink || emitting) return;
  try {
    emitting = true;
    sink(Object.freeze(record));
  } catch {
    // A broken developer sink must not change production event/lifecycle results.
  } finally {
    emitting = false;
  }
}
