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

export interface SysBOUIFieldPresentationMetadata {
  /**
   * Read-only output presentation. `form-control` remains the default for
   * ordinary canonical fields; `summary` is useful for application-managed
   * state such as authentication information.
   */
  mode?: 'form-control' | 'summary';
  format?: SysBOUIValueFormat;
  emptyText?: string;
}

export interface SysBOUIFieldOverrideMetadata {
  order?: number;
  label?: string;
  visible?: boolean;
  editable?: boolean;

  /** Applied only when a new record has no value for this field. */
  createDefaultValue?: string | number | boolean | null;

  presentation?: SysBOUIFieldPresentationMetadata;
}

/**
 * One state in a calculated display field. The metadata selects the text,
 * semantic icon and tone from the current source value without introducing a
 * persisted property into the business object itself.
 */
export interface SysBOUIDerivedStateMetadata {
  equals: string | number | boolean | null;
  label: string;
  icon?: SysBOUIIconKey;
  tone?: SysBOUIStatusTone;
}

/**
 * Read-only, on-the-fly UI value derived from an existing API projection field.
 * This deliberately belongs to UI metadata rather than canonical BO metadata:
 * it is presentation state, not persisted business data.
 */
export interface SysBOUIDerivedFieldMetadata {
  key: string;
  label: string;
  icon?: SysBOUIIconKey;
  sourceField: string;
  format?: SysBOUIValueFormat;
  emptyText?: string;
  states?: readonly SysBOUIDerivedStateMetadata[];
}

export type SysBOUIEntryActionKind = 'delete';

export interface SysBOUIEntryActionMetadata {
  key: string;
  kind: SysBOUIEntryActionKind;
  visible: boolean;
  label: string;
  icon?: SysBOUIIconKey;
}

export interface SysBOUIRelatedCollectionFieldMetadata {
  key: string;
  label?: string;
  sourceField?: string;
  format?: SysBOUIValueFormat;
  icon?: SysBOUIIconKey;
  derived?: SysBOUIDerivedFieldMetadata;
}

export interface SysBOUIRelatedCollectionMetadata {
  key: string;
  label: string;
  icon?: SysBOUIIconKey;
  sourceKey: string;
  layout: 'panel-list';
  emptyText?: string;
  fields: readonly SysBOUIRelatedCollectionFieldMetadata[];
}

export interface SysBOUIRecordMetadata {
  tabs: readonly SysBOUIRecordTabMetadata[];
  fieldOverrides: Readonly<Record<string, SysBOUIFieldOverrideMetadata>>;

  /** Optional calculated/read-only fields referenced by tab.fields. */
  derivedFields?: Readonly<Record<string, SysBOUIDerivedFieldMetadata>>;

  /** Record-level commands. More action kinds can be added without changing the container shape. */
  entryActions?: readonly SysBOUIEntryActionMetadata[];

  /** Read-only related-record blocks referenced by tab.fields. */
  relatedCollections?: Readonly<Record<string, SysBOUIRelatedCollectionMetadata>>;
}

export interface SysBOUIMetadata {
  key: string;
  list: SysBOUIListMetadata;
  record: SysBOUIRecordMetadata;
}
