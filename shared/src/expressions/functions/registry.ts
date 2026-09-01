import {resolveContextMember} from '../../context.js';
import {ExpressionEvaluationError} from '../diagnostics.js';
import type {
  ExpressionFunctionArgumentType,
  ExpressionFunctionDefinition,
  ExpressionFunctionRegistry,
} from '../types.js';

/**
 * Check one runtime argument against the small type vocabulary supported by
 * expression-function signatures.
 *
 * Developer mini-guide:
 * - `any` accepts anything, including arrays/objects/null.
 * - `scalar` accepts the normal expression value domain: null/string/number/boolean.
 * - the remaining names (`string`, `number`, ...) use JavaScript `typeof`.
 *
 * Keep this deliberately narrower than application TypeScript types: registry
 * signatures are a runtime contract used for diagnostics before a function's
 * implementation executes.
 */
function valueMatches(type: ExpressionFunctionArgumentType, value: unknown): boolean {
  if (type === 'any') return true;
  if (type === 'scalar') {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  }
  return typeof value === type;
}

/**
 * Wrap a registry function with the shared arity/type validation contract.
 *
 * When adding a new function, normally register it through `checked({...})`
 * rather than validating arguments inside the implementation. This gives every
 * function the same error wording and keeps the evaluate callback focused on
 * semantics. `maxArguments: null` means variadic; `variadicType` validates all
 * arguments beyond the explicitly listed `argumentTypes`.
 */
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



const durationDayMs = 24 * 60 * 60 * 1000;

