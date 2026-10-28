import { enumItemsForField } from '../metadata/subsystems/enum-registry.js';
import { relationshipForField } from '../metadata/bo/relationships.js';
import type {
  ManatOSEntryValueSourceMetadata,
  ManatOSObjectMetadata,
} from '../metadata/bo/types.js';
import type { SysBOUIMetadata } from '../metadata/ui/types.js';
import { MANATOS_COMPANY } from '../domain/company-platform.js';
import { evaluateExpression } from '../expressions/index.js';
import { resolveMetadataText, type MetadataLanguage } from '../multilingual/metadata/index.js';

/** Reference rows are supplied by the owner; representation resolution never performs I/O. */
export interface EntryRepresentationResolutionOptions {
  /** Resolve enum display captions only; no effect on stored enum codes or evaluation. */
  language?: MetadataLanguage;
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
  photo: unknown;
}

/** Explicit entry-name source or the entity's canonical primary field. */
export function entryNameSource<T>(
  metadata: ManatOSObjectMetadata<T>,
): ManatOSEntryValueSourceMetadata {
  return (
    metadata.entry?.name ??
    (metadata.fieldDefinition[metadata.primaryField]
      ? { field: metadata.primaryField }
      : { field: 'name' })
  );
}

/** Default entry-type source: explicit metadata, then an exact canonical `type` field. */
export function entryTypeSource<T>(
  metadata: ManatOSObjectMetadata<T>,
): ManatOSEntryValueSourceMetadata | null {
  return metadata.entry?.type ?? (metadata.fieldDefinition.type ? { field: 'type' } : null);
}

function buildEntryScope(
  entry: Readonly<Record<string, unknown>>,
  relations: Readonly<Record<string, unknown>>,
  scopeDefaults: Readonly<Record<string, null>>,
): Record<string, unknown> {
  /*
   * Calculated fields must already have crossed the canonical record-projection
   * boundary before entry representation is resolved. Representation owns only
   * name/type/description/status interpretation; it must never run a second
   * calculated-field projection algorithm.
   */
  return { ...scopeDefaults, ...entry, relations };
}

