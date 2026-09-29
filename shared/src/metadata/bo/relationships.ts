import type {
  ManatOSRelationshipMetadata,
  ManatOSRelationshipNavigationCardinality,
  SysBOFieldMetadata,
} from './types.js';

interface RelationshipMetadataOwner {
  readonly key: string;
  readonly fieldDefinition: Record<string, SysBOFieldMetadata>;
  readonly relationships?: Readonly<Record<string, ManatOSRelationshipMetadata>>;
}

export interface ResolvedRelationshipField {
  readonly field: SysBOFieldMetadata;
  readonly relationshipKey: string;
  readonly relationship: ManatOSRelationshipMetadata;
  readonly fieldIndex: number;
  readonly referencedField: string;
}

/**
 * Resolve the canonical relationship endpoint for one source field.
 * Relationship declarations are authoritative; field metadata never has to
 * repeat target/cardinality/selection facts merely to make lookup convenient.
 */
export function relationshipForField(
  metadata: RelationshipMetadataOwner,
  fieldKey: string,
): ResolvedRelationshipField | undefined {
  const field = metadata.fieldDefinition[fieldKey];
  if (!field) return undefined;

  let resolved: ResolvedRelationshipField | undefined;
  for (const [relationshipKey, relationship] of Object.entries(metadata.relationships ?? {})) {
    const fieldIndex = relationship.fields.indexOf(fieldKey);
    if (fieldIndex < 0) continue;
    if (resolved) {
      throw new Error(
        `Field ${metadata.key}.${fieldKey} participates in more than one canonical relationship`,
      );
    }
    const referencedField = relationship.references.fields[fieldIndex];
    if (!referencedField) {
      throw new Error(
        `Relationship ${metadata.key}.${relationshipKey} does not map source field ${fieldKey}`,
      );
    }
    resolved = { field, relationshipKey, relationship, fieldIndex, referencedField };
  }
  return resolved;
}

export function isRelationshipField(
  metadata: RelationshipMetadataOwner,
  fieldKey: string,
): boolean {
  return relationshipForField(metadata, fieldKey) !== undefined;
}

/** Validate relationship structure once at metadata registration/test boundaries. */
export function validateRelationshipMetadata(metadata: RelationshipMetadataOwner): void {
  for (const [relationshipKey, relationship] of Object.entries(metadata.relationships ?? {})) {
    if (relationship.fields.length !== relationship.references.fields.length) {
      throw new Error(
        `Relationship ${metadata.key}.${relationshipKey} has mismatched source/target field counts`,
      );
    }
    for (const fieldKey of relationship.fields) {
      if (!metadata.fieldDefinition[fieldKey]) {
        throw new Error(
          `Relationship ${metadata.key}.${relationshipKey} references missing source field ${fieldKey}`,
        );
      }
      relationshipForField(metadata, fieldKey);
    }
  }
  for (const [fieldKey, field] of Object.entries(metadata.fieldDefinition)) {
    if (field.type !== 'reference' || field.inverseRelationship) continue;
    if (!relationshipForField(metadata, fieldKey)) {
      throw new Error(
        `Reference field ${metadata.key}.${fieldKey} must resolve exactly one canonical relationship`,
      );
    }
  }
}

export interface ResolvedRelationshipDefinition {
  readonly key: string;
  readonly sourceObjectKey: string;
  readonly targetObjectKey: string;
  readonly source: RelationshipMetadataOwner;
  readonly target: RelationshipMetadataOwner;
  readonly relationship: ManatOSRelationshipMetadata;
  readonly inverseCardinality: ManatOSRelationshipNavigationCardinality;
}

export type RelationshipMetadataRegistry = Readonly<Record<string, RelationshipMetadataOwner>>;

export function inverseRelationshipCardinality(
  cardinality: ManatOSRelationshipMetadata['cardinality'],
): ManatOSRelationshipNavigationCardinality {
  return cardinality === 'many-to-one' ? 'one-to-many' : 'one-to-one';
}

/**
 * Materialize the canonical relationship catalogue once from BO metadata.
 * The result is direction-aware but also carries the inverse cardinality so
 * callers never need to rediscover relationship topology by scanning fields.
 */
export function resolveRelationshipDefinitions(
  registry: RelationshipMetadataRegistry,
): readonly ResolvedRelationshipDefinition[] {
  const result: ResolvedRelationshipDefinition[] = [];
  for (const source of Object.values(registry)) {
    for (const [relationshipKey, relationship] of Object.entries(source.relationships ?? {})) {
      const target = registry[relationship.references.objectKey];
      if (!target) {
        throw new Error(
          `Relationship ${source.key}.${relationshipKey} targets unknown object ${relationship.references.objectKey}`,
        );
      }
      result.push({
        key: relationshipKey,
        sourceObjectKey: source.key,
        targetObjectKey: target.key,
        source,
        target,
        relationship,
        inverseCardinality: inverseRelationshipCardinality(relationship.cardinality),
      });
    }
  }
  for (const metadata of Object.values(registry)) {
    for (const [fieldKey, field] of Object.entries(metadata.fieldDefinition)) {
      if (field.type !== 'reference') continue;
      if (!relationshipBindingForField(result, metadata, fieldKey)) {
        throw new Error(
          `Reference field ${metadata.key}.${fieldKey} must resolve exactly one canonical relationship`,
        );
      }
    }
  }
  return result;
}