function parseCalendarDate(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(String(value ?? ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCalendarDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function daysInCalendarMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function withClampedCalendarYearMonth(date: Date, year: number, monthIndex: number): Date {
  const day = Math.min(date.getUTCDate(), daysInCalendarMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day));
}

function normalizeDurationValue(value: unknown): {years: number; months: number; days: number} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const part = (key: string) => {
    const numeric = Number(source[key] ?? 0);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
  };
  return {years: part('years'), months: part('months'), days: part('days')};
}

function addCalendarDurationValue(start: Date, duration: {years: number; months: number; days: number}): Date {
  let cursor = withClampedCalendarYearMonth(start, start.getUTCFullYear() + duration.years, start.getUTCMonth());
  const monthTotal = cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() + duration.months;
  cursor = withClampedCalendarYearMonth(cursor, Math.floor(monthTotal / 12), monthTotal % 12);
  return new Date(cursor.getTime() + duration.days * durationDayMs);
}

function calendarDurationBetweenValues(start: Date, end: Date): {years: number; months: number; days: number} | null {
  if (end.getTime() < start.getTime()) return null;
  let years = Math.max(0, end.getUTCFullYear() - start.getUTCFullYear());
  while (years > 0 && addCalendarDurationValue(start, {years, months: 0, days: 0}).getTime() > end.getTime()) years -= 1;
  let cursor = addCalendarDurationValue(start, {years, months: 0, days: 0});
  let months = Math.max(0, (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + end.getUTCMonth() - cursor.getUTCMonth());
  while (months > 0 && addCalendarDurationValue(cursor, {years: 0, months, days: 0}).getTime() > end.getTime()) months -= 1;
  cursor = addCalendarDurationValue(cursor, {years: 0, months, days: 0});
  const days = Math.max(0, Math.round((end.getTime() - cursor.getTime()) / durationDayMs));
  return {years, months, days};
}

/**
 * Hard-coded, keyed expression-function registry.
 *
 * This is the single developer entry point for evaluator functions used by
 * canonical metadata and UI metadata. Function names are intentionally
 * PascalCase and become part of the metadata language, so rename them only as
 * a deliberate metadata-contract migration.
 *
 * To add a function:
 * 1. add one keyed definition below using `checked(...)`;
 * 2. describe its signature in human-readable `signature.text`;
 * 3. choose the narrowest useful runtime argument types;
 * 4. keep the implementation entity/field agnostic;
 * 5. add evaluator tests for normal, empty/null, and error behaviour as relevant.
 *
 * The parser validates function existence/arity from this same registry; the
 * evaluator later invokes the registered implementation with already-evaluated
 * arguments and the evaluation context (`context.now()`, etc.).
 */
export const expressionFunctions: ExpressionFunctionRegistry = Object.freeze({
  /**
   * Numeric square root.
   * Example: `SqRoot(81)` -> `9`.
   * Primarily a compact reference implementation for a strict single-number
   * function and useful in metadata formulas that genuinely need it.
   */
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

  /**
   * Return the first member of a CTX-addressable collection, or null when the
   * collection is absent/empty. With `resultField`, return that member property.
   *
   * Examples:
   * - `FirstCtx(platformId.options, 'value')` -> first enum value.
   * - `FirstCtx(customerId.options, 'id')` -> first reference id.
   * - `FirstCtx(dataList)` -> first row object.
   *
   * This is intentionally collection-shape agnostic: arrays use index 0 and
   * objects use their first enumerable value. Do not add entity-specific
   * ordering here; callers must provide an already ordered collection.
   */
  FirstCtx: checked({
    name: 'FirstCtx',
    signature: {
      text: 'FirstCtx(collection, resultField?: string)',
      minArguments: 1,
      maxArguments: 2,
      argumentTypes: ['any', 'string'],
    },
    evaluate: ([collection, resultField]) => {
      if (collection == null || typeof collection !== 'object') return null;
      const first = Array.isArray(collection)
        ? collection[0]
        : Object.values(collection as Record<string, unknown>)[0];
      if (first === undefined) return null;
      return resultField
        ? resolveContextMember(first, resultField as string) ?? null
        : first;
    },
  }),

  /**
   * Return the current local calendar day at midnight in `datetime-local`
   * wire/display form (`YYYY-MM-DDT00:00`).
   *
   * Use this for UI/default expressions such as `CurrentDay()`. It deliberately
   * uses `context.now()` rather than constructing `new Date()` directly so tests
   * and future evaluator hosts can supply a deterministic clock.
   */
  CurrentDay: checked({
    name: 'CurrentDay',
    signature: {
      text: 'CurrentDay()',
      minArguments: 0,
      maxArguments: 0,
    },
    evaluate: (_args, context) => {
      const now = context.now();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T00:00`;
    },
  }),


  /** Calendar-aware date + {years,months,days}; months/years are never flattened to days. */
  CalendarAddDuration: checked({
    name: 'CalendarAddDuration',
    signature: {
      text: 'CalendarAddDuration(startDate: string, duration)',
      minArguments: 2,
      maxArguments: 2,
      argumentTypes: ['string', 'any'],
    },
    evaluate: ([startValue, durationValue]) => {
      const start = parseCalendarDate(startValue);
      const duration = normalizeDurationValue(durationValue);
      if (!start || !duration) return null;
      return formatCalendarDate(addCalendarDurationValue(start, duration));
    },
  }),

  /** Calendar-aware inverse of CalendarAddDuration, returning {years,months,days}. */
  CalendarDurationBetween: checked({
    name: 'CalendarDurationBetween',
    signature: {
      text: 'CalendarDurationBetween(startDate: string, endDate: string)',
      minArguments: 2,
      maxArguments: 2,
      argumentTypes: ['string', 'string'],
    },
    evaluate: ([startValue, endValue]) => {
      const start = parseCalendarDate(startValue);
      const end = parseCalendarDate(endValue);
      if (!start || !end) return null;
      return calendarDurationBetweenValues(start, end);
    },
  }),

  /**
   * Follow an id-based parent chain inside a CTX collection until the root row.
   * Optionally project one property from that root row.
   *
   * Example:
   * `TraverseCtx(parentId, dataList, 'parentId', 'id')`
   * starts at `parentId`, repeatedly reads each row's `parentId`, and returns
   * the terminal/root row's `id`.
   *
   * Collections are resolved through `resolveContextMember`, so keyed arrays and
   * object maps both work. Cycles are reported explicitly and depth is capped to
   * protect the evaluator from malformed or hostile hierarchy data.
   */
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

  /**
   * Current evaluator-clock timestamp in Unix milliseconds.
   * Example: `GetTime()` -> `1788135300000`.
   * Like CurrentDay(), this uses the injectable evaluator clock for deterministic
   * tests and host-independent behaviour.
   */
  GetTime: checked({
    name: 'GetTime',
    signature: {
      text: 'GetTime()',
      minArguments: 0,
      maxArguments: 0,
    },
    evaluate: (_args, context) => context.now().getTime(),
  }),

  /**
   * Replace zero-based placeholders with scalar values.
   * Example: `StrFormat('{0} / {1}', name, version)`.
   * Unknown placeholder indexes are intentionally left unchanged, which makes
   * partially supplied templates visible instead of silently dropping text.
   */
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
