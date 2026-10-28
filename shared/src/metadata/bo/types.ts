import type { MultilingualLiteral } from '../../multilingual/metadata/index.js';
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
  | 'reference'
  | 'picture'
  | 'pictures'
  | 'richText';

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
  label?: string | MultilingualLiteral;

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
   * Canonical expression that resolves this field's value.
   *
   * Calculation is a value-source concern, not a presentation type. The field's
   * canonical `type` continues to select its field-component regardless of
   * whether the current value is stored, calculated, defaulted or managed.
   */
  expression: string;

  /**
   * Materialize the calculated value into persisted entity data. The API
   * recalculates these values before commit, including background/API writes.
   */
  persisted?: boolean;
}

export type SysBOCreateDefaultValue =
  string | number | boolean | null | Readonly<{ expression: string }>;

export interface SysBOFieldMetadata {
  key: string;
  label: string;
  type: SysBOFieldType;
  order: number;

  required?: boolean;
  nullable?: boolean;

  generated?: boolean;
  readOnly?: boolean;

  /** False for runtime/derived fields that participate in entity semantics but have no local storage column. */
  persistent?: boolean;

  /** Writable/readable projection of the inverse endpoint of one canonical relationship. */
  inverseRelationship?: Readonly<{ objectKey: string; relationship: string }>;

  /** Canonical initial value for newly created records. */
  createDefaultValue?: SysBOCreateDefaultValue;

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

  /** Canonical subsystem-owned enum key. */
  enum?: string;

  /** @deprecated Inline enum catalogues remain only for legacy/non-migrated fields. */
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

export type ManatOSRelationshipSelectionMetadata = Readonly<{
  filterExpression?: string;

  /**
   * Generic metadata-trait constraint on a target enum field. A candidate is
   * retained only when its enum item exposes the requested trait as true.
   * This keeps relationship policy attached to canonical enum metadata rather
   * than duplicating concrete enum values in UI code.
   */
  filterEnumItemTrait?: Readonly<{ field: string; trait: string }>;

  /**
   * When true, the current source record is projected as unavailable when the
   * reference targets the same entity type. This is a generic relationship
   * constraint used by every reference presenter; callers must not reimplement
   * self-reference checks in browser code.
   */
  excludeCurrent?: boolean;

  uniqueThrough?: Readonly<{ objectKey: string; field: string }>;

  /**
   * Optional semantic context used when a reference-field caller creates a
   * related entry. Source values are projected from the calling entry into
   * target create defaults; target UI overrides are then resolved by the same
   * effective-entry override layer used by every hosted entry surface.
   */
  createRelated?: Readonly<{
    defaults?: Readonly<Record<string, Readonly<{ sourceField: string }>>>;
    fixedValues?: Readonly<Record<string, Readonly<{ sourceField: string }>>>;
    uiOverrides?: Readonly<
      Record<
        string,
        Readonly<{
          editable?: boolean;
          visible?: boolean;
          label?: string;
          allowedValues?: readonly string[];
          allowedEnumItemTrait?: string;
        }>
      >
    >;
  }>;
}>;

/** Cardinality authored on the object that physically owns the FK/source fields. */
export type ManatOSRelationshipCardinality = 'one-to-one' | 'many-to-one';

/** Cardinality exposed while navigating either the authored or inverse direction. */
export type ManatOSRelationshipNavigationCardinality =
  ManatOSRelationshipCardinality | 'one-to-many';

export type ManatOSRelationshipDeleteAction =
  'restrict' | 'cascade' | 'set-null' | 'unlink' | 'retain';

export type ManatOSRelationshipConfirmationPolicy = 'silent' | 'confirm' | 'inherit';

export interface ManatOSRelationshipDeletePolicy {
  /** Referential-integrity consequence when the referenced record is deleted. */
  action: ManatOSRelationshipDeleteAction;

