import type { ManatOSDynamicValue } from '../dynamic-value.js';

/**
 * Framework-neutral UI metadata contracts for SysBO presentation.
 *
 * These contracts describe WHAT a UI should expose, not HOW a particular
 * renderer (EJS, Angular, React, mobile, etc.) should implement it.
 */
export interface SysBOUIAddActionMetadata {
  visible: SysBOUIDynamicValue<boolean>;

  /** Static or evaluator-backed enabled state. Omitted means enabled. */
  enabled?: SysBOUIDynamicValue<boolean>;

  label: string;

  /** Optional generic constraint: disable creation when every value of this enum field already exists. */
  disableWhenAllEnumValuesExistForField?: string;
  disabledReason?: SysBOUIDynamicValue<string | null>;
}

export type SysBOUIListRowActionKind = 'navigate' | 'open-entry';

export interface SysBOUIListRowActionMetadata {
  kind: SysBOUIListRowActionKind;
  order?: number;
  visible?: boolean;
  /** Optional row-edge placement; defaults to end. */
  placement?: 'start' | 'end';
  label: string;
  icon?: SysBOUIIconKey;
  tone?: SysBOUIStatusTone;
  emphasis?: 'solid' | 'outline';
  title?: string;
  /** Render only the icon while retaining label/title for accessibility. */
  iconOnly?: boolean;
  /** Named entity ui-view requested when kind is `open-entry`. */
  uiView?: string;
  /** Entry interaction mode requested when kind is `open-entry`. */
  mode?: 'view' | 'edit';

  /**
   * Renderer-neutral navigation target. `{id}` is replaced with the current
   * row identifier by the concrete renderer.
   */
  href: string;
}

/**
 * List-level action rendered beside the ordinary Add action.
 *
 * Unlike row actions, these commands are not tied to one result row and may
 * use evaluator-backed visibility. This is the reusable hook for workflows
 * such as opening a hierarchy/organization workspace without teaching the
 * generic list renderer about a particular entity.
 */
export interface SysBOUIListPageActionMetadata {
  kind: SysBOUIListRowActionKind;
  order?: number;
  visible?: SysBOUIDynamicValue<boolean>;
  label: string;
  icon?: SysBOUIIconKey;
  tone?: SysBOUIStatusTone;
  emphasis?: 'solid' | 'outline';
  title?: string;
  href: string;
}

export interface SysBOUIListNoticeMetadata {
  tone: SysBOUIStatusTone;
  icon?: SysBOUIIconKey;
  title?: string;
  text: string;
}

export interface SysBOUIListMetadata {
  /** Human-facing keyed list-view label. */
  label?: string;
  visibleFields: readonly string[];
  filterFields: readonly string[];
  sortableFields: readonly string[];
  addAction: SysBOUIAddActionMetadata;

  /** Optional metadata-declared informational banner below the entity title. */
  notice?: SysBOUIListNoticeMetadata;

  /**
   * Optional metadata-driven row commands. The Record key is stable action
   * identity; renderers must not infer entity-specific row behavior.
   */
  rowActions?: Readonly<Record<string, SysBOUIListRowActionMetadata>>;

  /**
   * Optional collection/workspace commands shown at list level. Their
   * visibility is resolved against the list CTX, so future customer-defined
   * hierarchical entities can expose the same workflows declaratively.
   */
  pageActions?: Readonly<Record<string, SysBOUIListPageActionMetadata>>;
}

/**
 * Entity-list presentation uses the same common + keyed-view composition model
 * as entry uiViews. Common metadata is the inheritance source; every keyed view
 * is independently resolvable and may override any list presentation property.
 */
export type SysBOUIListViewContribution = Readonly<Partial<SysBOUIListMetadata>>;

export interface SysBOUIListViewsMetadata {
  common: SysBOUIListMetadata;
  views: Readonly<
    { main: SysBOUIListViewContribution } & Record<string, SysBOUIListViewContribution>
  >;
}

/**
 * Semantic icon key. Renderers map these keys to their native icon system
 * (Bootstrap Icons in the current EJS implementation).
 */
export type SysBOUIIconKey = string;

export type SysBOUIStatusTone = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';

