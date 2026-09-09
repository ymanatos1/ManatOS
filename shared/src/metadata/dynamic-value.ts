/**
 * Framework-neutral scalar that may be supplied directly or calculated from
 * the caller's current ManatOS CTX scope.
 *
 * The expression engine owns evaluation; consuming metadata merely declares
 * that a value can be dynamic.
 */
export type ManatOSDynamicValue<T> = T | Readonly<{ expression: string }>;
