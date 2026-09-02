/**
 * Supported canonical business-object field types.
 *
 * These types describe the business object itself and are therefore
 * independent from any particular UI implementation.
 */
export type SysBOFieldType =
  | 'guid'
  | 'string'
  | 'email'
  | 'telephone'
  | 'boolean'
  | 'number'
  | 'date'
  | 'datetime'
  | 'duration'
  | 'version'
  | 'enum'
  | 'reference';

/**
 * Metadata describing one field/property of a SysBO.
 *
 * The field definitions themselves are stored in a keyed object, where
 * the key is normally the corresponding property name:
 *
 *   fieldDefinition.name
 *   fieldDefinition.email
 *   fieldDefinition.principalType
 *
 * The separate `key` property is intentionally retained so that an
 * individual field definition still knows its own identity when it is
 * passed around independently of the containing object.
 */
export interface SysBOEnumItemMetadata {
  /** Stored enum value submitted to the domain/API. */
  value: string;

  /** Optional human-readable caption; value is the fallback. */
  label?: string;

  /** Optional semantic icon key consumed by capable UI renderers. */
  icon?: string;

  /** Optional renderer-neutral semantic tone for the enum item's visual cue. */
  tone?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';

  /** Optional relative tone strength; renderers decide the concrete palette. */
  toneStrength?: 'soft' | 'normal' | 'strong';

  /**
   * Enum-item traits are deliberately open-ended and evaluator-readable.
   * Domain metadata can therefore attach facts such as `isContainer` without
   * teaching the generic renderer about a particular enum or entity.
   */
  readonly [trait: string]: unknown;
}

export interface SysBOFieldCalculationMetadata {
  /**
   * Canonical expression used to calculate this persisted/editable field.
   * Unlike derivedFields, the target remains a normal field that a user may
   * edit directly; `triggeredBy` determines which authoritative field changes
   * are allowed to recalculate it.
   */
  expression: string;

  /**
   * Field keys whose direct/user-authoritative changes may drive this
   * calculation. Causal CTX provenance is preserved through dependent writes,
   * so a calculated update does not become a new authoritative trigger.
   */
  triggeredBy: readonly string[];
}

export interface SysBOFieldMetadata {
  key: string;
  label: string;
  type: SysBOFieldType;
  order: number;

  required?: boolean;
  nullable?: boolean;

  generated?: boolean;
  readOnly?: boolean;

  /**
   * Persisted field maintained by application/domain logic rather than by a
   * normal CRUD caller. Unlike generated fields, the value is stored and can
   * therefore be filtered, indexed and audited by future storage providers.
   */
  applicationManaged?: boolean;

  unique?: boolean;
  sensitive?: boolean;

  minLength?: number;
  maxLength?: number;

  enumValues?: readonly string[];

  /** Optional rich metadata for enum values (labels, icons and declarative traits). */
  enumItems?: readonly SysBOEnumItemMetadata[];

  /**
   * Optional presentation catalogue for discrete values that are not themselves
   * canonical enums. Unlike `enumItems`, this does not constrain valid stored
   * values; it only gives framework-neutral renderers a label/icon/tone when a
   * matching value is known. This is useful for externally sourced categorical
   * values while keeping entity-specific formatting out of generic renderers.
   */
  optionItems?: readonly SysBOEnumItemMetadata[];

  referenceBOKey?: string;

  /** Calendar duration units exposed by a duration field. Defaults to all units. */
  durationUnits?: readonly ('years' | 'months' | 'days')[];

  /** Canonical version grammar. `semver` currently means numeric major.minor.patch. */
  versionFormat?: 'semver';

  /**
   * Optional canonical normalization formula for an editable field. The UI and
   * API evaluate this through the normal expression engine; field components
   * never name or implement the normalizer themselves. `value` is the current
   * candidate field value in the normalization scope.
   */
  normalize?: Readonly<{ expression: string }>;

  /** Optional CTX/evaluator-driven calculation for a normal editable field. */
  calculation?: Readonly<SysBOFieldCalculationMetadata>;
}


export type ManatOSRelationshipCardinality =
  | 'one-to-one'
  | 'many-to-one'
  | 'one-to-many'
  | 'many-to-many';

