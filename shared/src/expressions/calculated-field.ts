import type { ManatOSCalculatedContextField } from '../context.js';
import { compileExpression } from './parser.js';
import type { ExpressionDiagnosticSink } from './types.js';

/**
 * Declare a calculated CTX variable. Parsing is intentionally context-agnostic:
 * syntactically valid variable/path names are compiled now, but resolved only
 * later when the field's value is actually evaluated.
 */
export function calculatedContextField<T = unknown>(
  expression: string,
  options: {
    /** Optional materialized value used only as a recursion/cycle anchor. */
    value?: T;
    diagnosticSink?: ExpressionDiagnosticSink;
  } = {},
): ManatOSCalculatedContextField<T> {
  const compiled = compileExpression(expression, {
    ...(options.diagnosticSink ? { diagnosticSink: options.diagnosticSink } : {}),
  });
  return {
    expression,
    ast: compiled.ast,
    value: Object.prototype.hasOwnProperty.call(options, 'value') ? (options.value as T) : null,
  };
}