  /** Interaction policy is independent from the integrity action itself. */
  confirmation?: ManatOSRelationshipConfirmationPolicy;
}

export interface ManatOSRelationshipMetadata {
  /** Additional subsystem dependencies beyond the declaring object's own subsystem. */
  requiredSubsystems?: readonly string[];

  /** FK/source fields stored on this object; arrays also support future composite keys. */
  fields: readonly string[];

  /** Canonical target object and referenced fields. */
  references: {
    objectKey: string;
    fields: readonly string[];
  };

  /**
   * Cardinality from the FK-owning/source side. Inverse one-to-many navigation
   * is derived by the relationship resolver rather than authored redundantly.
   * N:N is represented through an explicit junction/association object.
   */
  cardinality: ManatOSRelationshipCardinality;

  /**
   * Optional canonical applicability predicate evaluated against the relationship-owning row.
   * Inverse selectors use the same predicate against source-row candidates.
   */
  sourceFilterExpression?: string;

  /** Candidate selection/create-related semantics belong to the relationship. */
  selection?: ManatOSRelationshipSelectionMetadata;

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
/**
 * Canonical source used to describe how one entity entry is represented.
 *
 * `field` is a direct canonical field reference. `expression` uses the
 * canonical ManatOS expression evaluator and is preferred whenever the value
 * is calculated from multiple fields or other calculated values.
 */
export type ManatOSEntryValueSourceMetadata =
  Readonly<{ field: string; expression?: never }> | Readonly<{ expression: string; field?: never }>;

/**
 * Canonical, UI-neutral semantics for representing one entity entry.
 *
 * `name` is the human-facing entry identity used by lists, breadcrumbs,
 * references and visualizations. `type` is an optional semantic classifier.
 * Both may reference canonical calculated fields; evaluator dependency ordering
 * therefore remains identical to ordinary metadata calculations.
 */
export interface ManatOSEntryMetadata {
  /** Explicit picture used by canonical Entry presentation; never infer from field names. */
  image?: Readonly<{ field: string }>;
  name?: ManatOSEntryValueSourceMetadata;
  type?: ManatOSEntryValueSourceMetadata;
  description?: ManatOSEntryValueSourceMetadata;
  status?: ManatOSEntryValueSourceMetadata;
}

export interface ManatOSObjectMetadata<T> {
  /** Owning subsystem. Runtime availability is derived from subsystem selection. */
  subsystem: string;

  /** Stable secondary metadata/storage/API key (for example `sys-users`). */
  key: string;
  /** Canonical symbolic entity name used as the ctx.entities property key. */
  name: string;
  /** Human-facing singular label; presentation only, never entity identity. */
  label: string;
  /** Optional language-specific grammatical forms for contextual captions. */
  labelForms?: Readonly<{ genitive?: string; accusative?: string }>;
  /** Human-facing plural label; presentation only, never entity identity. */
  pluralLabel: string;

  /** Main human/business identifying property of one object instance. */
  primaryField: keyof T & string;

  /** Optional canonical semantics for representing one object instance. */
  entry?: Readonly<ManatOSEntryMetadata>;

  /** Keyed canonical persisted/runtime field definitions. */
  fieldDefinition: Record<string, SysBOFieldMetadata>;

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
 * because it is first-class. It can still be edited through another object's
 * metadata-driven component.
 */
export type SysBOExposure = 'standard' | 'internal';

/** Canonical metadata for a systemic first-class entity exposed through generic SysBO CRUD. */
export interface SysBOMetadata<T> extends ManatOSObjectMetadata<T> {
  /** Omitted means `standard`, preserving all existing entity behavior. */
  exposure?: SysBOExposure;
}

/**
 * Canonical metadata for a related/domain object that is not independently
 * exposed as a generic SysBO CRUD endpoint. It still deserves the same field
 * and calculated-value semantics so renderers, reports and expressions can reuse it.
 */
export type ManatOSValueObjectMetadata<T> = ManatOSObjectMetadata<T>;
