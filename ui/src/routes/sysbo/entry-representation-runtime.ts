import type { SysBOMetadata, SysBOUIMetadata } from '@manatos/shared';

/**
 * Project portable entry-representation metadata for browser consumers.
 * Expression source remains the contract; the browser compiles/caches its own
 * AST through the shared expression compiler when the representation is used.
 */
export function entryRepresentationRuntime(
  metadata: SysBOMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata,
  referenceData: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const sourceFor = (source: NonNullable<typeof metadata.entry>['name'] | undefined) =>
    source ? { ...source } : null;

  return {
    name: sourceFor(
      metadata.entry?.name ??
        (metadata.fieldDefinition.name ? { field: 'name' } : { field: metadata.primaryField }),
    ),
    type: sourceFor(
      metadata.entry?.type ?? (metadata.fieldDefinition.type ? { field: 'type' } : undefined),
    ),
    description: sourceFor(metadata.entry?.description),
    status: sourceFor(metadata.entry?.status),
    calculations: Object.fromEntries(
      Object.entries(metadata.fieldDefinition)
        .filter(([, field]) => Boolean(field.calculation?.expression))
        .map(([key, field]) => [key, field.calculation!.expression]),
    ),
    relationships: Object.fromEntries(
      Object.entries(metadata.relationships ?? {})
        .filter(([, relationship]) => relationship.fields.length === 1)
        .map(([key, relationship]) => [key, { field: relationship.fields[0] }]),
    ),
    referenceData,
    icon: metadataUI.entry?.icon ?? { mode: metadata.entry?.type ? 'composed' : 'entity' },
  };
}
