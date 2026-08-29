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

export type SysBOUIValueFormat = 'text' | 'datetime' | 'verification-source' | 'auth-provider';

export interface SysBOUIRecordTabMetadata {
  id: string;
  label: string;
  order: number;
  fields: readonly string[];
  icon?: SysBOUIIconKey;

  /** Normal editable form layout, or a compact label/value summary. */
  layout?: 'form' | 'summary';
}

export interface SysBOUIDerivedStateMetadata {
  equals: string | number | boolean | null;
  /** Optional UI-only icon/tone decoration for the already-calculated value. */
  icon?: SysBOUIIconKey;
  tone?: SysBOUIStatusTone;
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

  /**
   * Optional UI decoration selected from the evaluated field value. The value
   * itself remains canonical/entity-derived; these states only choose icon/tone.
   */
  states?: readonly SysBOUIDerivedStateMetadata[];
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
  order?: number;
  label?: string;
  visible?: boolean;

  /**
   * UI-only restriction. `editable: false` may make a canonically writable field
   * read-only in this view, but must never make canonical `readOnly: true` writable.
   * Dynamic UI/domain decisions should prefer evaluator-backed expressions when
   * introduced rather than accumulating mode-specific booleans.
   */
  editable?: boolean;

  /** Applied only when a new record has no value for this field. */
  createDefaultValue?: string | number | boolean | null;

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

export type SysBOUIEntryActionKind = 'delete';

export interface SysBOUIEntryActionMetadata {
  /** The parent Record key is the stable action identifier. */
  kind: SysBOUIEntryActionKind;
  visible: boolean;
  label: string;
  icon?: SysBOUIIconKey;
}

export interface SysBOUIRelatedCollectionFieldMetadata {
  /** Required because related fields are ordered in an array rather than a keyed Record. */
  key: string;
  label?: string;
  sourceField?: string;

  /**
   * Optional evaluator-backed row calculation. The related row is supplied as
   * the current evaluation context; ordinary CTX root paths remain available.
   */
  expression?: string;

  format?: SysBOUIValueFormat;
  icon?: SysBOUIIconKey;
  presentation?: SysBOUIFieldPresentationMetadata;
}

export interface SysBOUIRelatedCollectionMetadata {
  label: string;
  icon?: SysBOUIIconKey;
  /** Defaults to the parent relatedCollections Record key when omitted. */
  sourceKey?: string;
  layout: 'panel-list';
  emptyText?: string;
  fields: readonly SysBOUIRelatedCollectionFieldMetadata[];
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
