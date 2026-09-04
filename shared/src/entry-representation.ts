import type {
  ManatOSEntryValueSourceMetadata,
  ManatOSObjectMetadata,
} from './metadata/bo/types.js';
import type { SysBOUIEntryIconMetadata, SysBOUIMetadata } from './metadata/ui/types.js';
import { calculatedContextField, evaluateExpression } from './expressions/index.js';

/** Reference rows are supplied by the owner; representation resolution never performs I/O. */
export interface EntryRepresentationResolutionOptions {
  /** Entity/page icon, deliberately separate from the icon of an individual entry. */
  entityIcon?: string | null;
  /** Reference catalogues keyed by the referencing field key. */
  referenceData?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
  /** Explicit relationship projections exposed to expressions as `relations.<relationshipKey>` . */
  relations?: Readonly<Record<string, unknown>>;
}

export interface ResolvedEntryRepresentation {
  name: string;
  typeValue: unknown;
  typeName: string | null;
  typeIcon: string | null;
  description: string | null;
  status: unknown;
  icons: readonly string[];
}

/** Default entry-name source: explicit metadata, then `name`, then primaryField. */
export function entryNameSource<T>(
  metadata: ManatOSObjectMetadata<T>,
): ManatOSEntryValueSourceMetadata {
  return (
    metadata.entry?.name ??
    (metadata.fieldDefinition.name ? { field: 'name' } : { field: metadata.primaryField })
  );
}

/** Default entry-type source: explicit metadata, then an exact canonical `type` field. */
export function entryTypeSource<T>(
  metadata: ManatOSObjectMetadata<T>,
): ManatOSEntryValueSourceMetadata | null {
  return metadata.entry?.type ?? (metadata.fieldDefinition.type ? { field: 'type' } : null);
}

function buildEntryScope<T>(
  metadata: ManatOSObjectMetadata<T>,
  entry: Readonly<Record<string, unknown>>,
  relations: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const scope: Record<string, unknown> = { ...entry, relations };

  // Derived variables stay evaluator-owned. Referencing one from an entry formula
  // lazily evaluates it (and any derived dependency it references) first.
  for (const [key, derived] of Object.entries(metadata.derivedFields ?? {})) {
    scope[key] = calculatedContextField(derived.expression, {
      ...(Object.prototype.hasOwnProperty.call(entry, key) ? { value: entry[key] } : {}),
    });
  }
  return scope;
}

function resolveSource<T>(
  metadata: ManatOSObjectMetadata<T>,
  entry: Readonly<Record<string, unknown>>,
  source: ManatOSEntryValueSourceMetadata | undefined,
  relations: Readonly<Record<string, unknown>>,
  purpose: string,
): unknown {
  if (!source) return null;

  // A direct field source is metadata selection, not a formula. Read it
  // directly so optional/omitted properties resolve to `undefined` instead of
  // becoming an unknown evaluator identifier.
  if ('field' in source) return entry[source.field];

  // A simple expression that names one canonical field has the same data
  // dependency as `{ field: ... }`. Resolve it directly as well. This matters
  // for create pages where the supplemental entry representation can be built
  // before record create-defaults are materialized into CTX; a missing optional
  // field must produce `undefined`, not an ExpressionEvaluationError.
  const directExpressionField = directSourceField(metadata, source);
  if (directExpressionField) return entry[directExpressionField];

  const scope = buildEntryScope(metadata, entry, relations);
  return evaluateExpression(source.expression, scope, scope, {
    source: 'renderer',
    sourcePath: `entry.${purpose}`,
    targetPath: `entry.${purpose}`,
    purpose: `resolve entry ${purpose}`,
  });
}

function directSourceField<T>(
  metadata: ManatOSObjectMetadata<T>,
  source: ManatOSEntryValueSourceMetadata | null,
): string | null {
  if (!source) return null;
  if ('field' in source) return source.field;
  const candidate = source.expression.trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate) && metadata.fieldDefinition[candidate]
    ? candidate
    : null;
}

function relationshipProjection<T>(
  metadata: ManatOSObjectMetadata<T>,
  entry: Readonly<Record<string, unknown>>,
  referenceData: EntryRepresentationResolutionOptions['referenceData'],
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [relationshipKey, relationship] of Object.entries(metadata.relationships ?? {})) {
    if (relationship.fields.length !== 1 || relationship.references.fields.length !== 1) continue;
    const fieldKey = relationship.fields[0]!;
    const value = entry[fieldKey];
    const row = matchingReferenceRow(fieldKey, value, referenceData);
    if (row) result[relationshipKey] = row;
  }
  return result;
}