export type SysBOUIValueFormat = 'text' | 'name' | 'entry' | 'datetime' | 'datetime-elapsed';

/**
 * A UI scalar may be static or evaluated dynamically against the caller's
 * current CTX scope. The evaluator knows nothing about tone/icon/visibility;
 * it simply returns the scalar requested by presentation metadata.
 */
export type SysBOUIDynamicValue<T> = ManatOSDynamicValue<T>;

/**
 * Renderer-neutral reusable UI component declaration.
 *
 * `bindings` supplies live/static values from the active CTX scope while
 * `options` configures presentation that does not itself need evaluation.
 * The component key remains semantic and reusable; it must not encode the
 * owning entity name.
 */
export type SysBOUIOptionValue =
  | string
  | number
  | boolean
  | null
  | readonly SysBOUIOptionValue[]
  | Readonly<{ [key: string]: SysBOUIOptionValue }>;

export interface SysBOUIComponentMetadata {
  key: string;
  readOnly?: boolean;
  /**
   * Renderer-neutral JSON-like component options. Nested arrays/objects allow
   * reusable editors to declare structured items (for example a country code +
   * telephone number) without creating entity-specific renderer branches.
   */
  options?: Readonly<Record<string, SysBOUIOptionValue>>;
  bindings?: Readonly<Record<string, SysBOUIDynamicValue<string | number | boolean | null>>>;
}

export type SysBOUIFieldRepresentation =
  'default' | 'summary' | 'portrait' | 'entry-link' | 'badge' | 'period';

export type SysBOUITabContentMetadata =
  | Readonly<{
      kind: 'field';
      field: string;
      span?: SysBOUIDynamicValue<number>;
      /** Semantic representation requested by this view; renderers choose the implementation. */
      representation?: SysBOUIFieldRepresentation;
      /** Optional semantic label override for this presentation occurrence. */
      label?: string;
      /** Additional canonical fields consumed by a composite field representation. */
      relatedFields?: readonly string[];
    }>
  | Readonly<{
      /** Force subsequent content onto the next grid row without reserving width. */
      kind: 'break';
    }>
  | Readonly<{
      /** Renderer-neutral empty grid space used only for form layout/alignment. */
      kind: 'spacer';
      span?: SysBOUIDynamicValue<number>;
    }>
  | Readonly<{
      /** Vertical details-layout column. Its field membership remains recursively discoverable. */
      kind: 'column';
      content: readonly SysBOUITabContentMetadata[];
      /** Optional 12-grid override; when omitted the renderer derives column width from its content. */
      span?: SysBOUIDynamicValue<number>;
    }>
  | Readonly<{
      /** Horizontal structural group; children render in declaration order with standard spacing. */
      kind: 'inline';
      content: readonly SysBOUITabContentMetadata[];
    }>
  | Readonly<{
      /** Reference an entry action declared by the owning record metadata. */
      kind: 'action';
      action: string;
    }>
  | Readonly<{
      /** Render one related collection declared by the owning record metadata. */
      kind: 'collection';
      collection: string;
    }>
  | Readonly<{
      kind: 'component';
      component: Readonly<SysBOUIComponentMetadata>;
      span?: SysBOUIDynamicValue<number>;
    }>;

export type SysBOUINavigationTrackPath = 'activeTabId' | `activeInternalTabIds.${string}`;

export interface SysBOUINavigationTrackMetadata {
  /**
   * Relative path below the active page/popup `state.navigation` branch.
   * Tracking is observational only: selecting the UI control updates CTX;
   * changing CTX never commands the UI to navigate.
   */
  statePath: SysBOUINavigationTrackPath;
}

export interface SysBOUIRecordTabMetadata {
  id: string;
  label: string;
  order: number;

  /**
   * Ordered tab content. Components are renderer-neutral declarations: the UI
   * maps their stable keys to concrete implementations without entity checks.
   */
  content?: readonly SysBOUITabContentMetadata[];

  icon?: SysBOUIIconKey;

  /** Explicit informational/read-only tab treatment for component/form tabs. */
  readOnly?: boolean;

  /**
   * Optional navigation-observer declaration. Renderers expose it to the shared
   * navigation tracker; the tracker records the selected tab under the active
   * surface/page state.navigation branch.
   */
  navigationTrack?: Readonly<SysBOUINavigationTrackMetadata>;

