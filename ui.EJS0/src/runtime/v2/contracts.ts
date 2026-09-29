/**
 * Foundational browser UI-runtime contracts.
 *
 * Patch 1 intentionally defines only identity/invocation/result vocabulary. It
 * does not take ownership from the existing public/js runtime yet.
 */
export type UiLevelId = string;
export type UiSurfaceTypeId = string;
export type UiHostTypeId = string;
export type UiViewId = string;

export interface UiInvocation {
  readonly surface: UiSurfaceTypeId;
  readonly host: UiHostTypeId;
  readonly entity?: string;
  readonly view?: UiViewId;
  readonly mode?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly behavior?: Readonly<{
    recoverable?: boolean;
    closePolicy?: Readonly<{ dirty?: 'prompt' | 'discard' }>;
  }>;
}

export type UiExitStatus = 'completed' | 'cancelled' | 'dismissed' | 'failed';

export interface UiLevelResult<T = unknown> {
  readonly status: UiExitStatus;
  readonly data?: T;
  readonly reason?: string;
}
