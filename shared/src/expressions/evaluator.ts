import type {ManatOSCalculatedContextField, ManatOSContextField} from '../context.js';
import {ExpressionEvaluationError, emitExpressionDiagnostic} from './diagnostics.js';
import {expressionFunctions} from './functions/registry.js';
import {compileExpression} from './parser.js';
import {resolveExpressionVariable} from './resolver.js';
import type {
  CompiledExpression,
  ExpressionEvaluationOptions,
  ExpressionNode,
  ExpressionVariableNode,
} from './types.js';

interface EvaluationState {
  readonly ctxRoot: unknown;
  readonly currentCtxNode: unknown;
  readonly source: string;
  readonly options: ExpressionEvaluationOptions;
  readonly memo: Map<object, unknown>;
  readonly active: Set<object>;
}

function isCalculatedField(value: unknown): value is ManatOSCalculatedContextField {
  return !!value && typeof value === 'object' &&
    typeof (value as {expression?: unknown}).expression === 'string';
}


function fieldFallbackValue(field: ManatOSContextField): unknown {
  return Object.prototype.hasOwnProperty.call(field, 'value') ? field.value : null;
}

function evaluateCalculatedField(field: ManatOSCalculatedContextField, owner: unknown, state: EvaluationState): unknown {
  if (state.memo.has(field)) return state.memo.get(field);

  // Cycles are allowed declarations. Re-entering a currently evaluating field
  // simply terminates that recursive branch. A materialized/edited value, when
  // present, acts as the branch anchor; otherwise null is the neutral fallback.
  if (state.active.has(field)) return fieldFallbackValue(field);

  state.active.add(field);
  try {
    const compiled = field.ast
      ? {source: field.expression, ast: field.ast}
      : compileExpression(field.expression, {
          ...(state.options.diagnosticSink ? {diagnosticSink: state.options.diagnosticSink} : {}),
        });
    const value = evaluateNode(compiled.ast, {...state, currentCtxNode: owner ?? state.currentCtxNode});
    state.memo.set(field, value);
    return value;
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

function plus(left: unknown, right: unknown): string | number {
  if (typeof left === 'string' || typeof right === 'string') {
    if (!['string', 'number'].includes(typeof left) || !['string', 'number'].includes(typeof right)) {
      throw new ExpressionEvaluationError('+ supports numbers and strings only.');
    }
    return String(left) + String(right);
  }
  return numberOperand(left, '+') + numberOperand(right, '+');
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
        throw new ExpressionEvaluationError(`Expression variable not found: ${node.path}`, state.source, node.path);
      }
      return effectiveVariableValue(node, resolved.value, resolved.owner, state);
    }

    case 'unary': {
      const value = numberOperand(evaluateNode(node.operand, state), `unary ${node.operator}`);
      return node.operator === '-' ? -value : value;
    }

    case 'binary': {
      // AST recursion intentionally evaluates child nodes immediately before
      // their parent operator. Tree shape therefore controls evaluation order.
      const left = evaluateNode(node.left, state);
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
        case '==': return left === right;
        case '!=': return left !== right;
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
  options: ExpressionEvaluationOptions = {},
): unknown {
  try {
    return evaluateNode(compiled.ast, {
      ctxRoot,
      currentCtxNode,
      source: compiled.source,
      options,
      memo: new Map<object, unknown>(),
      active: new Set<object>(),
    });
  } catch (error) {
    if (error instanceof ExpressionEvaluationError) {
      emitExpressionDiagnostic(options.diagnosticSink, {
        phase: 'evaluate',
        message: error.message,
        expression: compiled.source,
        ...(error.variablePath ? {variablePath: error.variablePath} : {}),
      });
    }
    throw error;
  }
}

export function evaluateExpression(
  expression: string,
  ctxRoot: unknown,
  currentCtxNode: unknown,
  options: ExpressionEvaluationOptions = {},
): unknown {
  const compiled = compileExpression(expression, {
    ...(options.diagnosticSink ? {diagnosticSink: options.diagnosticSink} : {}),
  });
  return evaluateCompiledExpression(compiled, ctxRoot, currentCtxNode, options);
}