  /**
   * Static or evaluator-backed visibility. The expression is evaluated against
   * the active entry page CTX, so it can depend on page mode, authenticated
   * user, record fields, client features, or any other reachable CTX value.
   */
  visible?: SysBOUIDynamicValue<boolean>;

  /**
   * Structural tab layout. `form` is row-major 12-grid flow; `details` is
   * column-major flow whose columns stack their content vertically. `summary`,
   * `component`, and `debug-calculations` remain specialized/systemic layouts
   * during the current migration.
   */
  layout?: 'form' | 'details' | 'summary' | 'component' | 'debug-calculations';

  /** Default semantic representation for fields in this tab; field content may override it. */
  representation?: SysBOUIFieldRepresentation;

  /**
   * Reusable metadata-driven component declaration. Concrete renderers map the
   * key to their component implementation; options remain entity/field agnostic.
   */
  component?: Readonly<SysBOUIComponentMetadata>;
}

export type SysBOUIPictureCropMode = 'proportional' | 'free';

export interface SysBOUIPictureEditorMetadata {
  /** Maximum local source-image size accepted by the editor before cropping. */
  maxSourceBytes?: number;

  /** Aspect ratio used by proportional cropping (width / height). */
  cropAspectRatio?: number;

  /** Crop modes exposed by the reusable editor. First entry is the default. */
  cropModes?: readonly SysBOUIPictureCropMode[];

  /** Longest output edge in pixels after cropping/resampling. */
  outputSize?: number;

  /** Encoded output format produced by the client-side editor. */
  outputContentType?: 'image/jpeg' | 'image/png' | 'image/webp';

  /** Lossy encoder quality in the 0..1 range when applicable. */
  outputQuality?: number;
}

export type SysBOUIRichTextMode = 'visual' | 'markdown' | 'preview';

export interface SysBOUIRichTextHeightMetadata {
  /** Initial shared editor height, in CSS pixels, for a newly opened surface. */
  initial?: number;

  /** Lower resize bound, in CSS pixels. */
  min?: number;

  /** Optional upper resize bound, in CSS pixels. */
  max?: number;

  /** Whether the user may resize the shared rich-text surface vertically. */
  resizable?: boolean;
}

export interface SysBOUIRichTextPresentationMetadata {
  /** Canonical persisted rich-text media type. */
  contentType: 'text/markdown' | 'text/html';

  /** Available modes, in toolbar order. Omitted means the standard three modes. */
  modes?: readonly SysBOUIRichTextMode[];

  /** Mode selected when a page/popup instance is first opened. */
  initialMode?: SysBOUIRichTextMode;

  /** Shared geometry for all enabled modes. Runtime resizing remains private UI state. */
  height?: Readonly<SysBOUIRichTextHeightMetadata>;

  /*
   * Reserved extension surface for future declarative policy. Good candidates
   * include Markdown spellcheck/wrapping, Visual toolbar/features, Preview link
   * handling/sanitization, help/cheatsheet availability, placeholders, allowed
   * embeds/media and content-length limits. These are presentation policy only;
   * caret/selection, scroll position, current runtime height and editor lifecycle
   * state remain private browser state rather than metadata or semantic CTX.
   */
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

  /** Optional generic editor policy for canonical picture fields. */
  pictureEditor?: Readonly<SysBOUIPictureEditorMetadata>;

  /** Optional generic presentation policy for canonical rich-text fields. */
  richText?: Readonly<SysBOUIRichTextPresentationMetadata>;
}

export interface SysBOUIFieldOverrideMetadata {
  /**
   * Presentation overrides for a canonical field when this particular UI
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

  /**
   * Optional submitted/displayed value while a dynamic editable rule resolves
   * false. This is explicit because becoming read-only must not normally erase
   * a field. For nullable references, `null` naturally renders/submits as None.
   */
  readOnlyValue?: string | number | boolean | null;

  /** Optional contextual help rendered below this field by capable UIs. */
  helpText?: SysBOUIDynamicValue<string | null>;

  /** Formatting and visual decoration only; never changes entity semantics. */
  presentation?: SysBOUIFieldPresentationMetadata;
}

