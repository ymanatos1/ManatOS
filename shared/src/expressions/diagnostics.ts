import type { ExpressionDiagnostic, ExpressionDiagnosticSink } from './types.js';

export class ExpressionParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
    public readonly expression: string,
  ) {
    super(`${message} at position ${position}`);
    this.name = 'ExpressionParseError';
  }
}

export class ExpressionEvaluationError extends Error {
  constructor(
    message: string,
    public readonly expression?: string,
    public readonly variablePath?: string,
    public readonly evaluationChain?: readonly string[],
  ) {
    super(message);
    this.name = 'ExpressionEvaluationError';
  }
}

export function emitExpressionDiagnostic(
  sink: ExpressionDiagnosticSink | undefined,
  diagnostic: Omit<ExpressionDiagnostic, 'timestamp'> & { timestamp?: string },
): void {
  sink?.({
    ...diagnostic,
    timestamp: diagnostic.timestamp ?? new Date().toISOString(),
  });
}
