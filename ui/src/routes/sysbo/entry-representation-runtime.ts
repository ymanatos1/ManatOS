import {
  compileExpression,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

/**
 * Compile reusable entry-representation formulas once for browser consumers.
 * The returned object is pure JSON metadata + AST + owner-supplied reference
 * data; components never reparse formulas or perform hidden I/O.
 */
export function compiledEntryRepresentationRuntime(

  metadata: SysBOMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata,
  referenceData: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const compileSource = (source: NonNullable<typeof metadata.entry>['name'] | undefined) => source
    ? {
        ...source,
        ast: compileExpression('expression' in source ? source.expression : source.field).ast,
      }
    : null;

  return {
    name: compileSource(metadata.entry?.name ?? (metadata.fieldDefinition.name ? { field: 'name' } : { field: metadata.primaryField })),
    type: compileSource(metadata.entry?.type ?? (metadata.fieldDefinition.type ? { field: 'type' } : undefined)),
    description: compileSource(metadata.entry?.description),
    status: compileSource(metadata.entry?.status),
    calculations: Object.fromEntries(Object.entries(metadata.fieldDefinition)
      .filter(([, field]) => Boolean(field.calculation?.expression))
      .map(([key, field]) => [
        key,
        compileExpression(field.calculation!.expression).ast,
      ])),
    relationships: Object.fromEntries(Object.entries(metadata.relationships ?? {})
      .filter(([, relationship]) => relationship.fields.length === 1)
      .map(([key, relationship]) => [key, { field: relationship.fields[0] }])),
    referenceData,
    icon: metadataUI.entry?.icon ?? { mode: metadata.entry?.type ? 'composed' : 'entity' },
  };
}