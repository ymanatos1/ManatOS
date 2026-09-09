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

/**
 * Invocation describes why/how a parent requested the new surface. It is input
 * provenance and return-routing information, not a second source of runtime
 * truth. In particular, operational `mode` belongs only to SurfaceContext.
 */
export interface SurfaceInvocation {
  readonly purpose?: string;
  readonly sourceSurfaceId?: string;
  readonly sourceEntityKey?: string;
  readonly sourceRecordId?: string;
  readonly targetEntityKey?: string;
  readonly targetField?: string;
  readonly selectionMode?: 'single' | 'multiple';
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly overrides?: Readonly<Record<string, unknown>>;
  readonly uiOverrides?: Readonly<Record<string, unknown>>;
  readonly parameters?: Readonly<Record<string, unknown>>;
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

/**
 * Recursive authoritative UI runtime node. There is intentionally no maximum
 * nesting depth. The SurfaceRuntime owns mutation of children/activeChildId.
 */
export interface SurfaceContext {
  readonly id: string;
  readonly parentId: string | null;
  readonly host: SurfaceHost;
  readonly kind: SurfaceKind;
  readonly mode: SurfaceMode;
  readonly name: string;
  readonly path: string;
  readonly scope: string;
  readonly entityKey?: string;
  readonly recordId?: string;
  readonly invocation: Readonly<SurfaceInvocation>;
  readonly presentation: Readonly<SurfacePresentation>;
  readonly state: SurfaceState;
  readonly entry?: SurfaceEntryState;
  /** Host-neutral read models owned by this surface's metadata components. */
  readonly resources?: Readonly<Record<string, unknown>>;
  readonly list?: SurfaceListState;
  readonly children: SurfaceContext[];
  activeChildId: string | null;
}

export interface OpenSurfaceRequest {
  readonly id?: string;
  readonly parentId?: string | null;
  readonly host: SurfaceHost;
  readonly kind: SurfaceKind;
  readonly mode: SurfaceMode;
  readonly name: string;
  readonly scope?: string;
  readonly entityKey?: string;
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
  readonly resources?: Readonly<Record<string, unknown>>;
  readonly list?: {
    readonly entries?: readonly Readonly<Record<string, unknown>>[];
    readonly originalEntries?: readonly Readonly<Record<string, unknown>>[];
  };
}
