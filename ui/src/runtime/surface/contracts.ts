/**
 * ManatOS UI Runtime V2 canonical surface contracts.
 *
 * V2 deliberately models a page and a popup as the same runtime concept: a
 * Surface hosted by either a PageHost or PopupHost. Host-specific rendering
 * must not redefine operational state such as mode, entity data or lifecycle.
 */

export type SurfaceHost = 'page' | 'popup';

/** Semantic content rendered by a surface. This is not an operational mode. */
export type SurfaceKind = 'static' | 'list' | 'entry' | 'selector' | 'hierarchy' | 'custom';

/**
 * Operational behavior of the surface. Keep this distinct from SurfaceKind so
 * values such as `entry` and `create` can never compete under a property named
 * `mode`.
 */
export type SurfaceMode = 'browse' | 'create' | 'edit' | 'view' | 'select' | 'manage';

export type SurfaceLifecyclePhase =
  | 'creating'
  | 'created'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'closing'
  | 'closed'
  | 'disposed';

export type SurfaceEventSource =
  | 'engine'
  | 'user'
  | 'metadata-default'
  | 'caller-default'
  | 'caller-override'
  | 'calculation'
  | 'relationship'
  | 'server'
  | 'reset'
  | 'command';

/** Semantic reason a parent opened a child surface. Operational behavior belongs to mode. */
export type SurfacePurpose = 'select' | 'view' | 'create' | 'inspect';

/** Stable caller identity. surfaceRef is a reference to the caller CTX surface, never a state copy. */
export interface SurfaceCallerReference {
  readonly surfaceRef: string;
  readonly entityName?: string;
  readonly recordId?: string;
}

export interface SurfaceValueRule {
  readonly default?: unknown;
  readonly fixed?: unknown;
}

export interface SurfaceFieldRule {
  readonly label?: string;
  readonly visible?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly enabled?: boolean;
  readonly allowedValues?: readonly unknown[];
  readonly excludedValues?: readonly unknown[];
  readonly allowedEnumItemTrait?: string;
}

export interface SurfaceQueryRules {
  /** Canonical expression source/reference. AST ownership belongs to the process-global expression cache. */
  readonly predicate?: string;
  readonly include?: readonly unknown[];
  readonly exclude?: readonly unknown[];
  readonly ordering?: readonly unknown[];
  readonly fixedFilters?: Readonly<Record<string, unknown>>;
}

export interface SurfaceActionRules {
  readonly create?: boolean;
  readonly edit?: boolean;
  readonly delete?: boolean;
  readonly select?: boolean;
  readonly clear?: boolean;
}

export interface SurfaceInvocationRules {
  readonly values?: Readonly<Record<string, Readonly<SurfaceValueRule>>>;
  readonly fields?: Readonly<Record<string, Readonly<SurfaceFieldRule>>>;
  readonly query?: Readonly<SurfaceQueryRules>;
  readonly actions?: Readonly<SurfaceActionRules>;
}

export interface SurfaceInvocationBehavior {
  readonly selection?: 'single' | 'multiple';
  readonly allowClear?: boolean;
  readonly autofocus?: boolean;
  readonly closeAfterSave?: boolean;
}

/**
 * Canonical surface invocation contract. It is host-neutral and applies equally
 * to first-level pages, nested pages and popup-hosted surfaces. `purpose` says
 * why the surface exists; `SurfaceMode` says how that surface currently operates.
 *
 * Caller continuation/routing (for example which parent field consumes a
 * result) deliberately does not belong here. A child receives only its own
 * semantic purpose, a stable caller reference and declarative constraints.
 *
 */
export interface SurfaceInvocation {
  readonly entityName?: string;
  readonly purpose?: SurfacePurpose;
  readonly caller?: Readonly<SurfaceCallerReference>;
  readonly presentation?: Readonly<Omit<SurfacePresentation, 'kind'>>;
  readonly rules?: Readonly<SurfaceInvocationRules>;
  readonly behavior?: Readonly<SurfaceInvocationBehavior>;
}

/** Presentation describes visual semantics only; it intentionally has no mode. */
export interface SurfacePresentation {
  readonly kind: SurfaceKind;
  readonly title?: string;
  readonly icon?: string;
  readonly subtitle?: string;
  readonly layout?: string;
}

export interface SurfaceNavigationState {
  activeTabId: string | null;
  activeInternalTabIds: Record<string, string | null>;
}

/**
 * Popup-host geometry is observable UI state, not presentation metadata.
 * Coordinates are viewport-relative top/left pixels. The counter records the
 * popup's depth in the currently displayed popup chain (page child = 0).
 */
export interface SurfacePopupState {
  x: number;
  y: number;
  openedPopupsCounter: number;
}

