import { evaluateExpression } from '../../expressions/evaluator.js';
import type { SysBOEnumItemMetadata, SysBOFieldMetadata } from '../bo/types.js';
import { allManatOSSubsystemMetadata } from './registry.js';
import type { ManatOSEnumMetadata, ManatOSSubsystemMetadata } from './types.js';

/** Installed canonical enums. Ownership remains in the subsystem declarations. */
export const allManatOSEnumMetadata: Readonly<Record<string, ManatOSEnumMetadata>> = Object.freeze(
  Object.fromEntries(
    (Object.values(allManatOSSubsystemMetadata) as readonly ManatOSSubsystemMetadata[]).flatMap(
      (subsystem) =>
        Object.values(subsystem.enums ?? {}).map((metadata) => [metadata.key, metadata]),
    ),
  ),
);

export function canonicalEnumMetadata(
  enumKey: string | undefined,
): ManatOSEnumMetadata | undefined {
  return enumKey ? allManatOSEnumMetadata[enumKey] : undefined;
}

/** Resolve enum values plus calculated value properties from the canonical subsystem definition. */
export function canonicalEnumItems(enumKey: string | undefined): readonly SysBOEnumItemMetadata[] {
  const definition = canonicalEnumMetadata(enumKey);
  if (!definition) return [];
  return Object.entries(definition.values).map(([valueKey, value]) => {
    const resolved: Record<string, unknown> = { ...value };
    for (const [property, calculation] of Object.entries(definition.calculatedProperties ?? {})) {
      resolved[property] = evaluateExpression(calculation.expression, resolved, resolved, {
        source: 'other',
        sourcePath: `$enums.${definition.name}.values.${valueKey}.${property}`,
        purpose: 'calculate enum property',
      });
    }
    return Object.freeze(resolved) as SysBOEnumItemMetadata;
  });
}

/** Compatibility-aware field resolver while legacy inline enums are migrated independently. */
export function enumItemsForField(
  field: Pick<SysBOFieldMetadata, 'enum' | 'enumItems'> | null | undefined,
): readonly SysBOEnumItemMetadata[] {
  if (field?.enum) return canonicalEnumItems(field.enum);
  return field?.enumItems ?? [];
}

export function enumValuesForField(
  field: Pick<SysBOFieldMetadata, 'enum' | 'enumItems' | 'enumValues'> | null | undefined,
): readonly string[] {
  if (field?.enum) return enumItemsForField(field).map((item) => String(item.value));
  if (field?.enumItems?.length) return field.enumItems.map((item) => String(item.value));
  return field?.enumValues ?? [];
}
