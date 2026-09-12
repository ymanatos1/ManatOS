import { describe, expect, it } from 'vitest';

import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import type { SurfaceHostMount } from '../../src/runtime/hosts/host-contracts.js';
import type { PageHost } from '../../src/runtime/hosts/page-host.js';
import type { PopupHost } from '../../src/runtime/hosts/popup-host.js';
import { SurfaceHostRuntime } from '../../src/runtime/hosts/surface-host-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

function fakeHost(host: 'page' | 'popup', log: string[]) {
  return {
    mount: (surface: { id: string }): SurfaceHostMount => ({
      surfaceId: surface.id,
      host,
      element: {} as HTMLElement,
      activate: () => log.push(`activate:${surface.id}`),
      deactivate: (preserveVisual = false) =>
        log.push(`deactivate:${surface.id}:${String(preserveVisual)}`),
      dispose: () => log.push(`dispose:${surface.id}`),
    }),
  };
}

describe('UI Runtime V2 host projection', () => {
  it('overlays popup parents but replaces page parents', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const log: string[] = [];
    const hosts = new SurfaceHostRuntime(
      surfaces,
      events,
      fakeHost('page', log) as unknown as PageHost,
      fakeHost('popup', log) as unknown as PopupHost,
      () => ({ element: {} as HTMLElement, dispose: () => undefined }),
    );

    const list = surfaces.open({ host: 'page', kind: 'list', mode: 'browse', name: 'list' });
    const entry = surfaces.open({
      parentId: list.id,
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'entry',
    });
    const popup = surfaces.open({
      parentId: entry.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'popup',
    });

    expect(log).toContain(`deactivate:${list.id}:false`);
    expect(log).toContain(`deactivate:${entry.id}:true`);
    surfaces.close(popup.id);
    expect(log).toContain(`dispose:${popup.id}`);
    expect(log.filter((item) => item === `activate:${entry.id}`).length).toBeGreaterThan(1);
    hosts.dispose();
  });

  it('keeps semantic ownership distinct from navigation hierarchy', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const log: string[] = [];
    const hosts = new SurfaceHostRuntime(
      surfaces,
      events,
      fakeHost('page', log) as unknown as PageHost,
      fakeHost('popup', log) as unknown as PopupHost,
      () => ({ element: {} as HTMLElement, dispose: () => undefined }),
    );

    const owner = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'owner' });
    const navigationParent = surfaces.open({
      host: 'page',
      kind: 'list',
      mode: 'browse',
      name: 'navigation-parent',
    });
    const child = surfaces.open({
      parentId: owner.id,
      navigationParentId: navigationParent.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'child',
    });

    expect(child.parentId).toBe(owner.id);
    expect(child.navigationParentId).toBe(navigationParent.id);
    expect(child.path).toBe('/ui/page:navigation-parent/popup:child');
    expect(owner.children.map((surface) => surface.id)).toContain(child.id);
    expect(log).toContain(`deactivate:${navigationParent.id}:true`);
    expect(log).not.toContain(`deactivate:${owner.id}:true`);

    surfaces.close(child.id);
    expect(surfaces.activeSurface()?.id).toBe(navigationParent.id);
    hosts.dispose();
  });

  it('projects recursive surface disposal into host disposal', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const log: string[] = [];
    const hosts = new SurfaceHostRuntime(
      surfaces,
      events,
      fakeHost('page', log) as unknown as PageHost,
      fakeHost('popup', log) as unknown as PopupHost,
      () => ({ element: {} as HTMLElement, dispose: () => undefined }),
    );
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'page' });
    const popup = surfaces.open({
      parentId: page.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'popup',
    });
    const nested = surfaces.open({
      parentId: popup.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'nested',
    });

    surfaces.close(popup.id);
    expect(log).toContain(`dispose:${nested.id}`);
    expect(log).toContain(`dispose:${popup.id}`);
    expect(hosts.find(nested.id)).toBeNull();
    expect(hosts.find(popup.id)).toBeNull();
    hosts.dispose();
  });
});
