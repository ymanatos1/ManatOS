import { describe, expect, it } from 'vitest';
import type { ManatOSObjectMetadata, SysBOUIMetadata } from '@manatos/shared';
import { CommandRuntime } from '../../src/runtime/commands/command-runtime.js';
import { EntryOpenRuntime } from '../../src/runtime/relationships/entry-open-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

const metadata: ManatOSObjectMetadata<Record<string, unknown>> = {
  key: 'people',
  name: 'people',
  label: 'Person',
  pluralLabel: 'People',
  primaryField: 'fullName',
  fieldDefinition: {
    firstName: { key: 'firstName', label: 'First name', type: 'string', order: 1, required: true },
    lastName: { key: 'lastName', label: 'Last name', type: 'string', order: 2, required: true },
    fullName: {
      key: 'fullName',
      label: 'Full name',
      type: 'string',
      order: 3,
      readOnly: true,
      calculation: {
        expression: "#level.entry.current.firstName + ' ' + #level.entry.current.lastName",
      },
    },
  },
};

const uiMetadata: SysBOUIMetadata = {
  key: 'people',
  list: { columns: [], addAction: { label: 'Add' } },
  record: {
    fieldOverrides: {},
    tabs: [
      { id: 'general', label: 'General', order: 1, fields: ['firstName', 'lastName', 'fullName'] },
    ],
  },
};

function openPopup(
  surfaces: SurfaceRuntime,
  parentId: string,
  mode: 'create' | 'edit' | 'view' = 'create',
) {
  const surface = surfaces.open({
    parentId,
    host: 'popup',
    kind: 'entry',
    mode,
    name: 'person',
    entityKey: 'people',
    invocation: {
      purpose: 'create',
      rules: {
        values: {
          firstName: { default: 'Yiannis' },
          lastName: { fixed: 'Manatos' },
        },
      },
    },
  });
  const commands = new CommandRuntime(surfaces, surfaces.events);
  return {
    surface,
    runtime: new EntryOpenRuntime({ surface, surfaces, commands, metadata, uiMetadata }),
  };
}

describe('V2 EntryOpenRuntime', () => {
  it('composes the accepted EntityEntry runtime and applies popup caller values through it', () => {
    const surfaces = new SurfaceRuntime();
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'owner' });
    const { runtime } = openPopup(surfaces, page.id);

    runtime.initialize();

    expect(runtime.entry.values()).toMatchObject({
      firstName: 'Yiannis',
      lastName: 'Manatos',
      fullName: 'Yiannis Manatos',
    });
    runtime.dispose();
  });

  it('returns a generic saved SurfaceResult and restores the exact parent on save-and-close', async () => {
    const surfaces = new SurfaceRuntime();
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'owner' });
    const { surface, runtime } = openPopup(surfaces, page.id);
    runtime.initialize();

    const result = await runtime.completeSave({
      value: 'person-1',
      record: { id: 'person-1', firstName: 'Yiannis', lastName: 'Manatos' },
      metadata: { entityKey: 'people' },
    });

    expect(result).toEqual({
      outcome: 'saved',
      surfaceId: surface.id,
      value: 'person-1',
      record: { id: 'person-1', firstName: 'Yiannis', lastName: 'Manatos' },
      metadata: { entityKey: 'people' },
    });
    expect(surfaces.find(surface.id)).toBeNull();
    expect(surfaces.activeSurface()?.id).toBe(page.id);
    runtime.dispose();
  });

  it('supports save-and-continue without closing the popup while preserving SurfaceResult shape', async () => {
    const surfaces = new SurfaceRuntime();
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'owner' });
    const { surface, runtime } = openPopup(surfaces, page.id);
    runtime.initialize();

    const result = await runtime.completeSave({
      value: 'person-2',
      record: { id: 'person-2', firstName: 'Yiannis', lastName: 'Manatos' },
      close: false,
    });

    expect(result).toMatchObject({ outcome: 'saved', surfaceId: surface.id, value: 'person-2' });
    expect(surfaces.find(surface.id)).toBe(surface);
    expect(surfaces.activeSurface()?.id).toBe(surface.id);
    runtime.dispose();
  });

  it('supports arbitrary popup nesting and restores each immediate parent during cleanup', async () => {
    const surfaces = new SurfaceRuntime();
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'root' });
    const first = openPopup(surfaces, page.id, 'view');
    first.runtime.initialize();
    const second = openPopup(surfaces, first.surface.id, 'view');
    second.runtime.initialize();
    const third = openPopup(surfaces, second.surface.id, 'view');
    third.runtime.initialize();

    await third.runtime.close();
    expect(surfaces.activeSurface()?.id).toBe(second.surface.id);
    await second.runtime.cancel();
    expect(surfaces.activeSurface()?.id).toBe(first.surface.id);
    await first.runtime.close();
    expect(surfaces.activeSurface()?.id).toBe(page.id);

    third.runtime.dispose();
    second.runtime.dispose();
    first.runtime.dispose();
  });

  it('keeps canonical view mode read-only and rejects persistence completion', async () => {
    const surfaces = new SurfaceRuntime();
    const page = surfaces.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'owner' });
    const { runtime } = openPopup(surfaces, page.id, 'view');
    runtime.initialize();

    await expect(runtime.completeSave({ record: { id: 'person-view' } })).rejects.toThrow(
      'view-only V2 entry popup cannot save',
    );
    runtime.dispose();
  });
});
