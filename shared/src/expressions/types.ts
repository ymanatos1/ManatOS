/** Scalar literal types supported directly by the ManatOS expression grammar. */
export type ExpressionLiteralValue = string | number | boolean | null;

/**
 * Runtime scalar values understood by operators/functions. Date is included
 * now so CTX values and future date/time functions can participate in typed
 * comparisons without pretending that Date is a grammar literal.
 */
export type ExpressionScalarValue = ExpressionLiteralValue | Date;
export type ExpressionValue = ExpressionScalarValue | readonly ExpressionScalarValue[];

export type ExpressionPathMember = string | number;

export interface ExpressionLiteralNode {
  kind: 'literal';
  value: ExpressionLiteralValue;
}

export interface ExpressionArrayNode {
  kind: 'array';
  items: readonly ExpressionNode[];
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

export type ExpressionBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '**'
  | '=='
  | '!='
  | '==='
  | '!=='
  | '<'
  | '<='
  | '>'
  | '>='
  | '<<'
  | '>>'
  | '>>>'
  | '&'
  | '^'
  | '|'
  | '&&'
  | '||'
  | '??'
  | 'IN';
export interface ExpressionBinaryOperationNode {
  kind: 'binary';
  operator: ExpressionBinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

export type ExpressionUnaryOperator = '+' | '-' | '!' | '~';
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

export type ExpressionCapability = 'pure' | 'clock' | 'ctx' | 'entityResolver';

export interface ExpressionFunctionCallNode {
  kind: 'function';
  functionName: string;
  arguments: readonly ExpressionNode[];
  /** Capability declared by the canonical function registry at parse time. */
  capability: ExpressionCapability;
}

export type ExpressionNode =
  | ExpressionLiteralNode
  | ExpressionArrayNode
  | ExpressionVariableNode
  | ExpressionBinaryOperationNode
  | ExpressionUnaryOperationNode
  | ExpressionGroupNode
  | ExpressionConditionalNode
  | ExpressionFunctionCallNode;

export interface CompiledExpression {
  source: string;
  ast: ExpressionNode;
  /** Static union of capabilities that may be needed by reachable AST branches. Runtime lazy semantics still decide which branches execute. */
  requiredCapabilities: readonly ExpressionCapability[];
}

export type ExpressionFunctionArgumentType = 'any' | 'number' | 'string' | 'boolean' | 'scalar';

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

export interface EntityResolver {
  /** Resolve one canonical entity by metadata key and identifier. Implementations may cache, batch, authorize or translate to SQL independently. */
  getById(entityKey: string, id: unknown): Promise<Readonly<Record<string, unknown>> | null>;
}

export interface ExpressionExecutionContext {
  /** Host that owns and must complete this evaluation (browser, api, worker, test, etc.). */
  owner: string;
  /** Lexical root visible to variable resolution. In a UI this is usually CTX; in a server process it may simply be the entity record. */
  root: unknown;
  /** Current lexical scope whose direct field names are used by entity-local formulas. */
  scope: unknown;
  /** Capabilities available locally to this owner. */
  capabilities: readonly ExpressionCapability[];
  /** Optional canonical persistence resolver; required only when entityResolver-capable functions are actually reached. */
  entityResolver?: EntityResolver;
}

export interface ExpressionFunctionEvaluationContext {
  now: () => Date;
  owner: string;
  entityResolver?: EntityResolver;
}

export interface ExpressionFunctionDefinition {
  name: string;
  signature: ExpressionFunctionSignature;
  /** Execution capability needed by this function. `pure` is available everywhere. */
  capability: ExpressionCapability;
  evaluate: (args: readonly unknown[], context: ExpressionFunctionEvaluationContext) => unknown;
  /** Optional asynchronous implementation for capability-backed functions such as database/entity traversal. */
  evaluateAsync?: (
    args: readonly unknown[],
    context: ExpressionFunctionEvaluationContext,
  ) => Promise<unknown>;
}

export type ExpressionFunctionRegistry = Readonly<Record<string, ExpressionFunctionDefinition>>;

export type ExpressionEvaluationSource =
  | 'renderer'
  | 'ctx-debugger'
  | 'calculated-field'
  | 'field-normalization'
  | 'ctx-change'
  | 'ui-metadata'
  | 'navigation'
  | 'test'
  | 'other';

/**
 * Provenance supplied by the code that requested an expression evaluation.
 * It deliberately describes the caller, not the expression semantics.
 */
export interface ExpressionEvaluationCaller {
  source: ExpressionEvaluationSource;
  /** CTX/UI path of the requesting component/value when known. */
  sourcePath?: string;
  /** Calculated variable/value whose result is being requested when known. */
  targetPath?: string;
  /** Short human-readable reason useful in diagnostics. */
  purpose?: string;
  /** Optional HTTP/request correlation id supplied by server-side callers. */
  requestId?: string;
}

export interface ExpressionDiagnostic {
  phase: 'parse' | 'evaluate';
  /** UTC timestamp generated when the diagnostic is emitted. */
  timestamp: string;
  message: string;
  expression?: string;
  position?: number;
  variablePath?: string;

  /** Evaluation provenance. Present for evaluation-time diagnostics. */
  caller?: ExpressionEvaluationCaller;
  correlationId?: string;
  currentContextPath?: string;
  targetPath?: string;
  /** Nested calculated values entered during this top-level evaluation. */
  evaluationChain?: readonly string[];
}

export type ExpressionDiagnosticSink = (diagnostic: ExpressionDiagnostic) => void;

export interface ExpressionEvaluationOptions {
  /** Optional diagnostics consumer. Errors are still thrown to the caller. */
  diagnosticSink?: ExpressionDiagnosticSink;
  /** Clock injection makes GetTime() deterministic in tests. */
  now?: () => Date;
}