export type ManatOSRelationshipDeleteAction =
  | 'restrict'
  | 'cascade'
  | 'set-null'
  | 'unlink'
  | 'retain';

export type ManatOSRelationshipConfirmationPolicy =
  | 'silent'
  | 'confirm'
  | 'inherit';

export interface ManatOSRelationshipDeletePolicy {
  /** Referential-integrity consequence when the referenced record is deleted. */
  action: ManatOSRelationshipDeleteAction;

  /** Interaction policy is independent from the integrity action itself. */
  confirmation?: ManatOSRelationshipConfirmationPolicy;
}

export interface ManatOSRelationshipMetadata {
  /** FK/source fields stored on this object; arrays also support future composite keys. */
  fields: readonly string[];

  /** Canonical target object and referenced fields. */
  references: {
    objectKey: string;
    fields: readonly string[];
  };

  /** Physical/navigational cardinality. N:N normally uses an explicit junction object. */
  cardinality: ManatOSRelationshipCardinality;

  /** Optional semantic N:N navigation backed by a canonical junction object. */
  through?: {
    objectKey: string;
    sourceRelationship: string;
    targetRelationship: string;
  };

  /** Keyed policy collection leaves room for future relationship policies. */
  policies?: Readonly<{
    delete?: ManatOSRelationshipDeletePolicy;
  }>;
}

/**
 * UI-neutral, hard-coded definition of a system business object.
 *
 * This metadata defines WHAT the business object is.
 *
 * It is intentionally separate from:
 *
 * 1. actual BO data;
 * 2. web/EJS UI metadata;
 * 3. possible future mobile UI metadata.
 *
 * `key` is the stable hard-coded identifier of the BO definition, for example:
 *
 *   sys-users
 *   sys-principals
 *   sys-applications
 *   sys-licenses
 *
 * Actual BO records have completely separate generated GUID `id` values.
 */
/** Canonical, non-persisted value derived from an entity record/context. */
export interface SysBODerivedFieldMetadata {
  /** The parent Record key is the canonical derived-field name. */
  label: string;
  expression: string;

  /**
   * When true, the derived value is materialized into persisted entity data.
   * The default is false, preserving the normal calculated-only behavior.
   * Persistence infrastructure recalculates these values before commit so the
   * same rule applies to UI, API and automatic/background creation paths.
   */
  persisted?: boolean;
}

export interface ManatOSObjectMetadata<T> {
  /** Stable metadata identity; may describe a first-class SysBO or a related value object. */
  key: string;
  name: string;
  pluralName: string;

  /** Main human/business identifying property of one object instance. */
  primaryField: keyof T & string;

  /** Keyed canonical persisted/runtime field definitions. */
  fieldDefinition: Record<string, SysBOFieldMetadata>;

  /** Reusable object/domain calculations, independent from any particular UI. */
  derivedFields?: Readonly<Record<string, SysBODerivedFieldMetadata>>;

  /**
   * Keyed canonical relationships registered on the referencing side. `fields`
   * live on this object and point at `references.objectKey/references.fields`.
   * Reverse navigation/delete impacts can therefore be derived centrally.
   */
  relationships?: Readonly<Record<string, ManatOSRelationshipMetadata>>;
}

/**
 * Canonical exposure intent for a first-class SysBO.
 *
 * `standard` (the implicit default) means clients may offer the object as an
 * independently managed resource when suitable UI metadata exists. `internal`
 * marks a supporting/canonical entity that participates in storage, API and
 * relationships but should not acquire standalone administration UI merely
 * because it is a SysBO. It can still be edited through another object's
 * metadata-driven component.
 */
export type SysBOExposure = 'standard' | 'internal';

/** Canonical metadata for a first-class SysBO exposed through generic SysBO CRUD. */
export interface SysBOMetadata<T> extends ManatOSObjectMetadata<T> {
  /** Omitted means `standard`, preserving all existing entity behavior. */
  exposure?: SysBOExposure;
}

/**
 * Canonical metadata for a related/domain object that is not independently
 * exposed as a generic SysBO CRUD endpoint. It still deserves the same field
 * and derived-value semantics so renderers, reports and expressions can reuse it.
 */
export type ManatOSValueObjectMetadata<T> = ManatOSObjectMetadata<T>;