export function relationshipDefinition(
  definitions: readonly ResolvedRelationshipDefinition[],
  sourceObjectKey: string,
  relationshipKey: string,
): ResolvedRelationshipDefinition | undefined {
  return definitions.find(
    (definition) =>
      definition.sourceObjectKey === sourceObjectKey && definition.key === relationshipKey,
  );
}

/** Canonical inverse-navigation lookup: relationships whose target is this object. */
export function relationshipsReferencing(
  definitions: readonly ResolvedRelationshipDefinition[],
  targetObjectKey: string,
): readonly ResolvedRelationshipDefinition[] {
  return definitions.filter((definition) => definition.targetObjectKey === targetObjectKey);
}

export type RelationshipNavigationDirection = 'forward' | 'inverse';
export interface ResolvedFieldRelationshipBinding {
  readonly definition: ResolvedRelationshipDefinition;
  readonly direction: RelationshipNavigationDirection;
}

/** Resolve either a locally-owned relationship field or a declared inverse projection field. */
export function relationshipBindingForField(
  definitions: readonly ResolvedRelationshipDefinition[],
  metadata: RelationshipMetadataOwner,
  fieldKey: string,
): ResolvedFieldRelationshipBinding | undefined {
  const direct = relationshipForField(metadata, fieldKey);
  if (direct) {
    const definition = relationshipDefinition(definitions, metadata.key, direct.relationshipKey);
    return definition ? { definition, direction: 'forward' } : undefined;
  }
  const inverse = metadata.fieldDefinition[fieldKey]?.inverseRelationship;
  if (!inverse) return undefined;
  const definition = relationshipDefinition(definitions, inverse.objectKey, inverse.relationship);
  if (!definition || definition.targetObjectKey !== metadata.key) {
    throw new Error(`Field ${metadata.key}.${fieldKey} declares an invalid inverse relationship`);
  }
  return { definition, direction: 'inverse' };
}

export type RelationshipRecord = Readonly<Record<string, unknown>>;
export type RelationshipNavigationResult =
  RelationshipRecord | readonly RelationshipRecord[] | null;

function navigationCardinality(
  definition: ResolvedRelationshipDefinition,
  direction: RelationshipNavigationDirection,
): ManatOSRelationshipNavigationCardinality {
  return direction === 'forward'
    ? definition.relationship.cardinality
    : definition.inverseCardinality;
}

function isPluralCardinality(cardinality: ManatOSRelationshipNavigationCardinality): boolean {
  return cardinality === 'one-to-many';
}

function relationshipValues(
  record: RelationshipRecord,
  fields: readonly string[],
): readonly unknown[] | null {
  const values = fields.map((field) => record[field]);
  // A nullable/unset endpoint means "no relationship". It must never match a
  // target row whose corresponding key also happens to be null/undefined.
  return values.some((value) => value === null || value === undefined || value === '')
    ? null
    : values;
}

/** True when the selected endpoint has a complete canonical key. */
export function relationshipEndpointIsSet(
  definition: ResolvedRelationshipDefinition,
  direction: RelationshipNavigationDirection,
  record: RelationshipRecord,
): boolean {
  const fields =
    direction === 'forward'
      ? definition.relationship.fields
      : definition.relationship.references.fields;
  return relationshipValues(record, fields) !== null;
}

function matchesRelationshipValues(
  candidate: RelationshipRecord,
  candidateFields: readonly string[],
  values: readonly unknown[],
): boolean {
  return candidateFields.every((field, index) => Object.is(candidate[field], values[index]));
}

/**
 * Test one candidate against a canonical relationship endpoint without
 * materializing an intermediate navigation result. Storage runtimes can use
 * this for entry/key preserving scans while sharing exactly the same endpoint
 * mapping semantics as navigateRelationship().
 */
export function relationshipCandidateMatches(
  definition: ResolvedRelationshipDefinition,
  direction: RelationshipNavigationDirection,
  record: RelationshipRecord,
  candidate: RelationshipRecord,
): boolean {
  const forward = direction === 'forward';
  const recordFields = forward
    ? definition.relationship.fields
    : definition.relationship.references.fields;
  const candidateFields = forward
    ? definition.relationship.references.fields
    : definition.relationship.fields;
  const values = relationshipValues(record, recordFields);
  return values ? matchesRelationshipValues(candidate, candidateFields, values) : false;
}

/**
 * Resolve one canonical relationship navigation against already-available rows.
 *
 * This is deliberately storage/UI agnostic: callers own record acquisition,
 * while this function owns endpoint mapping and cardinality semantics. Both
 * forward and inverse navigation therefore execute from the same 18A metadata
 * instead of rediscovering foreign-key topology in individual runtimes.
 */
export function navigateRelationship(
  definition: ResolvedRelationshipDefinition,
  direction: RelationshipNavigationDirection,
  record: RelationshipRecord,
  candidates: readonly RelationshipRecord[],
): RelationshipNavigationResult {
  const forward = direction === 'forward';
  const recordFields = forward
    ? definition.relationship.fields
    : definition.relationship.references.fields;
  const values = relationshipValues(record, recordFields);
  const cardinality = navigationCardinality(definition, direction);

  if (!values) return isPluralCardinality(cardinality) ? [] : null;

  const matches = candidates.filter((candidate) =>
    relationshipCandidateMatches(definition, direction, record, candidate),
  );
  if (isPluralCardinality(cardinality)) return matches;
  if (matches.length > 1) {
    throw new Error(
      `Relationship ${definition.sourceObjectKey}.${definition.key} violates ${cardinality} cardinality during ${direction} navigation`,
    );
  }
  return matches[0] ?? null;
}
