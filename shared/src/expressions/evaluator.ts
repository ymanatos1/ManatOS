import {contextPathOf, type ManatOSCalculatedContextField, type ManatOSContextField} from '../context.js';
import {ExpressionEvaluationError, emitExpressionDiagnostic} from './diagnostics.js';
import {expressionFunctions} from './functions/registry.js';
import {compileExpression} from './parser.js';
import {resolveExpressionVariable} from './resolver.js';
import type {
  CompiledExpression,
  ExpressionEvaluationCaller,
  ExpressionEvaluationOptions,
  ExpressionExecutionContext,
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
      ? {source: field.expression, ast: field.ast, requiredCapabilities: []}
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

function bitwiseOperand(value: unknown, operator: string): number {
  const numeric = numberOperand(value, operator);
  // JavaScript bitwise operators operate on 32-bit integers. Keep ManatOS'
  // existing numeric-only type discipline while using the same 32-bit result
  // semantics once an operand has been accepted.
  return numeric | 0;
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
      if (node.operator === '~') return ~bitwiseOperand(raw, '~');
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
        case '<<': return bitwiseOperand(left, '<<') << (bitwiseOperand(right, '<<') & 31);
        case '>>': return bitwiseOperand(left, '>>') >> (bitwiseOperand(right, '>>') & 31);
        case '>>>': return (bitwiseOperand(left, '>>>') >>> (bitwiseOperand(right, '>>>') & 31)) >>> 0;
        case '&': return bitwiseOperand(left, '&') & bitwiseOperand(right, '&');
        case '^': return bitwiseOperand(left, '^') ^ bitwiseOperand(right, '^');
        case '|': return bitwiseOperand(left, '|') | bitwiseOperand(right, '|');
        default:
          throw new ExpressionEvaluationError(`Unsupported binary operator: ${String(node.operator)}.`);
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
      return definition.evaluate(args, {now: state.options.now ?? (() => new Date()), owner: 'sync'});
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


/**
 * Asynchronous owner-aware evaluator.
 *
 * The expression owner supplies the lexical root/scope and the capabilities it
 * can satisfy locally. Capability-backed functions are evaluated only when
 * runtime lazy semantics actually reach them. In particular, a false ternary,
 * `&&`, `||` or satisfied `??` branch never invokes EntityResolver merely
 * because a resolver-capable function exists elsewhere in the AST.
 *
 * Browser owners normally delegate resolver-capable function nodes to the
 * trusted API and then resume evaluation locally. Server owners can provide an
 * EntityResolver directly and complete the same AST without a network hop.
 */
export async function evaluateCompiledExpressionAsync(
  compiled: CompiledExpression,
  execution: ExpressionExecutionContext,
  caller: ExpressionEvaluationCaller,
  options: ExpressionEvaluationOptions = {},
): Promise<unknown> {
  const id = correlationId();
  const memo = new Map<object, unknown>();
  const active = new Set<object>();
  const chain = caller.targetPath ? [caller.targetPath] : [];

  const evaluate = async (node: ExpressionNode, scope: unknown = execution.scope): Promise<unknown> => {
    switch (node.kind) {
      case 'literal': return node.value;
      case 'group': return evaluate(node.expression, scope);
      case 'variable': {
        const resolved = resolveExpressionVariable(node, execution.root, scope);
        if (!resolved.found) {
          throw new ExpressionEvaluationError(
            `Expression variable not found: ${node.path}`,
            compiled.source,
            node.path,
            chain,
          );
        }
        if (isCalculatedField(resolved.value)) {
          const field = resolved.value;
          if (memo.has(field)) return memo.get(field);
          if (active.has(field)) return fieldFallbackValue(field);
          active.add(field);
          try {
            const nested = field.ast
              ? {source: field.expression, ast: field.ast, requiredCapabilities: []}
              : compileExpression(field.expression);
            const value = await evaluate(nested.ast, resolved.owner ?? scope);
            memo.set(field, value);
            return value;
          } finally {
            active.delete(field);
          }
        }
        if (resolved.value && typeof resolved.value === 'object' && Object.prototype.hasOwnProperty.call(resolved.value, 'value')) {
          return (resolved.value as ManatOSContextField).value;
        }
        return resolved.value;
      }
      case 'unary': {
        const raw = await evaluate(node.operand, scope);
        if (node.operator === '!') return !scalarTruthy(raw, '!');
        if (node.operator === '~') return ~bitwiseOperand(raw, '~');
        const value = numberOperand(raw, `unary ${node.operator}`);
        return node.operator === '-' ? -value : value;
      }
      case 'binary': {
        const left = await evaluate(node.left, scope);
        if (node.operator === '??') return left == null ? evaluate(node.right, scope) : left;
        if (node.operator === '&&') return scalarTruthy(left, '&&') ? evaluate(node.right, scope) : left;
        if (node.operator === '||') return scalarTruthy(left, '||') ? left : evaluate(node.right, scope);
        const right = await evaluate(node.right, scope);
        switch (node.operator) {
          case '+': return plus(left, right);
          case '-': return numberOperand(left, '-') - numberOperand(right, '-');
          case '*': return numberOperand(left, '*') * numberOperand(right, '*');
          case '/': { const divisor = numberOperand(right, '/'); if (divisor === 0) throw new ExpressionEvaluationError('Division by zero.'); return numberOperand(left, '/') / divisor; }
          case '%': { const divisor = numberOperand(right, '%'); if (divisor === 0) throw new ExpressionEvaluationError('Modulo by zero.'); return numberOperand(left, '%') % divisor; }
          case '**': return numberOperand(left, '**') ** numberOperand(right, '**');
          case '==': return looseEqual(left, right);
          case '!=': return !looseEqual(left, right);
          case '===': return strictEqual(left, right);
          case '!==': return !strictEqual(left, right);
          case '<': return relational(left, right, '<');
          case '<=': return relational(left, right, '<=');
          case '>': return relational(left, right, '>');
          case '>=': return relational(left, right, '>=');
          case '<<': return bitwiseOperand(left, '<<') << (bitwiseOperand(right, '<<') & 31);
          case '>>': return bitwiseOperand(left, '>>') >> (bitwiseOperand(right, '>>') & 31);
          case '>>>': return (bitwiseOperand(left, '>>>') >>> (bitwiseOperand(right, '>>>') & 31)) >>> 0;
          case '&': return bitwiseOperand(left, '&') & bitwiseOperand(right, '&');
          case '^': return bitwiseOperand(left, '^') ^ bitwiseOperand(right, '^');
          case '|': return bitwiseOperand(left, '|') | bitwiseOperand(right, '|');
          default: throw new ExpressionEvaluationError(`Unsupported binary operator: ${String(node.operator)}.`);
        }
      }
      case 'conditional': {
        const condition = await evaluate(node.condition, scope);
        if (typeof condition !== 'boolean') {
          throw new ExpressionEvaluationError(`?: requires a boolean condition; received ${condition === null ? 'null' : typeof condition}.`);
        }
        return condition ? evaluate(node.whenTrue, scope) : evaluate(node.whenFalse, scope);
      }
      case 'function': {
        const definition = expressionFunctions[node.functionName];
        if (!definition) throw new ExpressionEvaluationError(`Unknown expression function ${node.functionName}.`);
        const args: unknown[] = [];
        for (const argument of node.arguments) args.push(await evaluate(argument, scope));
        const context = {
          now: options.now ?? (() => new Date()),
          owner: execution.owner,
          ...(execution.entityResolver ? {entityResolver: execution.entityResolver} : {}),
        };
        if (definition.capability !== 'pure' && !execution.capabilities.includes(definition.capability)) {
          throw new ExpressionEvaluationError(
            `${node.functionName} requires capability '${definition.capability}', unavailable to evaluation owner '${execution.owner}'.`,
          );
        }
        if (definition.capability === 'entityResolver') {
          if (!execution.entityResolver) {
            throw new ExpressionEvaluationError(
              `${node.functionName} requires capability 'entityResolver', but owner '${execution.owner}' supplied no EntityResolver.`,
            );
          }
          if (!definition.evaluateAsync) {
            throw new ExpressionEvaluationError(`${node.functionName} has no asynchronous entityResolver implementation.`);
          }
          return definition.evaluateAsync(args, context);
        }
        return definition.evaluate(args, context);
      }
    }
  };

  try {
    return await evaluate(compiled.ast);
  } catch (error) {
    if (error instanceof ExpressionEvaluationError) {
      emitExpressionDiagnostic(options.diagnosticSink, {
        phase: 'evaluate',
        message: error.message,
        expression: compiled.source,
        ...(error.variablePath ? {variablePath: error.variablePath} : {}),
        caller,
        correlationId: id,
        currentContextPath: contextPathOf(execution.root, execution.scope) ?? '<detached-context>',
        ...(caller.targetPath ? {targetPath: caller.targetPath} : {}),
        evaluationChain: error.evaluationChain ?? chain,
      });
    }
    throw error;
  }
}

/** Convenience wrapper for owner-aware asynchronous evaluation from source text. */
export async function evaluateExpressionAsync(
  expression: string,
  execution: ExpressionExecutionContext,
  caller: ExpressionEvaluationCaller,
  options: ExpressionEvaluationOptions = {},
): Promise<unknown> {
  return evaluateCompiledExpressionAsync(compileExpression(expression), execution, caller, options);
}
