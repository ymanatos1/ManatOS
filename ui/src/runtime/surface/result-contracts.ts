/**
 * Generic V2 surface result returned to the caller when a child surface ends
 * or completes an operation that produces a value.
 *
 * The result contract is deliberately host-agnostic: a caller should not care
 * whether the child was rendered by PageHost or PopupHost.
 */
export type SurfaceResultOutcome =
  'completed' | 'saved' | 'selected' | 'deleted' | 'cleared' | 'cancelled' | 'closed';

export interface SurfaceResult<TValue = unknown> {
  readonly outcome: SurfaceResultOutcome;
  readonly surfaceId: string;
  readonly value?: TValue;
  readonly record?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
