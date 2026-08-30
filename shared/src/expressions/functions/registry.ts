import {resolveContextMember} from '../../context.js';
import {ExpressionEvaluationError} from '../diagnostics.js';
import type {
  ExpressionFunctionArgumentType,
  ExpressionFunctionDefinition,
  ExpressionFunctionRegistry,
} from '../types.js';

function valueMatches(type: ExpressionFunctionArgumentType, value: unknown): boolean {
  if (type === 'any') return true;
  if (type === 'scalar') {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  }
  return typeof value === type;
}

function checked(definition: ExpressionFunctionDefinition): ExpressionFunctionDefinition {
  return {
    ...definition,
    evaluate(args, context) {
      const {signature} = definition;
      if (args.length < signature.minArguments ||
          (signature.maxArguments !== null && args.length > signature.maxArguments)) {
        throw new ExpressionEvaluationError(
          `${definition.name} expects ${signature.text}; received ${args.length} argument(s).`,
        );
      }

      args.forEach((value, index) => {
        const expected = signature.argumentTypes?.[index] ?? signature.variadicType;
        if (expected && !valueMatches(expected, value)) {
          throw new ExpressionEvaluationError(
            `${definition.name} argument ${index + 1} must be ${expected}; received ${value === null ? 'null' : typeof value}.`,
          );
        }
      });
      return definition.evaluate(args, context);
    },
  };
}

/**
 * Hard-coded, keyed function registry. The parser validates function existence
 * and arity against this registry; evaluation delegates to the registered code.
 */
export const expressionFunctions: ExpressionFunctionRegistry = Object.freeze({
  SqRoot: checked({
    name: 'SqRoot',
    signature: {
      text: 'SqRoot(value: number)',
      minArguments: 1,
      maxArguments: 1,
      argumentTypes: ['number'],
    },
    evaluate: ([value]) => Math.sqrt(value as number),
  }),



  TraverseCtx: checked({
    name: 'TraverseCtx',
    signature: {
      text: "TraverseCtx(startId, collection, parentField: string, resultField?: string)",
      minArguments: 3,
      maxArguments: 4,
      argumentTypes: ['scalar', 'any', 'string', 'string'],
    },
    evaluate: ([startId, collection, parentField, resultField]) => {
      if (startId === null || startId === undefined || startId === '') return null;
      if (!collection || typeof collection !== 'object') return null;

      const seen = new Set<string>();
      let id: unknown = startId;
      let root: unknown = null;

      // Protect both malformed cycles and unexpectedly deep hostile data.
      for (let depth = 0; depth < 256; depth += 1) {
        const key = String(id);
        if (seen.has(key)) {
          throw new ExpressionEvaluationError(`TraverseCtx detected a parent cycle at ${key}.`);
        }
        seen.add(key);

        const row = resolveContextMember(collection, key);
        if (!row || typeof row !== 'object') return null;
        root = row;

        const parent = resolveContextMember(row, parentField as string);
        if (parent === null || parent === undefined || parent === '') {
          return resultField
            ? resolveContextMember(root, resultField as string) ?? null
            : root;
        }
        id = parent;
      }

      throw new ExpressionEvaluationError('TraverseCtx exceeded the maximum traversal depth of 256.');
    },
  }),

  GetTime: checked({
    name: 'GetTime',
    signature: {
      text: 'GetTime()',
      minArguments: 0,
      maxArguments: 0,
    },
    evaluate: (_args, context) => context.now().getTime(),
  }),

  StrFormat: checked({
    name: 'StrFormat',
    signature: {
      text: 'StrFormat(format: string, ...values)',
      minArguments: 1,
      maxArguments: null,
      argumentTypes: ['string'],
      variadicType: 'scalar',
    },
    evaluate: ([format, ...values]) =>
      String(format).replace(/\{(\d+)\}/g, (match, rawIndex: string) => {
        const index = Number(rawIndex);
        return index < values.length ? String(values[index] ?? '') : match;
      }),
  }),
});
