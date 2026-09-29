import { describe, expect, it, vi } from 'vitest';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';
import {
  returnToCallerPersistence,
  type UiEntryPersistenceDefinition,
} from '../../src/runtime/v2/entry-persistence.js';
import { EntityEntrySurface } from '../../src/runtime/v2/entity-entry-surface.js';
import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const uiMetadata: SysBOUIMetadata = {
  key: 'TestEntity',
  list: { common: {}, views: { main: { label: 'Standard' } } },
  record: { tabs: [], fieldOverrides: {} },
  defaultUIView: 'main',
  uiViews: { main: { viewType: 'full' } },
};

function fixture(
  persistence?: UiEntryPersistenceDefinition,
  initialCollections?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>,
  adoptExisting = false,
) {
  const levelValue: UiCtxObject = {
    control: { presentation: {} },
    state: { lifecycle: 'created', active: false },
    data: adoptExisting
      ? {
          entry: { original: { name: 'Before' }, current: { name: 'Client' } },
          fields: { name: { value: 'Client', originalValue: 'Before' } },
          collections: {},
        }
      : { entry: {}, fields: {}, collections: {} },
  };
  const root: UiCtxObject = { ui: { level: levelValue } };
  const get = (path: string): unknown =>
    path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean)
      .reduce<unknown>(
        (v, key) => (v && typeof v === 'object' ? (v as UiCtxObject)[key] : undefined),
        root,
      );
  const replace = vi.fn((path: string, value: unknown) => {
    const parts = path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
    const key = parts.pop();
    let owner = root;
    for (const part of parts) {
      if (!owner[part] || typeof owner[part] !== 'object') owner[part] = {};
      owner = owner[part] as UiCtxObject;
    }
    if (key) owner[key] = value;
    const field = path.match(/\.fields\.([^.]+)\.value$/)?.[1];
    if (field)
      ((levelValue.data as UiCtxObject).entry as UiCtxObject).current = {
        ...(((levelValue.data as UiCtxObject).entry as UiCtxObject).current as UiCtxObject),
        [field]: value,
      };
    const originalField = path.match(/\.fields\.([^.]+)\.originalValue$/)?.[1];
    if (originalField)
      ((levelValue.data as UiCtxObject).entry as UiCtxObject).original = {
        ...(((levelValue.data as UiCtxObject).entry as UiCtxObject).original as UiCtxObject),
        [originalField]: value,
      };
    return value;
  });
  const port: UiCtxRuntimePort = {
    value: root,
    get,
    set: replace,
    replace,
    delete: vi.fn(),
    add: vi.fn(),
  };
  const context = new UiContext('ctx.ui.level', levelValue, port);
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'entry',
    { surface: 'entity-entry', host: 'page', entity: 'TestEntity', mode: 'edit' },
    context,
  );
  const surface = new EntityEntrySurface(level, context, {
    entityKey: 'TestEntity',
    mode: 'edit',
    uiMetadata,
    initialRecord: { name: 'Before' },
    fieldMetadata: {
      name: { key: 'name', label: 'Name', type: 'string', order: 1, required: true },
    },
    ...(initialCollections ? { initialCollections } : {}),
    ...(persistence ? { persistence } : {}),
  });
  if (adoptExisting) surface.adopt();
  else surface.prepare();
  surface.activate();
  return { context, surface, replace };
}

const strategy = (save: UiEntryPersistenceDefinition['save']): UiEntryPersistenceDefinition => ({
  id: 'test-repository',
  contractVersion: 1,
  kind: 'repository',
  save,
});

