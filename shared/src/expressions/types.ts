/** Scalar literal types supported directly by the ManatOS expression grammar. */
export type ExpressionLiteralValue = string | number | boolean | null;

export type ExpressionPathMember = string | number;

export interface ExpressionLiteralNode {
  kind: 'literal';
  value: ExpressionLiteralValue;
}

export interface ExpressionVariableNode {
  kind: 'variable';
  /** Original path text, preserved for diagnostics/debugging. */
  path: string;
  /** Parsed path members. Numeric array indexes are stored as numbers. */
  members: readonly ExpressionPathMember[];
  /** True only for an explicit ctx.* root-qualified reference. */
  absolute: boolean;
}

export type ExpressionBinaryOperator = '+' | '-' | '*' | '/' | '%' | '**' | '==' | '!=';
export interface ExpressionBinaryOperationNode {
  kind: 'binary';
  operator: ExpressionBinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

export type ExpressionUnaryOperator = '+' | '-';
export interface ExpressionUnaryOperationNode {
  kind: 'unary';
  operator: ExpressionUnaryOperator;
  operand: ExpressionNode;
}

/** Explicit parenthesized expression retained for debugger/source fidelity. */
export interface ExpressionGroupNode {
  kind: 'group';
  expression: ExpressionNode;
}

export interface ExpressionConditionalNode {
  kind: 'conditional';
  condition: ExpressionNode;
  whenTrue: ExpressionNode;
  whenFalse: ExpressionNode;
}

export interface ExpressionFunctionCallNode {
  kind: 'function';
  functionName: string;
  arguments: readonly ExpressionNode[];
}

export type ExpressionNode =
  | ExpressionLiteralNode
  | ExpressionVariableNode
  | ExpressionBinaryOperationNode
  | ExpressionUnaryOperationNode
  | ExpressionGroupNode
  | ExpressionConditionalNode
  | ExpressionFunctionCallNode;

export interface CompiledExpression {
  source: string;
  ast: ExpressionNode;
}

export type ExpressionFunctionArgumentType =
  | 'any'
  | 'number'
  | 'string'
  | 'boolean'
  | 'scalar';

export interface ExpressionFunctionSignature {
  /** Human-readable signature shown in diagnostics/debugger tooling. */
  text: string;
  minArguments: number;
  maxArguments: number | null;
  /** Optional positional runtime expectations. */
  argumentTypes?: readonly ExpressionFunctionArgumentType[];
  /** Runtime expectation for extra variadic arguments, when maxArguments is null. */
  variadicType?: ExpressionFunctionArgumentType;
}

export interface ExpressionFunctionEvaluationContext {
  now: () => Date;
}

export interface ExpressionFunctionDefinition {
  name: string;
  signature: ExpressionFunctionSignature;
  evaluate: (
    args: readonly unknown[],
    context: ExpressionFunctionEvaluationContext,
  ) => unknown;
}

export type ExpressionFunctionRegistry = Readonly<Record<string, ExpressionFunctionDefinition>>;

export interface ExpressionDiagnostic {
  phase: 'parse' | 'evaluate';
  message: string;
  expression?: string;
  position?: number;
  variablePath?: string;
}

export type ExpressionDiagnosticSink = (diagnostic: ExpressionDiagnostic) => void;

export interface ExpressionEvaluationOptions {
  /** Optional diagnostics consumer. Errors are still thrown to the caller. */
  diagnosticSink?: ExpressionDiagnosticSink;
  /** Clock injection makes GetTime() deterministic in tests. */
  now?: () => Date;
}
