import type { ManatOSContext, ManatOSUserPermissionsContext } from '@manatos/shared';
import { describe, expect, it } from 'vitest';
import {
  RootCtxRuntime,
  ROOT_CTX_EVENT_SURFACE_ID,
} from '../../src/runtime/context/root-ctx-runtime.js';
import {
  CurrentPlatformCtxAdapter,
  PermissionsCtxAdapter,
} from '../../src/runtime/context/root-ctx-adapters.js';
import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import { EffectiveUiMetadataResolver } from '../../src/runtime/resolvers/effective-ui-metadata-resolver.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

function seed(role = 'Admin'): Pick<ManatOSContext, 'system' | 'entities' | 'company' | 'user'> {
  return {
    system: { scope: 'sys' },
    entities: {},
    company: {
      currentPlatform: 'mcrm',
      currentPlatformIndex: 0,
      platforms: [{ id: 'mcrm' }, { id: 'erp' }],
    },
    user: {
      permissions: {
        userRole: role,
        platforms: {
          mcrm: { capabilities: { platformAccess: true } },
        },
      },
    },
  } as unknown as Pick<ManatOSContext, 'system' | 'entities' | 'company' | 'user'>;
}

function permissions(role: string): ManatOSUserPermissionsContext {
  return {
    userRole: role,
    platforms: {
      mcrm: { capabilities: { platformAccess: true } },
    },
  };
}

describe('UI Runtime V2 root CTX runtime/adapters', () => {
  it('projects the recursive V2 surface tree under canonical ctx.ui', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const fieldsBySurface = new Map<string, EntryStateRuntime['fields']>();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('firstName', 'Yiannis');
    fieldsBySurface.set(surface.id, entry.fields);

    const root = new RootCtxRuntime(seed(), surfaces, events, fieldsBySurface);
    const snapshot = root.snapshot();

    expect(snapshot.ui.level?.id).toBe(surface.id);
    expect(snapshot.ui.level?.mode).toBe('edit');
    expect(snapshot.ui.level?.fields?.firstName?.value).toBe('Yiannis');
    expect(snapshot.ui.level?.level).toBeUndefined();
  });

  it('projects canonical entry/list data branches for lexical V2 component sources', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const list = surfaces.open({
      host: 'page',
      kind: 'list',
      mode: 'browse',
      name: 'principals',
      list: {
        entries: [{ id: 'root', name: 'ManatOS' }],
        originalEntries: [{ id: 'root', name: 'ManatOS' }],
      },
    });
    const entrySurface = surfaces.open({
      parentId: list.id,
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'entry',
      entry: {
        original: { id: 'person', parentId: 'root' },
        current: { id: 'person', parentId: 'root' },
      },
    });
    const entry = new EntryStateRuntime(entrySurface.id, events);
    entry.defineField('id', 'person');
    entry.defineField('parentId', 'root');

    const root = new RootCtxRuntime(
      seed(),
      surfaces,
      events,
      new Map([[entrySurface.id, entry.fields]]),
    );
    const snapshot = root.snapshot();

    expect(snapshot.ui.level?.list?.entries).toEqual([{ id: 'root', name: 'ManatOS' }]);
    expect(snapshot.ui.level?.level?.entry?.current).toEqual({
      id: 'person',
      parentId: 'root',
    });
  });

  it('makes server-resolved permission changes reactive for declarative UX expressions', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const fieldsBySurface = new Map<string, EntryStateRuntime['fields']>();
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('firstName');
    fieldsBySurface.set(surface.id, entry.fields);

    const root = new RootCtxRuntime(seed('Admin'), surfaces, events, fieldsBySurface);
    const permissionAdapter = new PermissionsCtxAdapter(root);

    new EffectiveUiMetadataResolver().wireEntryFields(
      surface,
      entry,
      [
        {
          field: 'firstName',
          override: {
            visible: { expression: "ctx.user.permissions.userRole === 'Admin'" },
          },
        },
      ],
      () => root.snapshot(),
    );

    expect(entry.fields.require('firstName').ux.visible).toBe(true);
    permissionAdapter.set(permissions('User'));
    expect(entry.fields.require('firstName').ux.visible).toBe(false);

    const rootChange = events
      .history()
      .find(
        (event) =>
          event.type === 'ctx:changed' &&
          event.surfaceId === ROOT_CTX_EVENT_SURFACE_ID &&
          (event.payload as { path?: string }).path === 'ctx.user.permissions',
      );
    expect(rootChange).toBeDefined();
  });

  it('updates correlated current-platform facts atomically before change subscribers run', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const root = new RootCtxRuntime(seed(), surfaces, events);
    const adapter = new CurrentPlatformCtxAdapter(root);
    const observed: Array<[unknown, unknown]> = [];

    events.subscribe('ctx:changed', (event) => {
      if (event.surfaceId !== ROOT_CTX_EVENT_SURFACE_ID) return;
      if (!(event.payload as { path?: string }).path?.startsWith('ctx.company.currentPlatform')) {
        return;
      }
      observed.push([
        root.value('ctx.company.currentPlatform'),
        root.value('ctx.company.currentPlatformIndex'),
      ]);
    });

    adapter.set('erp', 1);

    expect(root.value('ctx.company.currentPlatform')).toBe('erp');
    expect(root.value('ctx.company.currentPlatformIndex')).toBe(1);
    expect(observed).toEqual([
      ['erp', 1],
      ['erp', 1],
    ]);
  });

  it('rejects arbitrary or incorrectly owned root CTX mutations', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const root = new RootCtxRuntime(seed(), surfaces, events);

    expect(() =>
      root.set({ path: 'ctx.user.permissions', value: permissions('User'), owner: 'random-code' }),
    ).toThrow('not registered as mutable');

    new PermissionsCtxAdapter(root);
    expect(() =>
      root.set({ path: 'ctx.user.permissions', value: permissions('User'), owner: 'random-code' }),
    ).toThrow('owner mismatch');
  });
});
