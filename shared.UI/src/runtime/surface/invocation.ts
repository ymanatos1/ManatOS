export interface UiSurfaceInvocation {
  readonly params: Readonly<Record<string, unknown>>;
  readonly events: Readonly<Record<string, string>>;
  readonly allowXClosure: boolean;
  readonly allowBackdropClosure: boolean;
}

/** Optional identity of the Flow step that opened this UI surface. */
export interface UiSurfaceFlowControl {
  readonly flowId: string;
  readonly stepPath: string;
  readonly events: Readonly<Record<string, string>>;
}

/** The Flow association becomes #control.flow, not invocation metadata. */
export type UiSurfaceOpenOptions = Partial<UiSurfaceInvocation> & {
  readonly flow?: UiSurfaceFlowControl;
};

export type UiSurfaceCloseReason = 'button' | 'x' | 'backdrop' | 'escape' | 'flow' | 'host';

export interface UiSurfaceResult {
  readonly reason: 'action' | UiSurfaceCloseReason | null;
  readonly actionId: string | null;
  readonly value: string | null;
}

export function createUiSurfaceInvocation(
  source: Partial<UiSurfaceInvocation> = {},
): UiSurfaceInvocation {
  return {
    params: { ...source.params },
    events: { ...source.events },
    allowXClosure: source.allowXClosure ?? true,
    allowBackdropClosure: source.allowBackdropClosure ?? false,
  };
}

export function createUiSurfaceResult(): UiSurfaceResult {
  return {
    reason: null,
    actionId: null,
    value: null,
  };
}
