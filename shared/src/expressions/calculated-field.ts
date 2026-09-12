import type { ManatOSCalculatedContextField } from '../context/manatos-context.js';

/**
 * Declare a calculated CTX variable as semantic source plus an optional materialized
 * anchor. Parsing is deferred until first evaluation and is owned by the process-global
 * expression cache; executable AST objects never become CTX state.
 */
export function calculatedContextField<T = unknown>(
  expression: string,
  options: {
    /** Optional materialized value used only as a recursion/cycle anchor. */
    value?: T;
  } = {},
): ManatOSCalculatedContextField<T> {
  return {
    expression,
    value: Object.prototype.hasOwnProperty.call(options, 'value') ? (options.value as T) : null,
  };
}
