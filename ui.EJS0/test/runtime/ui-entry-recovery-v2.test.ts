import { describe, expect, it, vi } from 'vitest';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';
import { EntityEntrySurface } from '../../src/runtime/v2/entity-entry-surface.js';
import { UI_ENTRY_RECOVERY_FORMAT } from '../../src/runtime/v2/recovery.js';
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

function fixture(recoverable = true) {
  const levelValue: UiCtxObject = {
    control: { presentation: {} },
    state: { lifecycle: 'created', active: false },
    data: { entry: {}, fields: {}, collections: {} },
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
    {
      surface: 'entity-entry',
      host: 'page',
      entity: 'TestEntity',
      mode: 'edit',
      view: 'main',
      behavior: { recoverable },
    },
    context,
  );
  const surface = new EntityEntrySurface(level, context, {
    entityKey: 'TestEntity',
    mode: 'edit',
    uiMetadata,
    initialRecord: { name: 'Before', note: 'Same' },
    fieldMetadata: {
      name: { key: 'name', label: 'Name', type: 'string', order: 1 },
      note: { key: 'note', label: 'Note', type: 'string', order: 2 },
    },
    initialCollections: { contacts: [{ id: 'c1', value: 'Before' }] },
  });
  surface.prepare();
  surface.activate();
  return { surface, context };
}

describe('V2 semantic outage recovery', () => {
  it('captures an opening descriptor plus only semantic field deltas, never an intentional draft', () => {
    const { surface } = fixture();
    expect(surface.captureRecovery()).toBeNull();
    surface.field<string>('name').write('Changed', { source: 'test' });
    const snapshot = surface.captureRecovery();
    expect(snapshot).toEqual({
      format: UI_ENTRY_RECOVERY_FORMAT,
      opening: {
        invocation: {
          surface: 'entity-entry',
          host: 'page',
          entity: 'TestEntity',
          mode: 'edit',
          view: 'main',
          behavior: { recoverable: true },
        },
      },
      changes: { name: 'Changed' },
    });
    expect(snapshot).not.toHaveProperty('draft');
  });

  it('restores through canonical field bindings while preserving original baseline and dirty semantics', () => {
    const source = fixture();
    source.surface.field<string>('name').write('Recovered', { source: 'test' });
    const snapshot = source.surface.captureRecovery();
    if (!snapshot) throw new Error('Expected recovery snapshot.');
    const target = fixture();
    const field = target.surface.field('name');
    const binding = field.binding;
    target.surface.applyRecovery(snapshot);
    expect(target.context.get('data.entry.original')).toEqual({ name: 'Before', note: 'Same' });
    expect(target.context.get('data.entry.current')).toEqual({ name: 'Recovered', note: 'Same' });
    expect(target.surface.field('name')).toBe(field);
    expect(target.surface.field('name').binding).toBe(binding);
    expect(target.surface.dirty.evaluate()).toBe(true);
  });

  it('captures and restores changed parent-owned collection drafts through the same recovery snapshot', () => {
    const source = fixture();
    source.surface.collection('contacts').add({ id: 'c2', value: 'Recovered' }, 'test');
    const snapshot = source.surface.captureRecovery();
    if (!snapshot) throw new Error('Expected recovery snapshot.');
    expect(snapshot.changes).toEqual({});
    expect(snapshot.collections).toEqual({
      contacts: [
        { id: 'c1', value: 'Before' },
        { id: 'c2', value: 'Recovered' },
      ],
    });

    const target = fixture();
    target.surface.applyRecovery(snapshot);
    expect(target.surface.collection('contacts').original()).toEqual([
      { id: 'c1', value: 'Before' },
    ]);
    expect(target.surface.collection('contacts').current()).toEqual([
      { id: 'c1', value: 'Before' },
      { id: 'c2', value: 'Recovered' },
    ]);
    expect(target.surface.dirty.evaluate()).toBe(true);
  });

  it('opts non-recoverable invocations out and rejects a snapshot for a different semantic target', () => {
    expect(fixture(false).surface.captureRecovery()).toBeNull();
    const target = fixture();
    expect(() =>
      target.surface.applyRecovery({
        format: UI_ENTRY_RECOVERY_FORMAT,
        opening: {
          invocation: { surface: 'entity-entry', host: 'page', entity: 'Other', mode: 'edit' },
        },
        changes: { name: 'X' },
      }),
    ).toThrow(/does not target/);
  });
});
