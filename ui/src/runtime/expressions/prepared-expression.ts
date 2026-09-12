import { compileExpression } from '@manatos/shared';

/**
 * Canonical server-side preparation boundary for authored metadata expressions.
 * Source remains the durable/debuggable representation; AST is the executable
 * representation used by explicit non-CTX presentation/debugging consumers. `compileExpression` owns the
 * process-global lazy AST cache, so this adapter performs no secondary caching.
 */
export function prepareExpression(source: unknown): ReturnType<typeof compileExpression> | null {
  const text = typeof source === 'string' ? source.trim() : '';
  if (!text) return null;
  return compileExpression(text);
}

export function preparedExpressionAst(source: unknown) {
  return prepareExpression(source)?.ast ?? null;
}
