import {contextPathOf, type ManatOSCalculatedContextField, type ManatOSContextField} from '../context.js';
import {ExpressionEvaluationError, emitExpressionDiagnostic} from './diagnostics.js';
import {expressionFunctions} from './functions/registry.js';
import {compileExpression} from './parser.js';
import {resolveExpressionVariable} from './resolver.js';
import type {
  CompiledExpression,
  ExpressionEvaluationCaller,
  ExpressionEvaluationOptions,
  ExpressionNode,
  ExpressionVariableNode,
} from './types.js';

interface EvaluationState {
  readonly ctxRoot: unknown;
  readonly currentCtxNode: unknown;
  readonly source: string;
  readonly caller: ExpressionEvaluationCaller;
  readonly correlationId: string;
  readonly options: ExpressionEvaluationOptions;
  readonly memo: Map<object, unknown>;
  readonly active: Set<object>;
  readonly evaluationChain: readonly string[];
}

function correlationId(): string {
  return `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isCalculatedField(value: unknown): value is ManatOSCalculatedContextField {
  return !!value && typeof value === 'object' &&
    typeof (value as {expression?: unknown}).expression === 'string';
}


function fieldFallbackValue(field: ManatOSContextField): unknown {
  return Object.prototype.hasOwnProperty.call(field, 'value') ? field.value : null;
}

function evaluateCalculatedField(
  field: ManatOSCalculatedContextField,
  owner: unknown,
  state: EvaluationState,
): unknown {
  if (state.memo.has(field)) return state.memo.get(field);

  // Cycles are legal declarations. Re-entering an active calculated field
  // stops only that recursive branch and uses its materialized anchor (or null).
  if (state.active.has(field)) return fieldFallbackValue(field);

  const fieldPath = contextPathOf(state.ctxRoot, field) ?? `<calculated:${field.expression}>`;
  state.active.add(field);
  try {
    const compiled = field.ast
      ? {source: field.expression, ast: field.ast}
      : compileExpression(field.expression, {
          ...(state.options.diagnosticSink ? {diagnosticSink: state.options.diagnosticSink} : {}),
        });

    const nextChain = state.evaluationChain[state.evaluationChain.length - 1] === fieldPath
      ? state.evaluationChain
      : [...state.evaluationChain, fieldPath];
    try {
      const value = evaluateNode(compiled.ast, {
        ...state,
        currentCtxNode: owner ?? state.currentCtxNode,
        evaluationChain: nextChain,
      });
      state.memo.set(field, value);
      return value;
    } catch (error) {
      if (error instanceof ExpressionEvaluationError && !error.evaluationChain) {
        throw new ExpressionEvaluationError(
          error.message,
          error.expression ?? compiled.source,
          error.variablePath,
          nextChain,
        );
      }
      throw error;
    }
  } finally {
    state.active.delete(field);
  }
}

function effectiveVariableValue(
  variable: ExpressionVariableNode,
  resolvedValue: unknown,
  owner: unknown,
  state: EvaluationState,
): unknown {
  if (isCalculatedField(resolvedValue)) {
    return evaluateCalculatedField(resolvedValue, owner, state);
  }

  if (resolvedValue && typeof resolvedValue === 'object' &&
      Object.prototype.hasOwnProperty.call(resolvedValue, 'value')) {
    return (resolvedValue as ManatOSContextField).value;
  }

  return resolvedValue;
}

function numberOperand(value: unknown, operator: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExpressionEvaluationError(`${operator} requires numeric operands; received ${value === null ? 'null' : typeof value}.`);
  }
  return value;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isSupportedScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value) || isDate(value);
}

/**
 * `+` intentionally follows the useful JS/TS convention for string
 * concatenation: when either side is a string, any supported scalar on the
 * other side is converted with String(...). Arrays/objects remain rejected
 * until ManatOS deliberately defines their semantics.
 */
function plus(left: unknown, right: unknown): string | number {
  if (typeof left === 'string' || typeof right === 'string') {
    if (!isSupportedScalar(left) || !isSupportedScalar(right)) {
      throw new ExpressionEvaluationError('+ cannot concatenate arrays/objects until structured-value semantics are defined.');
    }
    return String(left) + String(right);
  }
  return numberOperand(left, '+') + numberOperand(right, '+');
}

function assertComparableScalars(left: unknown, right: unknown, operator: string): void {
  if (!isSupportedScalar(left) || !isSupportedScalar(right)) {
    throw new ExpressionEvaluationError(`${operator} does not support arrays/objects.`);
  }
}

/** JS-compatible abstract equality for the supported scalar runtime domain. */
function looseEqual(left: unknown, right: unknown): boolean {
  assertComparableScalars(left, right, '==');
  // Intentional JS/TS-style coercive equality; === remains available explicitly.
  // eslint-disable-next-line eqeqeq
  return left == right;
}

function strictEqual(left: unknown, right: unknown): boolean {
  assertComparableScalars(left, right, '===');
  return left === right;
}

function relational(left: unknown, right: unknown, operator: '<' | '<=' | '>' | '>='): boolean {
  if (!isSupportedScalar(left) || !isSupportedScalar(right)) {
    throw new ExpressionEvaluationError(`${operator} does not support arrays/objects.`);
  }
  const l = isDate(left) ? left.getTime() : left;
  const r = isDate(right) ? right.getTime() : right;
  switch (operator) {
    case '<': return (l as any) < (r as any);
    case '<=': return (l as any) <= (r as any);
    case '>': return (l as any) > (r as any);
    case '>=': return (l as any) >= (r as any);
  }
}

/**
 * JS/TS-like truthiness restricted to the evaluator's supported scalar domain.
 * Structured arrays/objects remain intentionally unsupported until their
 * expression semantics are designed explicitly.
 */
function scalarTruthy(value: unknown, operator: string): boolean {
  if (!isSupportedScalar(value)) {
    throw new ExpressionEvaluationError(`${operator} does not support arrays/objects.`);
  }
  return Boolean(value);
}

function evaluateNode(node: ExpressionNode, state: EvaluationState): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'group':
      return evaluateNode(node.expression, state);

    case 'variable': {
      const resolved = resolveExpressionVariable(node, state.ctxRoot, state.currentCtxNode);
      if (!resolved.found) {
        throw new ExpressionEvaluationError(
          `Expression variable not found: ${node.path}`,
          state.source,
          node.path,
          state.evaluationChain,
        );
      }
      return effectiveVariableValue(node, resolved.value, resolved.owner, state);
    }

    case 'unary': {
      const raw = evaluateNode(node.operand, state);
      if (node.operator === '!') return !scalarTruthy(raw, '!');
      const value = numberOperand(raw, `unary ${node.operator}`);
      return node.operator === '-' ? -value : value;
    }

    case 'binary': {
      // AST recursion intentionally evaluates child nodes immediately before
      // their parent operator. `??`, `&&` and `||` are lazy just as in JS/TS:
      // their right branch is evaluated only when the left result requires it.
      const left = evaluateNode(node.left, state);
      if (node.operator === '??') {
        return left === null || left === undefined
          ? evaluateNode(node.right, state)
          : left;
      }
      if (node.operator === '&&') {
        return scalarTruthy(left, '&&') ? evaluateNode(node.right, state) : left;
      }
      if (node.operator === '||') {
        return scalarTruthy(left, '||') ? left : evaluateNode(node.right, state);
      }

      const right = evaluateNode(node.right, state);
      switch (node.operator) {
        case '+': return plus(left, right);
        case '-': return numberOperand(left, '-') - numberOperand(right, '-');
        case '*': return numberOperand(left, '*') * numberOperand(right, '*');
        case '/': {
          const divisor = numberOperand(right, '/');
          if (divisor === 0) throw new ExpressionEvaluationError('Division by zero.');
          return numberOperand(left, '/') / divisor;
        }
        case '%': {
          const divisor = numberOperand(right, '%');
          if (divisor === 0) throw new ExpressionEvaluationError('Modulo by zero.');
          return numberOperand(left, '%') % divisor;
        }
        case '**': return numberOperand(left, '**') ** numberOperand(right, '**');
        case '==': return looseEqual(left, right);
        case '!=': return !looseEqual(left, right);
        case '===': return strictEqual(left, right);
        case '!==': return !strictEqual(left, right);
        case '<': return relational(left, right, '<');
        case '<=': return relational(left, right, '<=');
        case '>': return relational(left, right, '>');
        case '>=': return relational(left, right, '>=');
      }
    }

    case 'conditional': {
      // Ternary evaluation is lazy: only the selected branch is evaluated.
      const condition = evaluateNode(node.condition, state);
      if (typeof condition !== 'boolean') {
        throw new ExpressionEvaluationError(`?: requires a boolean condition; received ${condition === null ? 'null' : typeof condition}.`);
      }
      return condition
        ? evaluateNode(node.whenTrue, state)
        : evaluateNode(node.whenFalse, state);
    }

    case 'function': {
      const definition = expressionFunctions[node.functionName];
      if (!definition) throw new ExpressionEvaluationError(`Unknown expression function ${node.functionName}.`);
      const args = node.arguments.map((argument) => evaluateNode(argument, state));
      return definition.evaluate(args, {now: state.options.now ?? (() => new Date())});
    }
  }
}

export function evaluateCompiledExpression(
  compiled: CompiledExpression,
  ctxRoot: unknown,
  currentCtxNode: unknown,
  caller: ExpressionEvaluationCaller,
  options: ExpressionEvaluationOptions = {},
): unknown {
  const id = correlationId();

  try {
    return evaluateNode(compiled.ast, {
      ctxRoot,
      currentCtxNode,
      source: compiled.source,
      caller,
      correlationId: id,
      options,
      memo: new Map<object, unknown>(),
      active: new Set<object>(),
      evaluationChain: caller.targetPath ? [caller.targetPath] : [],
    });
  } catch (error) {
    if (error instanceof ExpressionEvaluationError) {
      emitExpressionDiagnostic(options.diagnosticSink, {
        phase: 'evaluate',
        message: error.message,
        expression: compiled.source,
        ...(error.variablePath ? {variablePath: error.variablePath} : {}),
        caller,
        correlationId: id,
        currentContextPath: contextPathOf(ctxRoot, currentCtxNode) ?? '<detached-context>',
        ...(caller.targetPath ? {targetPath: caller.targetPath} : {}),
        evaluationChain: error.evaluationChain ?? (caller.targetPath ? [caller.targetPath] : []),
      });
    }
    throw error;
  }
}

export function evaluateExpression(
  expression: string,
  ctxRoot: unknown,
  currentCtxNode: unknown,
  caller: ExpressionEvaluationCaller,
  options: ExpressionEvaluationOptions = {},
): unknown {
  const compiled = compileExpression(expression, {
    ...(options.diagnosticSink ? {diagnosticSink: options.diagnosticSink} : {}),
  });
  return evaluateCompiledExpression(compiled, ctxRoot, currentCtxNode, caller, options);
}
