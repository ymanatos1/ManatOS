import { describe, expect, it, vi } from 'vitest';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';

import { EmbeddedCollectionEntrySession } from '../../src/runtime/v2/collection-entry.js';
import { EntityEntrySurface } from '../../src/runtime/v2/entity-entry-surface.js';
import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const uiMetadata: SysBOUIMetadata = {
  key: 'Contact',
  list: { common: {}, views: { main: { label: 'Standard' } } },
  record: { tabs: [], fieldOverrides: {} },
  defaultUIView: 'main',
  uiViews: { main: { viewType: 'full' } },
};

function fixture() {
  const levelValue: UiCtxObject = {
    control: { presentation: {} },
    state: { lifecycle: 'created', active: false },
    data: { entry: {}, fields: {}, collections: {} },
  };
  const root: UiCtxObject = { ui: { level: levelValue } };
  const parts = (path: string) =>
    path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
  const get = (path: string): unknown =>
    parts(path).reduce<unknown>(
      (v, key) => (v && typeof v === 'object' ? (v as UiCtxObject)[key] : undefined),
      root,
    );
  const replace = vi.fn((path: string, value: unknown) => {
    const keys = parts(path);
    const key = keys.pop()!;
    let owner = root;
    for (const part of keys) {
      if (!owner[part] || typeof owner[part] !== 'object') owner[part] = {};
      owner = owner[part] as UiCtxObject;
    }
    owner[key] = value;
    const field = path.match(/\.fields\.([^.]+)\.value$/)?.[1];
    if (field) {
      const levelPath = path.slice(0, path.indexOf('.fields.'));
      const level = get(levelPath) as UiCtxObject;
      (level.entry as UiCtxObject).current = {
        ...((level.entry as UiCtxObject).current as UiCtxObject),
        [field]: value,
      };
    }
    return value;
  });
  const remove = vi.fn((path: string) => {
    const keys = parts(path);
    const key = keys.pop()!;
    let owner = root;
    for (const part of keys) owner = owner[part] as UiCtxObject;
    delete owner[key];
  });
  const port: UiCtxRuntimePort = {
    value: root,
    get,
    set: replace,
    replace,
    delete: remove,
    add: replace,
  };
  const context = new UiContext('ctx.ui.level', levelValue, port);
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'owner',
    { surface: 'entity-entry', host: 'page', entity: 'Principal', mode: 'edit' },
    context,
  );
  const owner = new EntityEntrySurface(level, context, {
    entityKey: 'Principal',
    mode: 'edit',
    uiMetadata,
    initialRecord: { id: 'p1' },
    fieldMetadata: {},
    initialCollections: { contacts: [{ id: 'c1', value: 'Before' }] },
  });
  owner.prepare();
  owner.activate();
  return { root, runtime, owner };
}

const childOptions = {
  childId: 'contact-editor',
  collectionKey: 'contacts',
  entityKey: 'Contact',
  uiMetadata,
  fieldMetadata: { value: { key: 'value', label: 'Value', type: 'string' as const, order: 1 } },
};

describe('V2 embedded collection member entry ownership', () => {
  it('returns an edited child record into the parent collection draft and disposes the nested level on Save', async () => {
    const { root, runtime, owner } = fixture();
    const session = EmbeddedCollectionEntrySession.open(runtime, owner, {
      ...childOptions,
      mode: 'edit',
      rowIndex: 0,
      initialRecord: { id: 'c1', value: 'Before' },
    });
    expect(session.surface.level.parent).toBe(owner.level);
    expect(session.surface.level.invocation?.host).toBe('embedded');
    expect(session.surface.context.path).toBe('ctx.ui.level.level');

    session.surface.field<string>('value').write('After', { source: 'test' });
    expect((await session.save()).status).toBe('saved');
    expect(owner.collection('contacts').current()).toEqual([{ id: 'c1', value: 'After' }]);
    expect(owner.collection('contacts').original()).toEqual([{ id: 'c1', value: 'Before' }]);
    expect(owner.dirty.evaluate()).toBe(true);
    expect(runtime.find('contact-editor')).toBeUndefined();
    expect((root.ui as UiCtxObject).level).not.toHaveProperty('level');
  });

  it('discards a cancelled child draft without mutating the parent collection', async () => {
    const { runtime, owner } = fixture();
    const session = EmbeddedCollectionEntrySession.open(runtime, owner, {
      ...childOptions,
      mode: 'edit',
      rowIndex: 0,
      initialRecord: { id: 'c1', value: 'Before' },
    });
    session.surface.field<string>('value').write('Discard me', { source: 'test' });
    await session.cancel();
    expect(owner.collection('contacts').current()).toEqual([{ id: 'c1', value: 'Before' }]);
    expect(owner.dirty.evaluate()).toBe(false);
    expect(runtime.find('contact-editor')).toBeUndefined();
  });

  it('derives edit input from the parent draft and returns created members through the same owner', async () => {
    const { runtime, owner } = fixture();
    const edit = EmbeddedCollectionEntrySession.edit(runtime, owner, {
      ...childOptions,
      rowIndex: 0,
    });
    expect(edit.surface.field<string>('value').read()).toBe('Before');
    await edit.cancel();

    const create = EmbeddedCollectionEntrySession.create(runtime, owner, {
      ...childOptions,
      childId: 'contact-create',
      initialRecord: { value: '' },
    });
    create.surface.field<string>('value').write('Second', { source: 'test' });
    expect((await create.save()).status).toBe('saved');
    expect(owner.collection('contacts').current()).toEqual([
      { id: 'c1', value: 'Before' },
      { value: 'Second' },
    ]);
  });

  it('supports selector exclusion and duplicate-safe selection inside the parent draft', () => {
    const { owner } = fixture();
    const collection = owner.collection('contacts');
    const candidates = [
      { id: 'c1', value: 'Already selected' },
      { id: 'c2', value: 'Available' },
    ];

    expect(collection.selectable(candidates)).toEqual([{ id: 'c2', value: 'Available' }]);
    expect(collection.select(candidates[0]!)).toBe(false);
    expect(collection.select(candidates[1]!)).toBe(true);
    expect(collection.current()).toEqual([
      { id: 'c1', value: 'Before' },
      { id: 'c2', value: 'Available' },
    ]);
    expect(owner.dirty.evaluate()).toBe(true);
  });
});
