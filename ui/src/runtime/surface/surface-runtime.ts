import { SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import { NavigationPolicy } from '../policies/navigation-policy.js';
import type {
  OpenSurfaceRequest,
  SurfaceContext,
  SurfaceEventSource,
  SurfaceHost,
  SurfaceState,
} from './contracts.js';

const SURFACE_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

function assertSurfaceName(name: string): string {
  const normalized = name.trim();
  if (!SURFACE_NAME.test(normalized)) throw new Error(`Invalid V2 surface name: ${name}`);
  return normalized;
}

function childPath(
  navigationParent: SurfaceContext | null,
  host: SurfaceHost,
  name: string,
): string {
  const segment = `${host}:${name}`;
  return navigationParent ? `${navigationParent.path}/${segment}` : `/ui/${segment}`;
}

function newSurfaceState(): SurfaceState {
  return {
    lifecycle: 'creating',
    active: false,
    dirty: false,
    valid: true,
    loading: false,
    saving: false,
    deleting: false,
    blocked: false,
    navigation: { activeTabId: null, activeInternalTabIds: {} },
  };
}

/**
 * Canonical V2 surface runtime.
 *
 * It owns the authoritative recursive surface tree and lifecycle. Retired page/
 * popup runtime models are intentionally not part of this production contract.
 */
export class SurfaceRuntime {
  readonly events: SurfaceEventRuntime;
  readonly #byId = new Map<string, SurfaceContext>();
  readonly #roots: SurfaceContext[] = [];
  #nextId = 0;
  #activeSurfaceId: string | null = null;

  constructor(
    events = new SurfaceEventRuntime(),
    readonly navigationPolicy = new NavigationPolicy(),
  ) {
    this.events = events;
  }

  roots(): readonly SurfaceContext[] {
    return this.#roots;
  }

  activeSurface(): SurfaceContext | null {
    return this.#activeSurfaceId ? (this.#byId.get(this.#activeSurfaceId) ?? null) : null;
  }

  find(surfaceId: string): SurfaceContext | null {
    return this.#byId.get(surfaceId) ?? null;
  }

  open(request: OpenSurfaceRequest): SurfaceContext {
    const parent = request.parentId ? this.#required(request.parentId) : null;
    const navigationParentId =
      request.navigationParentId === undefined ? (parent?.id ?? null) : request.navigationParentId;
    const navigationParent = navigationParentId ? this.#required(navigationParentId) : null;
    const navigation = this.navigationPolicy.evaluate({
      parent: navigationParent,
      childHost: request.host,
    });
    if (!navigation.allowed) {
      throw new Error(navigation.reason ?? 'V2 navigation denied by policy.');
    }

    const id = request.id ?? `surface-${++this.#nextId}`;
    if (this.#byId.has(id)) throw new Error(`V2 surface id already exists: ${id}`);

    const name = assertSurfaceName(request.name);
    const invocation = Object.freeze({ ...(request.invocation ?? {}) });
    const presentation = Object.freeze({
      kind: request.kind,
      ...(request.presentation ?? {}),
    });
    const state = newSurfaceState();
    state.navigation.activeTabId = request.initialNavigation?.activeTabId ?? null;
    state.navigation.activeInternalTabIds = {
      ...(request.initialNavigation?.activeInternalTabIds ?? {}),
    };
    if (request.host === 'popup' && request.initialPopupState) {
      state.popup = { ...request.initialPopupState };
    }
    const surface: SurfaceContext = {
      id,
      parentId: parent?.id ?? null,
      navigationParentId,
      host: request.host,
      kind: request.kind,
      mode: request.mode,
      name,
      // CTX/surfaceRef addressing follows the navigation topology. Semantic ownership
      // remains independently represented by parentId/children.
      path: childPath(navigationParent, request.host, name),
      scope: request.scope ?? parent?.scope ?? 'sys',
      ...(request.entityKey ? { entityKey: request.entityKey } : {}),
      ...(request.entityName ? { entityName: request.entityName } : {}),
      ...(request.recordId ? { recordId: request.recordId } : {}),
      invocation,
      presentation,
      state,
      ...(request.entry
        ? {
            entry: {
              original: request.entry.original ?? null,
              current: { ...(request.entry.current ?? {}) },
              facts: Object.freeze({ ...(request.entry.facts ?? {}) }),
            },
          }
        : {}),
      ...((request.facts ?? request.entry?.facts)
        ? { facts: Object.freeze({ ...(request.facts ?? request.entry?.facts ?? {}) }) }
        : {}),
      ...(request.selection
        ? {
            selection: {
              current: request.selection.current ?? null,
              selected: Object.freeze([...(request.selection.selected ?? [])]),
              facts: Object.freeze({ ...(request.selection.facts ?? {}) }),
            },
          }
        : {}),
      ...(request.row
        ? {
            row: {
              current: request.row.current ?? null,
              facts: Object.freeze({ ...(request.row.facts ?? {}) }),
            },
          }
        : {}),
      ...(request.resources ? { resources: Object.freeze({ ...request.resources }) } : {}),
      ...(request.list
        ? {
            list: {
              entries: Object.freeze([...(request.list.entries ?? [])]),
              originalEntries: Object.freeze([...(request.list.originalEntries ?? [])]),
            },
          }
        : {}),
      children: [],
    };

    this.events.emit({
      type: 'surface:creating',
      surfaceId: id,
      payload: {
        parentId: surface.parentId,
        navigationParentId: surface.navigationParentId,
        host: surface.host,
        kind: surface.kind,
        mode: surface.mode,
      },
    });
    if (parent) {
      this.events.emit({
        type: 'child:opening',
        surfaceId: parent.id,
        payload: { childSurfaceId: id },
      });
    }

    this.#byId.set(id, surface);
    if (parent) parent.children.push(surface);
    else this.#roots.push(surface);

    state.lifecycle = 'created';
    this.events.emit({ type: 'surface:created', surfaceId: id, payload: {} });
    this.#activate(surface);
    if (parent) {
      this.events.emit({
        type: 'child:opened',
        surfaceId: parent.id,
        payload: { childSurfaceId: id },
      });
    }
    return surface;
  }

  /**
   * Mutate semantic surface state through the canonical CTX event pipeline.
   *
   * UI calculations may observe these properties declaratively, so callers
   * must not silently assign dirty/valid/loading/saving/deleting/blocked.
   * Lifecycle/active remain owned by SurfaceRuntime's lifecycle state machine
   * and have dedicated events.
   */
  setState(
    surfaceId: string,
    property: 'dirty' | 'valid' | 'loading' | 'saving' | 'deleting' | 'blocked',
    value: boolean,
    source: SurfaceEventSource = 'engine',
    causeEventId?: string | null,
  ) {
    const surface = this.#required(surfaceId);
    const oldValue = surface.state[property];
    if (oldValue === value) return null;

    const changing = this.events.emit({
      type: 'ctx:changing',
      surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: { path: `state.${property}`, oldValue, newValue: value },
    });

    surface.state[property] = value;

    return this.events.emit({
      type: 'ctx:changed',
      surfaceId,
      source,
      causeEventId: causeEventId ?? changing.id,
      payload: { path: `state.${property}`, oldValue, newValue: value },
    });
  }

  /**
   * Close a surface and every descendant in deepest-first order. This is the V2
   * lifecycle guarantee that prevents hosted popup/page DOM, CTX and event state
   * from surviving after their owning surface is closed.
   */
  close(surfaceId: string): void {
    const surface = this.#required(surfaceId);
    const parent = surface.parentId ? this.#required(surface.parentId) : null;
    const activeBefore = this.activeSurface();
    const activeInsideClosingBranch = activeBefore
      ? this.#isOwnedBy(activeBefore, surface.id)
      : false;
    const fallbackNavigationParentId =
      activeInsideClosingBranch && activeBefore
        ? this.#navigationAncestorOutside(activeBefore, surface.id)
        : null;

    if (parent) {
      this.events.emit({
        type: 'child:closing',
        surfaceId: parent.id,
        payload: { childSurfaceId: surface.id },
      });
    }
    this.#disposeBranch(surface);

    if (parent) {
      const index = parent.children.findIndex((candidate) => candidate.id === surface.id);
      if (index >= 0) parent.children.splice(index, 1);
      this.events.emit({
        type: 'child:closed',
        surfaceId: parent.id,
        payload: { childSurfaceId: surface.id },
      });
    } else {
      const index = this.#roots.findIndex((candidate) => candidate.id === surface.id);
      if (index >= 0) this.#roots.splice(index, 1);
    }

    // Closing an inactive ownership branch must not disturb the currently active
    // navigation surface. If the active surface was disposed, navigation
    // restoration follows that surface's navigation parent first; semantic
    // ownership is only a lifecycle fallback.
    if (activeBefore && this.#byId.has(activeBefore.id)) return;

    const navigationFallback = fallbackNavigationParentId
      ? (this.#byId.get(fallbackNavigationParentId) ?? null)
      : null;
    const semanticFallback = parent && this.#byId.has(parent.id) ? parent : null;
    const rootFallback = this.#roots.at(-1) ?? null;
    const next = navigationFallback ?? semanticFallback ?? rootFallback;
    if (next) this.#activate(next);
    else this.#activeSurfaceId = null;
  }

  #disposeBranch(surface: SurfaceContext): void {
    for (const child of [...surface.children].reverse()) this.#disposeBranch(child);
    surface.children.length = 0;

    surface.state.lifecycle = 'closing';
    surface.state.active = false;
    this.events.emit({ type: 'surface:closing', surfaceId: surface.id, payload: {} });
    surface.state.lifecycle = 'closed';
    this.events.emit({ type: 'surface:closed', surfaceId: surface.id, payload: {} });
    surface.state.lifecycle = 'disposed';
    this.events.emit({ type: 'surface:disposed', surfaceId: surface.id, payload: {} });
    this.#byId.delete(surface.id);
  }

  #activate(surface: SurfaceContext): void {
    this.#deactivateCurrent();
    surface.state.lifecycle = 'activating';
    this.events.emit({ type: 'surface:activating', surfaceId: surface.id, payload: {} });
    surface.state.active = true;
    surface.state.lifecycle = 'active';
    this.#activeSurfaceId = surface.id;
    this.events.emit({ type: 'surface:activated', surfaceId: surface.id, payload: {} });
  }

  #deactivate(surface: SurfaceContext): void {
    if (!surface.state.active) return;
    surface.state.lifecycle = 'deactivating';
    this.events.emit({ type: 'surface:deactivating', surfaceId: surface.id, payload: {} });
    surface.state.active = false;
    if (this.#activeSurfaceId === surface.id) this.#activeSurfaceId = null;
  }

  #deactivateCurrent(): void {
    if (!this.#activeSurfaceId) return;
    const current = this.#byId.get(this.#activeSurfaceId);
    if (current) this.#deactivate(current);
  }

  #isOwnedBy(surface: SurfaceContext, ancestorId: string): boolean {
    let cursor: SurfaceContext | null = surface;
    while (cursor) {
      if (cursor.id === ancestorId) return true;
      cursor = cursor.parentId ? (this.#byId.get(cursor.parentId) ?? null) : null;
    }
    return false;
  }

  #navigationAncestorOutside(surface: SurfaceContext, closingOwnerId: string): string | null {
    let navigationParentId = surface.navigationParentId;
    while (navigationParentId) {
      const candidate = this.#byId.get(navigationParentId);
      if (!candidate) return null;
      if (!this.#isOwnedBy(candidate, closingOwnerId)) return candidate.id;
      navigationParentId = candidate.navigationParentId;
    }
    return null;
  }

  #required(surfaceId: string): SurfaceContext {
    const surface = this.#byId.get(surfaceId);
    if (!surface) throw new Error(`V2 surface not found: ${surfaceId}`);
    return surface;
  }
}
