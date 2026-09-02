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
  const validate = (args: readonly unknown[]) => {
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
  };

  return {
    ...definition,
    evaluate(args, context) {
      validate(args);
      return definition.evaluate(args, context);
    },
    ...(definition.evaluateAsync ? {
      async evaluateAsync(args, context) {
        validate(args);
        return definition.evaluateAsync!(args, context);
      },
    } : {}),
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

/* ==========================================================================
 * Contact normalization helpers
 *
 * These helpers implement canonical contact-value normalization used by both
 * metadata expressions and trusted domain code. Keep them entity agnostic:
 * they normalize values, never decide which SysBO owns or may edit them.
 * ======================================================================== */

/**
 * Normalize a telephone number to canonical E.164-like `+<digits>` form.
 *
 * Accepted forms:
 * - `TelephoneNbr('+306944386714')` for an already-composed international number;
 * - `TelephoneNbr('+30', '6944386714')` when UI metadata captures country code
 *   and national number separately.
 *
 * Formatting characters are removed, the leading international `+` is
 * mandatory, and the final value is bounded by the 15-digit E.164 maximum.
 * Empty input returns null so optional contact fields remain nullable.
 */
export function normalizeTelephoneNumber(...rawArgs: unknown[]): string | null {
  if (rawArgs.length !== 1 && rawArgs.length !== 2) {
    throw new ExpressionEvaluationError('TelephoneNbr expects one full-number value or countryCode + number.');
  }
  const clean = (value: unknown) => String(value ?? '').trim();
  if (rawArgs.length === 1) {
    const raw = clean(rawArgs[0]);
    if (!raw) return null;
    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/\D/g, '');
    if (!hasPlus || digits.length < 4 || digits.length > 15) {
      throw new ExpressionEvaluationError('TelephoneNbr requires an international number beginning with + and containing 4-15 digits.');
    }
    return `+${digits}`;
  }
  const countryRaw = clean(rawArgs[0]);
  const numberRaw = clean(rawArgs[1]);
  const countryDigits = countryRaw.replace(/\D/g, '');
  const numberDigits = numberRaw.replace(/\D/g, '');
  if (!countryRaw.startsWith('+') || countryDigits.length < 1 || countryDigits.length > 4 || numberDigits.length < 3) {
    throw new ExpressionEvaluationError('TelephoneNbr requires a +country code and a valid national number.');
  }
  const full = `${countryDigits}${numberDigits}`;
  if (full.length > 15) throw new ExpressionEvaluationError('TelephoneNbr exceeds the 15-digit international telephone limit.');
  return `+${full}`;
}

/**
 * Normalize an email address for canonical identity/deduplication use.
 *
 * Leading/trailing whitespace is removed and the value is lower-cased before
 * a deliberately small structural validation (`local@domain.tld`). This is not
 * an SMTP deliverability check; it keeps storage/deduplication deterministic
 * without embedding provider-specific policy in the expression language.
 */
export function normalizeEmailAddress(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ExpressionEvaluationError('EmailAddress requires a valid email address.');
  }
  return normalized;
}

/**
 * Hard-coded, keyed expression-function registry.
 *
 * This is the single developer entry point for evaluator functions used by
 * canonical metadata and UI metadata. Function names are intentionally
 * PascalCase and become part of the metadata language, so rename them only as
 * a deliberate metadata-contract migration.
 *
 * Functions are grouped below by semantic area. Keep new registrations in the
 * narrowest existing group (or add a clearly named new group) instead of
 * appending unrelated functions at the end.
 *
 * To add a function:
 * 1. add one keyed definition below using `checked(...)`;
 * 2. document purpose, examples and edge/null behaviour in JSDoc;
 * 3. describe its signature in human-readable `signature.text`;
 * 4. choose the narrowest execution capability (`pure`, `clock`, `ctx`, or
 *    `entityResolver`) and the narrowest useful runtime argument types;
 * 5. keep the implementation entity/field agnostic; resolver-backed functions
 *    consume `context.entityResolver` and never import a storage adapter;
 * 6. add evaluator tests for normal, empty/null, lazy and error behaviour as relevant.
 *
 * The parser validates function existence/arity from this same registry; the
 * evaluator later invokes the registered implementation with already-evaluated
 * arguments and the evaluation context (`context.now()`, etc.).
 */