export type SysBOUIEntryActionKind = 'delete' | 'save' | 'command' | 'navigate';

/**
 * Stable action regions understood by metadata-driven entry renderers.
 * Concrete layout/CSS remains renderer-owned; metadata only chooses the
 * semantic region.
 */
export type SysBOUIEntryActionPlacement = 'footer-leading' | 'footer-trailing';

export interface SysBOUIEntryActionMetadata {
  /** The parent Record key is the stable action identifier. */
  kind: SysBOUIEntryActionKind;

  /** Stable ordering inside the action region; parent Record key remains identity. */
  order?: number;

  /** Static or evaluator-backed visibility against the active entry page CTX. */
  visible: SysBOUIDynamicValue<boolean>;

  /**
   * Static or evaluator-backed enabled state. Omitted means enabled.
   * The API remains the authoritative authorization/business boundary.
   */
  enabled?: SysBOUIDynamicValue<boolean>;

  /**
   * Optional evaluator-backed explanation shown when an action is disabled.
   * Keeping the reason beside `enabled` avoids entity-specific tooltip logic
   * leaking into the generic renderer.
   */
  disabledReason?: SysBOUIDynamicValue<string | null>;

  /** Semantic renderer region; omitted actions use their kind's default region. */
  placement?: SysBOUIEntryActionPlacement;

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

  /** Navigation target for kind='navigate'. */
  href?: string;
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
   * Optional UI-only calculation for this collection presentation. Canonical
   * related-entity calculations are materialized by the record-projection
   * boundary before the row reaches presentation and are never re-executed here.
   */
  expression?: string;

  format?: SysBOUIValueFormat;
  /** Optional scalar representation reused by related/value-object surfaces. */
  representation?: 'badge';
  icon?: SysBOUIIconKey;
  presentation?: SysBOUIFieldPresentationMetadata;
}

export interface SysBOUIRelatedCollectionSourceMetadata {
  /**
   * Generic read-only source for a related collection. The renderer/UI server
   * queries `entityKey` from the containing collection and constrains the
   * declared `filterField` to the current entry's `currentField` value.
   */
  kind: 'entity-query';
  filterField: string;
  currentField?: string;
  pageSize?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

/**
 * Reusable presentation of an entity when it appears as a member of another
 * entity's related collection. Entity UI metadata owns the generally useful
 * catalogue; relationship metadata may later contribute/override keyed views.
 */
export interface SysBOUIRelatedListViewMetadata {
  label?: string;
  icon?: SysBOUIIconKey;
  rowIcon?: SysBOUIIconKey;
  layout: 'panel-list' | 'table-list';
  rowHref?: string;
  emptyText?: string;
  fields: Readonly<Record<string, SysBOUIRelatedCollectionFieldMetadata>>;
}

export interface SysBOUIRelatedCollectionMetadata {
  label: string;
  icon?: SysBOUIIconKey;
  /**
   * Optional entry-identity icon override for each related record. The generic
   * related-collection pipeline feeds it into canonical entry representation;
   * when omitted, the collection icon is used. Renderers must not prepend
   * entity-specific row icons outside the common related-collections component.
   */
  rowIcon?: SysBOUIIconKey;

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

  /**
   * Optional generic source declaration for collections that are not already
   * embedded in the owning page payload.
   */
  source?: SysBOUIRelatedCollectionSourceMetadata;

  /** Named inherited related-list view selected for this relationship occurrence. */
  relatedListView?: string;

  /**
   * Relationship-local keyed contributions. Keys compose over the related
   * entity's catalogue; matching keys override/extend rather than replace it.
   */
  relatedListViews?: Readonly<Record<string, Partial<SysBOUIRelatedListViewMetadata>>>;

  /**
   * Entity whose records are presented by this relationship. Omit when the
   * relationship record itself is the presented entity.
   */
  relatedEntityKey?: string;

  /** Compact stacked rows or a conventional read-only table. Legacy/direct override. */
  layout?: 'panel-list' | 'table-list';

  /**
   * Optional row navigation template. `{id}` is replaced with the related row
   * identifier. When present, the first displayed field is rendered as a link.
   */
  rowHref?: string;

  emptyText?: string;

