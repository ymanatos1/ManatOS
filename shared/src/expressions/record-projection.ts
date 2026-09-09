/**
 * Canonical fixed-point materializer for calculated fields on record-shaped data.
 *
 * The helper deliberately owns only projection mechanics: iteration order,
 * convergence and error isolation. Expression compilation/evaluation remains with
 * the execution host through the injected evaluator, so browser/server hosts do
 * not grow independent fixed-point algorithms.
 */
export interface CalculatedRecordProjectionField {
  readonly key: string;
  readonly calculation?: {
    readonly expression?: string;
  };
}

export interface CalculatedRecordProjectionStep {
  readonly field: CalculatedRecordProjectionField;
  readonly record: Readonly<Record<string, unknown>>;
  readonly pass: number;
}

export type CalculatedRecordProjectionEvaluator = (
  expression: string,
  step: CalculatedRecordProjectionStep,
) => unknown | Promise<unknown>;

export interface CalculatedRecordProjectionOptions {
  /**
   * Maximum fixed-point passes. The default is the number of calculated fields,
   * which is sufficient for an acyclic chain where each pass resolves at least
   * one later dependency.
   */
  readonly maxPasses?: number;
  /** Optional diagnostic hook. A failed field remains at its previous value. */
  readonly onError?: (error: unknown, step: CalculatedRecordProjectionStep) => void;
}

export async function projectCalculatedRecord<T extends Readonly<Record<string, unknown>>>(
  source: T,
  fields: readonly CalculatedRecordProjectionField[],
  evaluate: CalculatedRecordProjectionEvaluator,
  options: CalculatedRecordProjectionOptions = {},
): Promise<T> {
  const calculated = fields.filter(
    (field) => typeof field.key === 'string' && typeof field.calculation?.expression === 'string',
  );
  if (!calculated.length) return source;

  const record: Record<string, unknown> = { ...source };
  const maxPasses = Math.max(1, options.maxPasses ?? calculated.length);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const field of calculated) {
      const step: CalculatedRecordProjectionStep = { field, record, pass };
      try {
        const next = await evaluate(field.calculation!.expression!, step);
        if (!Object.is(record[field.key], next)) {
          record[field.key] = next;
          changed = true;
        }
      } catch (error) {
        options.onError?.(error, step);
      }
    }
    if (!changed) break;
  }

  return record as unknown as T;
}
