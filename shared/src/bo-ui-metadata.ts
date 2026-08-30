/**
 * Framework-neutral UI metadata contracts for SysBO presentation.
 *
 * These contracts describe WHAT a UI should expose, not HOW a particular
 * renderer (EJS, Angular, React, mobile, etc.) should implement it.
 */
export interface SysBOUIAddActionMetadata {
  visible: boolean;
  label: string;
}

export interface SysBOUIListMetadata {
  visibleFields: readonly string[];
  filterFields: readonly string[];
  sortableFields: readonly string[];
  addAction: SysBOUIAddActionMetadata;
}

/**
 * Semantic icon key. Renderers map these keys to their native icon system
 * (Bootstrap Icons in the current EJS implementation).
 */
export type SysBOUIIconKey = string;

export type SysBOUIStatusTone =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

export type SysBOUIValueFormat = 'text' | 'datetime' | 'datetime-elapsed' | 'verification-source' | 'auth-provider';

/**
 * A UI scalar may be static or evaluated dynamically against the caller's
 * current CTX scope. The evaluator knows nothing about tone/icon/visibility;
 * it simply returns the scalar requested by presentation metadata.
 */
export type SysBOUIDynamicValue<T> = T | Readonly<{ expression: string }>;

export interface SysBOUIRecordTabMetadata {
  id: string;
  label: string;
  order: number;
  fields: readonly string[];
  icon?: SysBOUIIconKey;

  /**
   * Static or evaluator-backed visibility. The expression is evaluated against
   * the active entry page CTX, so it can depend on page mode, authenticated
   * user, record fields, client features, or any other reachable CTX value.
   */
  visible?: SysBOUIDynamicValue<boolean>;

  /** Normal editable form layout, or a compact label/value summary. */
  layout?: 'form' | 'summary';
}

export interface SysBOUIFieldPresentationMetadata {
  /**
   * Output presentation only. It must never redefine entity/domain semantics.
   * `summary` is useful for compact application-managed state such as
   * authentication information.
   */
  mode?: 'form-control' | 'summary';
  format?: SysBOUIValueFormat;
  emptyText?: string;

  /** Static or evaluator-backed visual decoration. */
  icon?: SysBOUIDynamicValue<SysBOUIIconKey>;
  tone?: SysBOUIDynamicValue<SysBOUIStatusTone>;
}

export interface SysBOUIFieldOverrideMetadata {
  /**
   * Presentation overrides for a field/derived-field when this particular UI
   * intentionally differs from the canonical metadata. Do not repeat canonical
   * properties merely for emphasis: omission means "use the canonical rule".
   *
   * A field that is not referenced by any tab is already absent from this entry
   * UI; `visible: false` is therefore unnecessary in that case. `visible` remains
   * useful for a field that is otherwise included but conditionally suppressed.
   */
  /** Contextual caption for this UI; canonical field label remains unchanged. */
  label?: string;

  /**
   * Suppress a field that is already part of the active tab/layout. Omitting a
   * field from every tab already hides it, so visible:false is not needed then.
   * May be evaluator-backed when visibility depends on live CTX state.
   */
  visible?: SysBOUIDynamicValue<boolean>;

  /**
   * UI-only restriction. `editable: false` may make a canonically writable field
   * read-only in this view, but must never make canonical `readOnly: true` writable.
   * Dynamic UI/domain decisions should prefer evaluator-backed expressions when
   * introduced rather than accumulating mode-specific booleans.
   */
  editable?: SysBOUIDynamicValue<boolean>;

  /**
   * UI create-mode seed used only when the new record has no field value.
   * May be evaluator-backed for context-sensitive defaults; it is not a domain
   * default unless the canonical entity metadata/API enforces the same rule.
   */
  createDefaultValue?: SysBOUIDynamicValue<string | number | boolean | null>;

  /** Formatting and visual decoration only; never changes entity semantics. */
  presentation?: SysBOUIFieldPresentationMetadata;
}

/**
 * UI-only calculated field declaration. Canonical/reusable calculations belong
 * in SysBOMetadata.derivedFields; this container exists so a presentation can
 * add calculations that are meaningful only for that UI/context.
 */
export interface SysBOUIDerivedFieldMetadata {
  label: string;
  icon?: SysBOUIIconKey;

  /** Context-agnostic ManatOS expression, parsed when its CTX field is declared. */
  expression?: string;

  format?: SysBOUIValueFormat;
  emptyText?: string;
}

export type SysBOUIEntryActionKind = 'delete' | 'save' | 'command';

export interface SysBOUIEntryActionMetadata {
  /** The parent Record key is the stable action identifier. */
  kind: SysBOUIEntryActionKind;

  /** Stable ordering inside the action region; parent Record key remains identity. */
  order?: number;

  /** Static or evaluator-backed visibility against the active entry page CTX. */
  visible: SysBOUIDynamicValue<boolean>;

  label: string;
  icon?: SysBOUIIconKey;

  /** UI-neutral visual intent mapped by the concrete renderer. */
  tone?: SysBOUIStatusTone;
  emphasis?: 'solid' | 'outline';

  /**
   * Route command segment for kind='command'. The current EJS renderer posts
   * to /bo/<entity>/<record-id>/<command>; the command endpoint remains the
   * authoritative authorization/business boundary.
   */
  command?: string;
}

export interface SysBOUIRelatedCollectionFieldMetadata {
  /** Optional contextual label; canonical related-entity metadata is the fallback. */
  label?: string;

  /**
   * Optional source-property alias. When omitted the containing keyed field name
   * is used (`sourceField ?? fieldKey`).
   */
  sourceField?: string;

  /**
   * Optional UI-only calculation. Prefer a canonical related-entity derived
   * field when the value is reusable outside this presentation.
   */
  expression?: string;

  format?: SysBOUIValueFormat;
  icon?: SysBOUIIconKey;
  presentation?: SysBOUIFieldPresentationMetadata;
}

export interface SysBOUIRelatedCollectionMetadata {
  label: string;
  icon?: SysBOUIIconKey;

  /**
   * Canonical related/value-object metadata key. This identifies what each row
   * IS (for example `external-identities`) independently from where the owning
   * page stores the row array.
   */
  entityKey: string;

  /**
   * CTX/page property containing the row array. When omitted the containing
   * relatedCollections key is used (`sourceKey ?? collectionKey`).
   */
  sourceKey?: string;

  layout: 'panel-list';
  emptyText?: string;

  /**
   * Keyed presentation fields. The Record key is both the UI field identity and
   * the default row source property; no redundant child `key` is required.
   */
  fields: Readonly<Record<string, SysBOUIRelatedCollectionFieldMetadata>>;
}

export interface SysBOUIRecordMetadata {
  tabs: readonly SysBOUIRecordTabMetadata[];
  fieldOverrides: Readonly<Record<string, SysBOUIFieldOverrideMetadata>>;

  /** Optional calculated/read-only fields referenced by tab.fields. */
  derivedFields?: Readonly<Record<string, SysBOUIDerivedFieldMetadata>>;

  /**
   * Keyed record-level commands. The Record key is the action identifier, so
   * action metadata does not repeat a redundant `key` property. New action
   * kinds can be added without changing the container shape.
   */
  entryActions?: Readonly<Record<string, SysBOUIEntryActionMetadata>>;

  /** Read-only related-record blocks referenced by tab.fields. */
  relatedCollections?: Readonly<Record<string, SysBOUIRelatedCollectionMetadata>>;
}

export interface SysBOUIMetadata {
  key: string;
  list: SysBOUIListMetadata;
  record: SysBOUIRecordMetadata;
}
