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
