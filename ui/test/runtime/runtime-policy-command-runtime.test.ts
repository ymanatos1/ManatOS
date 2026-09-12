import { describe, expect, it } from 'vitest';
import { CommandRuntime } from '../../src/runtime/commands/command-runtime.js';
import { RelationshipPolicy } from '../../src/runtime/policies/relationship-policy.js';
import { SurfacePurposePolicy } from '../../src/runtime/policies/surface-purpose-policy.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

function openEntryPage(runtime: SurfaceRuntime) {
  return runtime.open({
    id: 'page-1',
    host: 'page',
    kind: 'entry',
    mode: 'edit',
    name: 'principal',
    entityKey: 'sys-principals',
  });
}

describe('UI Runtime V2 policy + command layer', () => {
  it('routes child opening through NavigationPolicy and rejects popup -> page nesting', async () => {
    const surfaces = new SurfaceRuntime();
    const page = openEntryPage(surfaces);
    const commands = new CommandRuntime(surfaces, surfaces.events);

    const popupResult = await commands.execute({
      name: 'surface.open',
      surfaceId: page.id,
      payload: {
        request: {
          id: 'popup-1',
          host: 'popup',
          kind: 'entry',
          mode: 'view',
          name: 'child',
        },
      },
    });
    const popup = popupResult.value as { id: string };
    expect(popup.id).toBe('popup-1');

    await expect(
      commands.execute({
        name: 'surface.open',
        surfaceId: popup.id,
        payload: {
          request: {
            host: 'page',
            kind: 'entry',
            mode: 'view',
            name: 'illegalPage',
          },
        },
      }),
    ).rejects.toThrow('a popup cannot open a nested page');

    expect(surfaces.find('popup-1')).not.toBeNull();
    expect(surfaces.activeSurface()?.id).toBe('popup-1');
    expect(surfaces.events.history().some((event) => event.type === 'command:failed')).toBe(true);
  });

  it('returns a generic result when a child surface closes and restores its parent', async () => {
    const surfaces = new SurfaceRuntime();
    const page = openEntryPage(surfaces);
    const popup = surfaces.open({
      id: 'popup-1',
      parentId: page.id,
      host: 'popup',
      kind: 'entry',
      mode: 'create',
      name: 'addPrincipal',
    });
    const commands = new CommandRuntime(surfaces, surfaces.events);

    const closed = await commands.execute({
      name: 'surface.close',
      surfaceId: popup.id,
      payload: {
        result: {
          outcome: 'saved',
          value: 'principal-42',
          record: { id: 'principal-42', fullName: 'Yiannis Manatos' },
        },
      },
    });

    expect(closed.surfaceResult?.outcome).toBe('saved');
    expect(commands.result(popup.id)?.value).toBe('principal-42');
    expect(surfaces.find(popup.id)).toBeNull();
    expect(surfaces.activeSurface()?.id).toBe(page.id);
  });

  it('returns the navigation parent on back when lifecycle ownership differs', async () => {
    const surfaces = new SurfaceRuntime();
    const owner = surfaces.open({
      id: 'owner-page',
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'owner',
    });
    const navigationParent = surfaces.open({
      id: 'navigation-page',
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'navigationParent',
    });
    const child = surfaces.open({
      id: 'child-popup',
      parentId: owner.id,
      navigationParentId: navigationParent.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'child',
    });
    const commands = new CommandRuntime(surfaces, surfaces.events);

    const backed = await commands.execute({
      name: 'surface.back',
      surfaceId: child.id,
      payload: {},
    });

    expect((backed.value as { id: string } | null)?.id).toBe(navigationParent.id);
    expect(surfaces.find(child.id)).toBeNull();
    expect(surfaces.activeSurface()?.id).toBe(navigationParent.id);
    expect(surfaces.find(owner.id)).not.toBeNull();
  });

  it('keeps relationship decisions in policy rather than relationship components', () => {
    const surfaces = new SurfaceRuntime();
    const source = openEntryPage(surfaces);
    const policy = new RelationshipPolicy();

    const create = policy.evaluate({
      sourceSurface: source,
      targetEntityKey: 'sys-principals',
      targetField: 'parentPrincipalId',
      action: 'add-entry',
      metadata: { allowCreate: true, constraints: { forbidCycle: true } },
    });

    expect(create.allowed).toBe(true);
    expect(create.details?.mode).toBe('create');
    expect(create.details?.constraints).toEqual({ forbidCycle: true });

    const denied = policy.evaluate({
      sourceSurface: source,
      targetEntityKey: 'sys-principals',
      targetField: 'parentPrincipalId',
      action: 'add-entry',
      metadata: { allowCreate: false },
    });
    expect(denied.allowed).toBe(false);
  });

  it('resolves generic available actions from canonical surface mode', () => {
    const surfaces = new SurfaceRuntime();
    const view = surfaces.open({
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'viewPrincipal',
    });

    const decision = new SurfacePurposePolicy().evaluate({ surface: view });
    expect(decision.details?.allowedActions).toEqual(['close', 'back']);
  });
});
