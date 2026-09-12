import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';
import type { PageHost } from './page-host.js';
import type { PopupHost } from './popup-host.js';
import type { SurfaceContentRenderer, SurfaceHostMount } from './host-contracts.js';

/** Keeps DOM host lifecycle a projection of authoritative SurfaceRuntime state. */
export class SurfaceHostRuntime {
  readonly #mounts = new Map<string, SurfaceHostMount>();
  readonly #unsubscribe: () => void;

  constructor(
    readonly surfaces: SurfaceRuntime,
    events: SurfaceEventRuntime,
    readonly pageHost: PageHost,
    readonly popupHost: PopupHost,
    readonly renderContent: SurfaceContentRenderer,
  ) {
    this.#unsubscribe = events.subscribe('*', (event) => this.#onEvent(event));
  }

  mount(surfaceId: string): SurfaceHostMount {
    const existing = this.#mounts.get(surfaceId);
    if (existing) return existing;
    const surface = this.surfaces.find(surfaceId);
    if (!surface) throw new Error(`V2 host cannot mount unknown surface: ${surfaceId}`);
    const mount =
      surface.host === 'page'
        ? this.pageHost.mount(surface, this.renderContent)
        : this.popupHost.mount(surface, this.renderContent);
    this.#mounts.set(surfaceId, mount);
    if (surface.state.active) mount.activate();
    else mount.deactivate();
    return mount;
  }

  find(surfaceId: string): SurfaceHostMount | null {
    return this.#mounts.get(surfaceId) ?? null;
  }

  dispose(): void {
    this.#unsubscribe();
    for (const mount of [...this.#mounts.values()].reverse()) mount.dispose();
    this.#mounts.clear();
  }

  #onEvent(event: SurfaceEvent): void {
    if (event.type === 'surface:created') {
      const surface = this.surfaces.find(event.surfaceId);
      if (!surface) return;
      if (surface.navigationParentId) {
        const parentMount = this.#mounts.get(surface.navigationParentId);
        // Host presentation follows the navigation hierarchy, not semantic ownership.
        // A popup overlays its navigation parent; a nested page replaces it.
        parentMount?.deactivate(surface.host === 'popup');
      }
      this.mount(event.surfaceId);
      return;
    }
    const mount = this.#mounts.get(event.surfaceId);
    if (!mount) return;
    if (event.type === 'surface:activated') mount.activate();
    if (event.type === 'surface:disposed') {
      mount.dispose();
      this.#mounts.delete(event.surfaceId);
    }
  }
}
