import {
  compileExpression,
  evaluateCompiledExpression,
  expressionCapabilities,
  projectCalculatedRecord,
  type ExpressionEvaluationSource,
  type ManatOSContext,
  type ManatOSContextFields,
  type ManatOSObjectMetadata,
} from '@manatos/shared';

export interface CalculatedRecordProjectorOptions {
  readonly source: ExpressionEvaluationSource;
  readonly sourcePath: string;
  readonly purpose: string;
}

/**
 * Create the canonical synchronous server/UI-host adapter for calculated record fields.
 *
 * `@manatos/shared` owns fixed-point projection mechanics. This adapter owns only
 * expression compilation/evaluation for one host context. Resolver-backed
 * calculations are intentionally left untouched because they require the trusted
 * asynchronous capability path.
 */
export function createCalculatedRecordProjector<T extends Record<string, unknown>>(
  metadata: ManatOSObjectMetadata<T>,
  ctx: ManatOSContext,
  options: CalculatedRecordProjectorOptions,
): (entry: Readonly<Record<string, unknown>>) => Promise<Record<string, unknown>> {
  const fields = Object.values(metadata.fieldDefinition);
  const compiledByKey = new Map(
    fields
      .filter((field) => typeof field.calculation?.expression === 'string')
      .map((field) => [field.key, compileExpression(field.calculation!.expression)] as const),
  );

  return async (entry) =>
    projectCalculatedRecord(entry, fields, (_expression, { field, record }) => {
      const compiled = compiledByKey.get(field.key);
      if (!compiled || expressionCapabilities(compiled.ast).includes('entityResolver')) {
        return record[field.key];
      }
      return evaluateCompiledExpression(compiled, ctx, record, {
        source: options.source,
        sourcePath: options.sourcePath,
        targetPath: field.key,
        purpose: options.purpose,
      });
    });
}

/**
 * Materialize calculated values into an already-constructed CTX field collection.
 *
 * Construction-time materialization is not a runtime mutation: the resulting
 * `ctx.user`/root projection enters the browser already complete, so no later
 * browser watcher has to repair calculated anchors after publication.
 */
export async function materializeCalculatedContextFields<T>(
  metadata: ManatOSObjectMetadata<T>,
  ctx: ManatOSContext,
  fields: ManatOSContextFields,
  options: CalculatedRecordProjectorOptions,
): Promise<void> {
  const definitions = Object.values(metadata.fieldDefinition);
  const compiledByKey = new Map(
    definitions
      .filter((field) => typeof field.calculation?.expression === 'string')
      .map((field) => [field.key, compileExpression(field.calculation!.expression)] as const),
  );
  const record = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field?.value ?? null]),
  );
  const projected = await projectCalculatedRecord(
    record,
    definitions,
    (_expression, { field, record: currentRecord }) => {
      const compiled = compiledByKey.get(field.key);
      if (!compiled || expressionCapabilities(compiled.ast).includes('entityResolver')) {
        return currentRecord[field.key];
      }
      return evaluateCompiledExpression(compiled, ctx, fields, {
        source: options.source,
        sourcePath: options.sourcePath,
        targetPath: field.key,
        purpose: options.purpose,
      });
    },
  );

  for (const field of definitions) {
    if (typeof field.calculation?.expression !== 'string') continue;
    const target = fields[field.key];
    if (!target || !Object.prototype.hasOwnProperty.call(projected, field.key)) continue;
    target.value = projected[field.key];
  }
}