function relationKeyFromExpression(source: ManatOSEntryValueSourceMetadata | null): string | null {
  if (!source || !('expression' in source)) return null;
  return /^relations\.([A-Za-z_$][A-Za-z0-9_$]*)\./.exec(source.expression.trim())?.[1] ?? null;
}

function matchingReferenceRow(
  fieldKey: string,
  value: unknown,
  referenceData: EntryRepresentationResolutionOptions['referenceData'],
): Readonly<Record<string, unknown>> | null {
  if (!referenceData || value === null || value === undefined || value === '') return null;
  return (
    referenceData[fieldKey]?.find((row) => String(row.id ?? row.value ?? '') === String(value)) ??
    null
  );
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function normalizeIcon(icon: unknown): string | null {
  const value = stringOrNull(icon);
  return value ? value.replace(/^bi-/, '') : null;
}

function resolvedIcons(
  iconMetadata: SysBOUIEntryIconMetadata | undefined,
  entityIcon: string | null,
  typeIcon: string | null,
): readonly string[] {
  const mode = iconMetadata?.mode ?? (typeIcon ? 'composed' : 'entity');
  if (mode === 'fixed' && iconMetadata?.mode === 'fixed')
    return [normalizeIcon(iconMetadata.icon)].filter((value): value is string => Boolean(value));
  if (mode === 'type') return typeIcon ? [typeIcon] : [];
  if (mode === 'composed')
    return [entityIcon, typeIcon].filter((value): value is string => Boolean(value));
  return entityIcon ? [entityIcon] : [];
}

/**
 * Resolve one entity entry's reusable representation without performing I/O.
 * Reference records and relationship projections are supplied by the current
 * owner, preserving the no-hidden-API-call component rule.
 */
export function resolveEntryRepresentation<T>(
  metadata: ManatOSObjectMetadata<T>,
  uiMetadata: Pick<SysBOUIMetadata, 'entry'> | null | undefined,
  entry: Readonly<Record<string, unknown>>,
  options: EntryRepresentationResolutionOptions = {},
): ResolvedEntryRepresentation {
  const relations =
    options.relations ?? relationshipProjection(metadata, entry, options.referenceData);
  const nameSource = entryNameSource(metadata);
  const typeSource = entryTypeSource(metadata);
  const typeValue = typeSource
    ? resolveSource(metadata, entry, typeSource, relations, 'type')
    : null;
  const typeFieldKey = directSourceField(metadata, typeSource);
  const typeField = typeFieldKey ? metadata.fieldDefinition[typeFieldKey] : undefined;

  const enumItem = typeField?.enumItems?.find((item) => String(item.value) === String(typeValue));
  const relationTypeKey = relationKeyFromExpression(typeSource);
  const relationTypeRow =
    relationTypeKey && relations[relationTypeKey] && typeof relations[relationTypeKey] === 'object'
      ? (relations[relationTypeKey] as Readonly<Record<string, unknown>>)
      : null;
  const referenceRow =
    typeFieldKey && typeField?.type === 'reference'
      ? matchingReferenceRow(typeFieldKey, typeValue, options.referenceData)
      : relationTypeRow;

  const typeName = stringOrNull(
    enumItem?.label ??
      referenceRow?.label ??
      referenceRow?.name ??
      (typeValue === null || typeValue === undefined ? null : typeValue),
  );
  const typeIcon = normalizeIcon(
    enumItem?.icon ?? referenceRow?.__entryIcon ?? referenceRow?.icon ?? referenceRow?.__entityIcon,
  );
  const entityIcon = normalizeIcon(options.entityIcon);

  return {
    name: stringOrNull(resolveSource(metadata, entry, nameSource, relations, 'name')) ?? '',
    typeValue,
    typeName,
    typeIcon,
    description: stringOrNull(
      resolveSource(metadata, entry, metadata.entry?.description, relations, 'description'),
    ),
    status: resolveSource(metadata, entry, metadata.entry?.status, relations, 'status'),
    icons: resolvedIcons(uiMetadata?.entry?.icon, entityIcon, typeIcon),
  };
}