function resolveSource<T>(
  metadata: ManatOSObjectMetadata<T>,
  entry: Readonly<Record<string, unknown>>,
  source: ManatOSEntryValueSourceMetadata | undefined,
  relations: Readonly<Record<string, unknown>>,
  purpose: string,
  scopeDefaults: Readonly<Record<string, null>>,
): unknown {
  if (!source) return null;

  // Direct fields are factual reads from the canonical projected record.
  // Calculated-field materialization is deliberately owned by the projection
  // boundary, not by representation resolution.
  if ('field' in source) return entry[source.field];

  // A simple expression naming one canonical non-calculated field has the same
  // dependency as `{ field: ... }` and can be resolved without evaluator work.
  const directExpressionField = directSourceField(metadata, source);
  if (
    directExpressionField &&
    !metadata.fieldDefinition[directExpressionField]?.calculation?.expression
  ) {
    return entry[directExpressionField];
  }

  const scope = buildEntryScope(entry, relations, scopeDefaults);
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

/** A configured Entry image must be a readable, non-sensitive picture field. */
export function entryPhotoField<T>(metadata: ManatOSObjectMetadata<T>): string | null {
  const key = metadata.entry?.image?.field;
  if (!key) return null;
  const field = metadata.fieldDefinition[key];
  return field?.type === 'picture' && !field.sensitive ? key : null;
}

/** Resolve only fields required to represent an Entry, including fallback identity.
 * Expression dependencies are tracked against canonical field metadata; any calculated
 * field is accompanied by its own transitive inputs. No reference traversal occurs.
 */
export function entryPresentationFieldKeys<T>(
  metadata: ManatOSObjectMetadata<T>,
): readonly string[] {
  const definitions = metadata.fieldDefinition;
  const required = new Set<string>(['id']);
  const visit = (fieldKey: string): void => {
    const field = definitions[fieldKey];
    if (!field || field.sensitive || required.has(fieldKey)) return;
    required.add(fieldKey);
    if (field.calculation?.expression) scan(field.calculation.expression);
  };
  const scan = (expression: string): void => {
    for (const key of Object.keys(definitions)) {
      // Identifier boundary: avoid substring matches (e.g. name within userName).
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^a-zA-Z0-9_$])${escaped}(?![a-zA-Z0-9_$])`).test(expression)) visit(key);
    }
  };
  const add = (source: ManatOSEntryValueSourceMetadata | null | undefined): void => {
    if (!source) return;
    if ('field' in source) visit(source.field);
    else scan(source.expression);
  };
  add(entryNameSource(metadata));
  add(entryTypeSource(metadata));
  add(metadata.entry?.description);
  add(metadata.entry?.status);
  visit(metadata.primaryField); // Fallback identity
  // An actual entry's first usable fallback text is selected at projection time;
  // do not ship every string field from the referenced business record.
  const image = entryPhotoField(metadata);
  if (image) visit(image);
  return [...required];
}

/** The entity icon is canonical navigation metadata, not Entry presentation metadata. */
function canonicalEntityIcon(entityKey: string): string | null {
  const items = [
    ...MANATOS_COMPANY.navigation,
    ...MANATOS_COMPANY.platforms.flatMap((platform) => platform.navigation),
  ];
  return normalizeIcon(items.find((item) => item.entityKey === entityKey)?.icon);
}

function resolvedIcons(entityIcon: string | null, typeIcon: string | null): readonly string[] {
  return [entityIcon, typeIcon].filter((icon): icon is string => Boolean(icon));
}

/**
 * Resolve one entity entry's reusable representation without performing I/O.
 * Reference records and relationship projections are supplied by the current
 * owner, preserving the no-hidden-API-call component rule.
 */
export type PreparedEntryRepresentation = (
  entry: Readonly<Record<string, unknown>>,
  options?: EntryRepresentationResolutionOptions,
) => ResolvedEntryRepresentation;

/** Prepare a canonical entry representation once per Field/column, not per visible row. */
export function prepareEntryRepresentation<T>(
  metadata: ManatOSObjectMetadata<T>,
  uiMetadata: SysBOUIMetadata | null | undefined,
): PreparedEntryRepresentation {
  const nameSource = entryNameSource(metadata);
  const typeSource = entryTypeSource(metadata);
  const typeFieldKey = directSourceField(metadata, typeSource);
  const typeField = typeFieldKey ? metadata.fieldDefinition[typeFieldKey] : undefined;
  const enumItems = new Map(enumItemsForField(typeField).map((item) => [String(item.value), item]));
  const relationTypeKey = relationKeyFromExpression(typeSource);
  void uiMetadata; // Compatibility argument: identity and imagery come from canonical BO metadata.
  const photoField = entryPhotoField(metadata);
  const entityIcon = canonicalEntityIcon(metadata.key);
  // Fallback identity comes from the first canonical, non-sensitive Text field in order.
  const fallbackTextFields = Object.entries(metadata.fieldDefinition)
    .filter(([, field]) => field.type === 'string' && !field.sensitive)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key]) => key);
  // The evaluator requires declared variables to exist even when a record omits them.
  // Prepare null defaults once; missing calculated fields remain uncalculated.
  const scopeDefaults = Object.fromEntries(
    Object.keys(metadata.fieldDefinition).map((key) => [key, null] as const),
  );
  const descriptionSource = metadata.entry?.description;
  const statusSource = metadata.entry?.status;
  // Most direct-field representations do not need relationship projection at all.
  const needsRelations = [nameSource, typeSource, descriptionSource, statusSource].some(
    (source) => source && 'expression' in source && source.expression.includes('relations.'),
  );

  return (entry, options = {}) => {
    const relations =
      options.relations ??
      (needsRelations ? relationshipProjection(metadata, entry, options.referenceData) : {});
    const typeValue = typeSource
      ? resolveSource(metadata, entry, typeSource, relations, 'type', scopeDefaults)
      : null;
    const enumItem = enumItems.get(String(typeValue));
    const relationTypeRow =
      relationTypeKey &&
      relations[relationTypeKey] &&
      typeof relations[relationTypeKey] === 'object'
        ? (relations[relationTypeKey] as Readonly<Record<string, unknown>>)
        : null;
    const referenceRow =
      typeFieldKey && relationshipForField(metadata, typeFieldKey)
        ? matchingReferenceRow(typeFieldKey, typeValue, options.referenceData)
        : relationTypeRow;
    const typeName = stringOrNull(
      (enumItem?.label === undefined
        ? null
        : resolveMetadataText(enumItem.label, options.language ?? 'EN')) ??
        referenceRow?.label ??
        referenceRow?.name ??
        (typeValue === null || typeValue === undefined ? null : typeValue),
    );
    const typeIcon = normalizeIcon(
      enumItem?.icon ??
        referenceRow?.__entryIcon ??
        referenceRow?.icon ??
        referenceRow?.__entityIcon,
    );
    return {
      name:
        stringOrNull(
          resolveSource(metadata, entry, nameSource, relations, 'name', scopeDefaults),
        ) ??
        stringOrNull(entry[metadata.primaryField]) ??
        fallbackTextFields
          .map((key) => entry[key])
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ??
        stringOrNull(entry['id']) ??
        '',
      typeValue,
      typeName,
      typeIcon,
      description: stringOrNull(
        resolveSource(metadata, entry, descriptionSource, relations, 'description', scopeDefaults),
      ),
      status: resolveSource(metadata, entry, statusSource, relations, 'status', scopeDefaults),
      icons: resolvedIcons(normalizeIcon(options.entityIcon) ?? entityIcon, typeIcon),
      photo: photoField ? (entry[photoField] ?? null) : null,
    };
  };
}

/** One-off callers retain the same semantics; reusable Fields keep a prepared resolver. */
export function resolveEntryRepresentation<T>(
  metadata: ManatOSObjectMetadata<T>,
  uiMetadata: SysBOUIMetadata | null | undefined,
  entry: Readonly<Record<string, unknown>>,
  options: EntryRepresentationResolutionOptions = {},
): ResolvedEntryRepresentation {
  return prepareEntryRepresentation(metadata, uiMetadata)(entry, options);
}

/**
 * Project canonical entry-representation metadata for browser/runtime consumers.
 * This is the single metadata-to-runtime projection used by both route renderers
 * and the global entity registry. Factual reference data remains caller-owned.
 */
export function entryRepresentationRuntime(
  metadata: ManatOSObjectMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata | null | undefined,
  referenceData: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  void metadataUI;
  const sourceFor = (source: NonNullable<typeof metadata.entry>['name'] | undefined) => {
    if (!source) return null;
    return { ...source };
  };

  return {
    image: metadata.entry?.image ? { ...metadata.entry.image } : null,
    name: sourceFor(entryNameSource(metadata)),
    type: sourceFor(
      metadata.entry?.type ?? (metadata.fieldDefinition.type ? { field: 'type' } : undefined),
    ),
    description: sourceFor(metadata.entry?.description),
    status: sourceFor(metadata.entry?.status),
    calculations: Object.fromEntries(
      Object.entries(metadata.fieldDefinition)
        .filter(([, field]) => Boolean(field.calculation?.expression))
        .map(([key, field]) => [key, { source: field.calculation!.expression }]),
    ),
    relationships: Object.fromEntries(
      Object.entries(metadata.relationships ?? {})
        .filter(([, relationship]) => relationship.fields.length === 1)
        .map(([key, relationship]) => [key, { field: relationship.fields[0] }]),
    ),
    referenceData,
    // Entity/type icon composition is automatic, independent of UI Entry overrides.
    icon: { mode: metadata.entry?.type ? 'composed' : 'entity' },
  };
}
