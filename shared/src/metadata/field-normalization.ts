import { evaluateExpression } from '../expressions/evaluator.js';
import type { SysBOFieldMetadata } from './bo/types.js';

/**
 * Apply canonical metadata-declared field normalization to a partial record.
 * This is intentionally host-neutral so API CRUD and owner-managed UI aggregates
 * cannot diverge on normalization semantics.
 */
export function normalizeMetadataFieldValues(
  metadata: { fieldDefinition: Record<string, SysBOFieldMetadata> },
  values: Record<string, unknown>,
): Record<string, unknown> {
  const candidate = { ...values };

  for (const [key, field] of Object.entries(metadata.fieldDefinition)) {
    const expression = field.normalize?.expression;
    if (!expression || !Object.prototype.hasOwnProperty.call(candidate, key)) continue;

    const value = candidate[key];
    if (value === null || value === undefined || value === '') continue;

    candidate[key] = evaluateExpression(
      expression,
      { value },
      { value },
      {
        source: 'field-normalization',
        sourcePath: `fieldDefinition.${key}.normalize`,
        targetPath: key,
        purpose: 'normalize canonical field value',
      },
    );
  }

  return candidate;
}