describe('V2 entry action and persistence ownership', () => {
  it('validates before persistence and does not call the strategy for invalid semantic state', async () => {
    const save = vi.fn(async () => ({ status: 'persisted' as const }));
    const { surface } = fixture(strategy(save));
    surface.field<string>('name').write('', { source: 'test' });
    const result = await surface.save();
    expect(result.status).toBe('invalid');
    expect(save).not.toHaveBeenCalled();
    expect(surface.dirty.evaluate()).toBe(true);
  });

  it('delegates Save once, reconciles authoritative current, then promotes final current to the clean baseline', async () => {
    const save = vi.fn(async () => ({ status: 'persisted' as const, record: { name: 'SERVER' } }));
    const { context, surface } = fixture(strategy(save));
    const field = surface.field<string>('name');
    const binding = field.binding;
    field.write('Client', { source: 'test' });
    const result = await surface.save();
    expect(save).toHaveBeenCalledWith({
      entityKey: 'TestEntity',
      mode: 'edit',
      current: { name: 'Client' },
      original: { name: 'Before' },
    });
    expect(result.status).toBe('saved');
    expect(context.get('data.entry.current')).toEqual({ name: 'SERVER' });
    expect(context.get('data.entry.original')).toEqual({ name: 'SERVER' });
    expect(surface.field('name')).toBe(field);
    expect(surface.field('name').binding).toBe(binding);
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('promotes an adopted Entry baseline without emitting a fake current-value change when persistence accepts the current value', async () => {
    const save = vi.fn(async (request) => ({
      status: 'returned' as const,
      record: request.current,
    }));
    const { context, surface, replace } = fixture(strategy(save), undefined, true);

    replace.mockClear();
    expect((await surface.save()).status).toBe('saved');

    expect(context.get('data.fields.name.value')).toBe('Client');
    expect(context.get('data.fields.name.originalValue')).toBe('Client');
    expect(
      replace.mock.calls.some(([path]) => path === 'ctx.ui.level.data.fields.name.value'),
    ).toBe(false);
    expect(
      replace.mock.calls.some(([path]) => path === 'ctx.ui.level.data.fields.name.originalValue'),
    ).toBe(true);
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('preserves adopted current and baseline for fields omitted from a partial persistence record', async () => {
    const save = vi.fn(async () => ({ status: 'persisted' as const, record: {} }));
    const { context, surface } = fixture(strategy(save), undefined, true);

    expect((await surface.save()).status).toBe('saved');
    expect(context.get('data.fields.name.value')).toBe('Client');
    expect(context.get('data.fields.name.originalValue')).toBe('Before');
    expect(surface.dirty.evaluate()).toBe(true);
  });

  it('promotes all final adopted current fields when persistence omits record because current is authoritative', async () => {
    const save = vi.fn(async () => ({ status: 'accepted' as const }));
    const { context, surface } = fixture(strategy(save), undefined, true);

    expect((await surface.save()).status).toBe('saved');
    expect(context.get('data.fields.name.value')).toBe('Client');
    expect(context.get('data.fields.name.originalValue')).toBe('Client');
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('promotes the exact final adopted current value as baseline so browser identity dirty becomes clean', async () => {
    const save = vi.fn(async (request) => ({
      status: 'persisted' as const,
      record: structuredClone(request.current),
    }));
    const { context, surface } = fixture(strategy(save), undefined, true);
    const objectValue = { id: 'value-1', label: 'Object value' };
    surface.field('name').write(objectValue as unknown as string, { source: 'test' });

    expect((await surface.save()).status).toBe('saved');
    expect(context.get('data.fields.name.value')).toBe(objectValue);
    expect(context.get('data.fields.name.originalValue')).toBe(objectValue);
    expect(
      Object.is(
        context.get('data.fields.name.originalValue'),
        context.get('data.fields.name.value'),
      ),
    ).toBe(true);
  });

  it('still reconciles an adopted Entry current value when persistence returns a different authoritative value', async () => {
    const save = vi.fn(async () => ({ status: 'returned' as const, record: { name: 'SERVER' } }));
    const { context, surface, replace } = fixture(strategy(save), undefined, true);

    replace.mockClear();
    expect((await surface.save()).status).toBe('saved');
    expect(context.get('data.fields.name.value')).toBe('SERVER');
    expect(context.get('data.fields.name.originalValue')).toBe('SERVER');
    expect(
      replace.mock.calls.some(([path]) => path === 'ctx.ui.level.data.fields.name.value'),
    ).toBe(true);
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('treats unchanged Save as a semantic no-op and requires persistence ownership only when work exists', async () => {
    const { surface } = fixture();
    expect((await surface.save()).status).toBe('unchanged');
    surface.field<string>('name').write('Changed', { source: 'test' });
    await expect(surface.save()).rejects.toThrow(/no persistence strategy/);
  });

  it('keeps related collection drafts parent-owned and commits them through the same entry persistence boundary', async () => {
    const save = vi.fn(async () => ({ status: 'committed' as const }));
    const { context, surface } = fixture(strategy(save), {
      contacts: [{ id: 'c1', value: 'Before' }],
    });
    const contacts = surface.collection('contacts');

    contacts.update((row) => row.id === 'c1', { value: 'After' }, 'test:child-return');
    contacts.add({ id: 'c2', value: 'Second' }, 'test:add');

    expect(surface.dirty.evaluate()).toBe(true);
    expect(context.get('data.collections.contacts.current')).toEqual([
      { id: 'c1', value: 'After' },
      { id: 'c2', value: 'Second' },
    ]);

    const result = await surface.save();
    expect(result.status).toBe('saved');
    expect(save).toHaveBeenCalledWith({
      entityKey: 'TestEntity',
      mode: 'edit',
      current: { name: 'Before' },
      original: { name: 'Before' },
      collections: {
        contacts: {
          original: [{ id: 'c1', value: 'Before' }],
          current: [
            { id: 'c1', value: 'After' },
            { id: 'c2', value: 'Second' },
          ],
        },
      },
    });
    expect(contacts.original()).toEqual(contacts.current());
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('reconciles parent collection drafts from authoritative aggregate persistence results', async () => {
    const save = vi.fn(async () => ({
      status: 'committed' as const,
      collections: {
        contacts: [
          { id: 'c1', value: 'SERVER' },
          { id: 'c2', value: 'Second', normalized: true },
        ],
      },
    }));
    const { surface } = fixture(strategy(save), {
      contacts: [{ id: 'c1', value: 'Before' }],
    });
    const contacts = surface.collection('contacts');
    contacts.update((row) => row.id === 'c1', { value: 'Client' }, 'test:update');
    contacts.add({ id: 'c2', value: 'Second' }, 'test:add');

    expect((await surface.save()).status).toBe('saved');
    expect(contacts.current()).toEqual([
      { id: 'c1', value: 'SERVER' },
      { id: 'c2', value: 'Second', normalized: true },
    ]);
    expect(contacts.original()).toEqual(contacts.current());
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('keeps collection edits as unsaved owner state until an explicit Save promotes them', () => {
    const { surface } = fixture(undefined, { contacts: [{ id: 'c1', value: 'Before' }] });
    const contacts = surface.collection('contacts');
    contacts.remove((row) => row.id === 'c1', 'test:remove');
    expect(contacts.current()).toEqual([]);
    expect(contacts.original()).toEqual([{ id: 'c1', value: 'Before' }]);
    expect(surface.dirty.evaluate()).toBe(true);
    surface.dispose();
  });

  it('returns arbitrary nested entry drafts to the immediate caller without crossing a repository boundary', async () => {
    const repositorySave = vi.fn();
    const ownerReturn = vi.fn(async (request) => ({
      status: 'returned' as const,
      record: request.current,
      data: { owner: 'aggregate-workspace' },
    }));
    const persistence = returnToCallerPersistence('nested-owner-return', ownerReturn);
    const { surface } = fixture(persistence, {
      contacts: [{ id: 'c1', value: 'Before' }],
    });

    surface.field<string>('name').write('Nested change', { source: 'test' });
    surface.collection('contacts').add({ id: 'c2', value: 'Child draft' }, 'test:nested-child');

    const result = await surface.save();
    expect(result.status).toBe('saved');
    expect(ownerReturn).toHaveBeenCalledOnce();
    expect(ownerReturn).toHaveBeenCalledWith({
      entityKey: 'TestEntity',
      mode: 'edit',
      current: { name: 'Nested change' },
      original: { name: 'Before' },
      collections: {
        contacts: {
          original: [{ id: 'c1', value: 'Before' }],
          current: [
            { id: 'c1', value: 'Before' },
            { id: 'c2', value: 'Child draft' },
          ],
        },
      },
    });
    expect(repositorySave).not.toHaveBeenCalled();
    expect(surface.dirty.evaluate()).toBe(false);
  });

  it('rejects a return-to-caller strategy that accidentally crosses a different persistence contract', async () => {
    const persistence = returnToCallerPersistence('bad-owner-return', async () => ({
      status: 'persisted' as const,
    }));
    const { surface } = fixture(persistence);
    surface.field<string>('name').write('Changed', { source: 'test' });
    await expect(surface.save()).rejects.toThrow(/must return status 'returned'/);
    expect(surface.dirty.evaluate()).toBe(true);
  });
});