export interface SurfaceState {
  lifecycle: SurfaceLifecyclePhase;
  active: boolean;
  dirty: boolean;
  valid: boolean;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  blocked: boolean;
  /** Observable navigation state. Tracking only; UI navigation updates this after the UI changes. */
  navigation: SurfaceNavigationState;
  /** Present only for popup-hosted surfaces. */
  popup?: SurfacePopupState;
}

export interface SurfaceEntryState {
  original: Readonly<Record<string, unknown>> | null;
  current: Record<string, unknown>;
  /**
   * API-safe, non-persisted facts that belong to this record projection but are
   * not canonical entity fields (for example `hasPassword`). They are kept
   * separate from `current` so persistence state cannot accidentally absorb
   * transport/runtime projection values.
   */
  facts: Readonly<Record<string, unknown>>;
}

export interface SurfaceListState {
  entries: readonly Readonly<Record<string, unknown>>[];
  originalEntries: readonly Readonly<Record<string, unknown>>[];
}

export interface SurfaceSelectionState {
  current: Readonly<Record<string, unknown>> | null;
  selected: readonly Readonly<Record<string, unknown>>[];
  facts: Readonly<Record<string, unknown>>;
}

export interface SurfaceRowState {
  current: Readonly<Record<string, unknown>> | null;
  facts: Readonly<Record<string, unknown>>;
}

/**
 * Recursive authoritative UI runtime node. There is intentionally no maximum
 * nesting depth. `children` is the semantic/lifecycle ownership tree only;
 * navigation activation is tracked independently by SurfaceRuntime.
 */
export interface SurfaceContext {
  readonly id: string;
  /** Semantic/lifecycle owner. This is deliberately not the navigation hierarchy. */
  readonly parentId: string | null;
  /** Surface whose host/chrome this surface is navigationally presented from. */
  readonly navigationParentId: string | null;
  readonly host: SurfaceHost;
  readonly kind: SurfaceKind;
  readonly mode: SurfaceMode;
  readonly name: string;
  /** Canonical CTX/surfaceRef address. Follows navigation hierarchy, not semantic ownership. */
  readonly path: string;
  readonly scope: string;
  readonly entityKey?: string;
  /** Canonical symbolic entity name used by ctx.entities (for example sysExtAuthProviders). */
  readonly entityName?: string;
  readonly recordId?: string;
  readonly invocation: Readonly<SurfaceInvocation>;
  readonly presentation: Readonly<SurfacePresentation>;
  readonly state: SurfaceState;
  readonly entry?: SurfaceEntryState;
  /** Observable semantic facts owned by the surface. */
  readonly facts?: Readonly<Record<string, unknown>>;
  /** Observable selection state for list/selector surfaces. */
  readonly selection?: SurfaceSelectionState;
  /** Observable current-row evaluation state for list/selector surfaces. */
  readonly row?: SurfaceRowState;
  /** Host-neutral read models owned by this surface's metadata components. */
  readonly resources?: Readonly<Record<string, unknown>>;
  readonly list?: SurfaceListState;
  readonly children: SurfaceContext[];
}

export interface OpenSurfaceRequest {
  readonly id?: string;
  /** Semantic/lifecycle owner of the new surface. */
  readonly parentId?: string | null;
  /** Optional navigation parent; defaults to parentId but may intentionally differ. */
  readonly navigationParentId?: string | null;
  readonly host: SurfaceHost;
  readonly kind: SurfaceKind;
  readonly mode: SurfaceMode;
  readonly name: string;
  readonly scope?: string;
  readonly entityKey?: string;
  /** Canonical symbolic entity name used by ctx.entities (for example sysExtAuthProviders). */
  readonly entityName?: string;
  readonly recordId?: string;
  readonly invocation?: SurfaceInvocation;
  readonly presentation?: Omit<SurfacePresentation, 'kind'>;
  readonly initialNavigation?: {
    readonly activeTabId?: string | null;
    readonly activeInternalTabIds?: Readonly<Record<string, string | null>>;
  };
  readonly initialPopupState?: Readonly<SurfacePopupState>;
  readonly entry?: {
    readonly original?: Readonly<Record<string, unknown>> | null;
    readonly current?: Readonly<Record<string, unknown>>;
    readonly facts?: Readonly<Record<string, unknown>>;
  };
  readonly facts?: Readonly<Record<string, unknown>>;
  readonly selection?: {
    readonly current?: Readonly<Record<string, unknown>> | null;
    readonly selected?: readonly Readonly<Record<string, unknown>>[];
    readonly facts?: Readonly<Record<string, unknown>>;
  };
  readonly row?: {
    readonly current?: Readonly<Record<string, unknown>> | null;
    readonly facts?: Readonly<Record<string, unknown>>;
  };
  readonly resources?: Readonly<Record<string, unknown>>;
  readonly list?: {
    readonly entries?: readonly Readonly<Record<string, unknown>>[];
    readonly originalEntries?: readonly Readonly<Record<string, unknown>>[];
  };
}
