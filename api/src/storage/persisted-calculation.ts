import {
  evaluateExpressionAsync,
  type EntityResolver,
  type SysBOEntity,
  type SysBOMetadata,
} from '@manatos/shared';

import { apiContextRuntime } from '../context/api-context-runtime.js';

function calculationFields<T extends SysBOEntity>(
  metadata: SysBOMetadata<T>,
  candidate: Readonly<Record<string, unknown>>,
): Record<string, { value: unknown }> {
  return Object.fromEntries(
    Object.keys(metadata.fieldDefinition).map((key) => [key, { value: candidate[key] }]),
  );
}

/**
 * Materialize metadata-declared persisted calculations with one invariant
 * evaluator path. When called inside an API request, every calculation owns a
 * nested CALCULATION CTX level beneath the current (normally STORAGE) level.
 * Bootstrap/background owners use the same evaluator with an attached local
 * semantic scope and no synthetic API request.
 */
export async function materializePersistedCalculations<T extends SysBOEntity>(
  metadata: SysBOMetadata<T>,
  record: T,
  entityResolver: EntityResolver,
): Promise<T> {
  const calculations = Object.entries(metadata.fieldDefinition)
    .filter(([, field]) => field.calculation?.persisted === true)
    .map(([key, field]) => [key, field.calculation!] as const);
  if (!calculations.length) return record;

  const candidate = { ...(record as unknown as Record<string, unknown>) };
  const maxPasses = Math.max(4, calculations.length * 4);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

    for (const [key, calculation] of calculations) {
      const fields = calculationFields(metadata, candidate);
      const caller = {
        source: 'calculated-field' as const,
        sourcePath: `fieldDefinition.${key}.calculation`,
        targetPath: key,
        purpose: 'materialize persisted calculated field before persistence',
      };

      const evaluate = (root: unknown, scope: unknown) =>
        evaluateExpressionAsync(
          calculation.expression,
          {
            owner: 'api-storage',
            root,
            scope,
            capabilities: ['pure', 'clock', 'ctx', 'entityResolver'],
            entityResolver,
          },
          caller,
        );

      const value = apiContextRuntime.currentPath()
        ? await apiContextRuntime.runLevel(
            {
              name: `CALCULATION · ${metadata.key}.${key}`,
              data: { current: candidate, fields },
              resources: { entityKey: metadata.key, fieldKey: key },
            },
            async (level) => evaluate(apiContextRuntime.tree(), level.data?.fields ?? fields),
          )
        : await evaluate({ fields }, fields);

      if (!Object.is(candidate[key], value)) {
        candidate[key] = value;
        changed = true;
      }
    }

    if (!changed) return candidate as unknown as T;
  }

  throw new Error(
    `Persisted calculated fields for ${metadata.key} did not settle within ${maxPasses} evaluation passes.`,
  );
}