export const expressionFunctions: ExpressionFunctionRegistry = Object.freeze({
  /* ------------------------------------------------------------------------
   * Contact values
   * --------------------------------------------------------------------- */
  /**
   * Canonical email-address normalization.
   * Example: `EmailAddress('  USER@Example.COM ')` -> `user@example.com`.
   * Empty input becomes null; structurally invalid input raises an evaluator
   * error so metadata/domain validation can surface one consistent failure.
   */
  EmailAddress: checked({
    name: 'EmailAddress',
    capability: 'pure',
    signature: { text: 'EmailAddress(value: scalar)', minArguments: 1, maxArguments: 1, argumentTypes: ['scalar'] },
    evaluate: ([value]) => normalizeEmailAddress(value),
  }),

  /**
   * Canonical telephone normalization from either a complete international
   * value or a separate country-code/national-number pair.
   * Examples: `TelephoneNbr('+30 694 438 6714')` and
   * `TelephoneNbr('+30', '6944386714')` -> `+306944386714`.
   */
  TelephoneNbr: checked({
    name: 'TelephoneNbr',
    capability: 'pure',
    signature: {
      text: 'TelephoneNbr(value: scalar) or TelephoneNbr(countryCode: scalar, number: scalar)',
      minArguments: 1,
      maxArguments: 2,
      argumentTypes: ['scalar', 'scalar'],
    },
    evaluate: (args) => normalizeTelephoneNumber(...args),
  }),

  /* ------------------------------------------------------------------------
   * General numeric and CTX helpers
   * --------------------------------------------------------------------- */

  /**
   * Numeric square root.
   * Example: `SqRoot(81)` -> `9`.
   * Primarily a compact reference implementation for a strict single-number
   * function and useful in metadata formulas that genuinely need it.
   */
  SqRoot: checked({
    name: 'SqRoot',
    capability: 'pure',
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
    capability: 'ctx',
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

  /* ------------------------------------------------------------------------
   * Calendar and clock functions
   * --------------------------------------------------------------------- */

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
    capability: 'clock',
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


  /**
   * Add a structured `{years, months, days}` duration to a calendar date.
   * Month/year arithmetic is calendar-aware (including end-of-month clamping)
   * and is never flattened into an approximate number of days.
   * Example: `CalendarAddDuration('2024-01-31', duration)`.
   */
  CalendarAddDuration: checked({
    name: 'CalendarAddDuration',
    capability: 'pure',
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

  /**
   * Calendar-aware inverse of `CalendarAddDuration`.
   * Returns the largest non-negative `{years, months, days}` duration that
   * reaches `endDate` from `startDate`; returns null when end precedes start.
   */
  CalendarDurationBetween: checked({
    name: 'CalendarDurationBetween',
    capability: 'pure',
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

  /* ------------------------------------------------------------------------
   * CTX hierarchy/navigation
   * --------------------------------------------------------------------- */

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
    capability: 'ctx',
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
   * Follow a canonical persisted entity hierarchy through the EntityResolver.
   *
   * Unlike TraverseCtx(), this function never depends on a page/list snapshot.
   * The evaluation owner supplies the starting value from its own execution
   * scope; only the persistence-backed traversal itself requires the
   * `entityResolver` capability. This makes the same declarative formula valid
   * in browser-owned live calculations, API saves and background processes.
   *
   * Example:
   * `TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')`
   * walks the persisted Principal parent chain and returns the terminal id.
   * Empty starts return null. Missing rows return null. Cycles and excessive
   * depth are explicit evaluation errors.
   */
  TraverseEntity: checked({
    name: 'TraverseEntity',
    capability: 'entityResolver',
    signature: {
      text: "TraverseEntity(startId, entityKey: string, parentField: string, resultField?: string)",
      minArguments: 3,
      maxArguments: 4,
      argumentTypes: ['scalar', 'string', 'string', 'string'],
    },
    evaluate: () => {
      throw new ExpressionEvaluationError('TraverseEntity requires asynchronous entityResolver execution.');
    },
    async evaluateAsync([startId, entityKey, parentField, resultField], context) {
      if (startId === null || startId === undefined || startId === '') return null;
      const resolver = context.entityResolver;
      if (!resolver) {
        throw new ExpressionEvaluationError(
          `TraverseEntity requires capability 'entityResolver', unavailable to evaluation owner '${context.owner}'.`,
        );
      }

      const seen = new Set<string>();
      let id: unknown = startId;
      let root: Readonly<Record<string, unknown>> | null = null;

      for (let depth = 0; depth < 256; depth += 1) {
        const key = String(id);
        if (seen.has(key)) {
          throw new ExpressionEvaluationError(`TraverseEntity detected a parent cycle at ${key}.`);
        }
        seen.add(key);

        root = await resolver.getById(entityKey as string, id);
        if (!root) return null;

        const parent = root[parentField as string];
        if (parent === null || parent === undefined || parent === '') {
          return resultField ? (root[resultField as string] ?? null) : root;
        }
        id = parent;
      }

      throw new ExpressionEvaluationError('TraverseEntity exceeded the maximum traversal depth of 256.');
    },
  }),

  /* ------------------------------------------------------------------------
   * Runtime and text utilities
   * --------------------------------------------------------------------- */

  /**
   * Current evaluator-clock timestamp in Unix milliseconds.
   * Example: `GetTime()` -> `1788135300000`.
   * Like CurrentDay(), this uses the injectable evaluator clock for deterministic
   * tests and host-independent behaviour.
   */
  GetTime: checked({
    name: 'GetTime',
    capability: 'clock',
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
    capability: 'pure',
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
