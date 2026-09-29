import type { UiInvocation, UiLevelId } from './contracts.js';
import type { UiContext } from './ui-context.js';
import type { UiLevel } from './ui-level.js';
import type { UiRuntime } from './ui-runtime.js';
import type { UiExtensionDefinition } from './registry.js';

export interface UiOpenRequest {
  readonly id: UiLevelId;
  readonly invocation: UiInvocation;
  readonly context: UiContext;
  readonly parent?: UiLevel;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface UiHostOpenContext {
  readonly runtime: UiRuntime;
  readonly request: UiOpenRequest;
}

export interface UiSurfaceOpenContext {
  readonly runtime: UiRuntime;
  readonly level: UiLevel;
  readonly request: UiOpenRequest;
}

/**
 * Executable host strategy. A host owns placement/lifecycle topology only; it
 * must not implement the semantic surface that is mounted into the level.
 */
export interface UiHostDefinition extends UiExtensionDefinition {
  open(context: UiHostOpenContext): UiLevel;
}

/**
 * Executable semantic surface. The surface receives the canonical level after
 * its host has mounted it and may initialize surface-specific runtime state.
 */
export interface UiSurfaceDefinition<TResult = unknown> extends UiExtensionDefinition {
  open(context: UiSurfaceOpenContext): TResult;
}

export interface UiOpenedSurface<TResult = unknown> {
  readonly level: UiLevel;
  readonly host: UiHostDefinition;
  readonly surface: UiSurfaceDefinition<TResult>;
  readonly value: TResult;
}

export interface UiSurfaceResult<TValue = unknown, TRecord = Readonly<Record<string, unknown>>> {
  readonly outcome: string;
  readonly surfaceId: string;
  readonly value?: TValue;
  readonly record?: TRecord;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

export interface UiSurfaceResultDetail<
  TValue = unknown,
  TRecord = Readonly<Record<string, unknown>>,
> {
  readonly value?: TValue;
  readonly record?: TRecord;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

/** One canonical result envelope for every child surface host. */
export const createUiSurfaceResult = <
  TValue = unknown,
  TRecord = Readonly<Record<string, unknown>>,
>(
  surfaceId: string,
  outcome = 'closed',
  detail: UiSurfaceResultDetail<TValue, TRecord> = {},
): UiSurfaceResult<TValue, TRecord> =>
  Object.freeze({
    outcome: String(outcome || 'closed'),
    surfaceId: String(surfaceId || ''),
    ...(detail.value !== undefined ? { value: detail.value } : {}),
    ...(detail.record !== undefined ? { record: detail.record } : {}),
    ...(detail.metadata !== undefined ? { metadata: detail.metadata } : {}),
    ...(detail.error !== undefined ? { error: String(detail.error) } : {}),
  });