  /**
   * Keyed presentation fields. The Record key is both the UI field identity and
   * the default row source property; no redundant child `key` is required.
   */
  fields?: Readonly<Record<string, SysBOUIRelatedCollectionFieldMetadata>>;
}

/**
 * Record-presentation contribution used by an entity-wide record definition or
 * by one named UI view.  Every property is independently composable so the
 * metadata model can keep genuinely common presentation in one place while a
 * concrete view replaces or augments only what differs.
 */
export interface SysBOUIRecordViewMetadata {
  /** Make the whole resolved entry view informational/read-only, independent of host. */
  readOnly?: boolean;

  /** Full/page-style tab navigation. A view that supplies tabs replaces the common tab set. */
  tabs?: readonly SysBOUIRecordTabMetadata[];

  /**
   * Whether the entry tab strip is rendered visibly. The tabs/panes still exist
   * when false so one-tab popup views retain the canonical entry runtime and
   * navigation ownership without spending UI chrome on a meaningless selector.
   */
  tabNavigationVisible?: boolean;

  /** Compact/embedded linear content used by view types such as `quick`. */
  content?: readonly SysBOUITabContentMetadata[];

  /** Field presentation overrides compose by field key. */
  fieldOverrides?: Readonly<Record<string, SysBOUIFieldOverrideMetadata>>;

  /**
   * View-specific overrides for canonical entity entry actions. A ui-view does
   * not redefine an action; it changes only the properties that differ here.
   */
  actionOverrides?: Readonly<Record<string, Partial<SysBOUIEntryActionMetadata>>>;

  /** Related-record blocks compose by collection key. */
  relatedCollections?: Readonly<Record<string, SysBOUIRelatedCollectionMetadata>>;
}

/**
 * A named presentation of one canonical entity record. `viewType` describes
 * the interaction/presentation family (for example full or quick); the parent
 * map key identifies the concrete view (for example main, account or quick).
 */
export interface SysBOUIEntryViewMetadata {
  viewType: string;
  label?: string;
  record?: Readonly<SysBOUIRecordViewMetadata>;
}

export interface SysBOUIRecordMetadata {
  /** Effective record-wide read-only policy contributed by a named uiView. */
  readOnly?: boolean;

  tabs: readonly SysBOUIRecordTabMetadata[];
  tabNavigationVisible?: boolean;
  fieldOverrides: Readonly<Record<string, SysBOUIFieldOverrideMetadata>>;
  content?: readonly SysBOUITabContentMetadata[];

  /**
   * Keyed record-level commands. The Record key is the action identifier, so
   * action metadata does not repeat a redundant `key` property. New action
   * kinds can be added without changing the container shape.
   */
  entryActions?: Readonly<Record<string, SysBOUIEntryActionMetadata>>;

  /** Related-record blocks referenced by tab content. */
  relatedCollections?: Readonly<Record<string, SysBOUIRelatedCollectionMetadata>>;
}

export interface SysBOUIMetadata {
  key: string;
  /** Keyed entity-list UI views. `main` is the canonical/default list presentation. */
  list: SysBOUIListViewsMetadata;

  /** Stable selected related-list representation when a relationship does not choose one. */
  relatedListView?: string;

  /**
   * Keyed reusable representations of this entity inside related-entry lists.
   * Relationships inherit this catalogue and may contribute/override the same
   * keys without forcing the target entity to know its owners.
   */
  relatedListViews?: Readonly<Record<string, SysBOUIRelatedListViewMetadata>>;

  /**
   * Record presentation shared by UI views unless a selected view contributes
   * an override.  This remains intentionally permissive: common-vs-view
   * ownership can be refined as more real views are introduced.
   */
  record: SysBOUIRecordMetadata;

  /** Stable key of the ordinary entity-entry view. */
  defaultUIView?: string;

  /**
   * Alternative record presentations for the same canonical entity.  The map
   * key is stable view identity; each member declares its presentation family.
   */
  uiViews?: Readonly<Record<string, SysBOUIEntryViewMetadata>>;
}

/** Effective view returned by the generic composition resolver. */
export interface ResolvedSysBOUIView {
  key: string;
  viewType: string;
  label?: string;
  metadata: SysBOUIMetadata;
}
