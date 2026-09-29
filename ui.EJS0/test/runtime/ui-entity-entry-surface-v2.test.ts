import { describe, expect, it, vi } from 'vitest';
import type { SysBOUIMetadata } from '@manatos/shared';

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
  uiViews: {
    main: { viewType: 'full', label: 'Standard' },
    quick: { viewType: 'quick', label: 'Quick' },
  },
};

function fixture(
  mode: 'create' | 'edit' | 'view' = 'edit',
  initialCollectionResources?: Readonly<
    Record<
      string,
      {
        readonly original: readonly Readonly<Record<string, unknown>>[];
        readonly current: readonly Readonly<Record<string, unknown>>[];
        readonly references?: Readonly<Record<string, readonly unknown[]>>;
      }
    >
  >,
) {
  const levelValue: UiCtxObject = {
    control: { presentation: {} },
    state: { lifecycle: 'created', active: false },
    data: { entry: {}, fields: {}, collections: {} },
  };
  const root: UiCtxObject = { ui: { level: levelValue } };
  const get = (path: string): unknown => {
    let value: unknown = root;
    for (const part of path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean)) {
      if (!value || typeof value !== 'object') return undefined;
      value = (value as UiCtxObject)[part];
    }
    return value;
  };
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
    // Mirror the production canonical field-write authority for this fixture.
    const fieldMatch = path.match(/\.fields\.([^.]+)\.value$/);
    if (fieldMatch?.[1]) {
      ((levelValue.data as UiCtxObject).entry as UiCtxObject).current = {
        ...(((levelValue.data as UiCtxObject).entry as UiCtxObject).current as UiCtxObject),
        [fieldMatch[1]]: value,
      };
      levelValue.state = { ...(levelValue.state as UiCtxObject), dirty: true };
    }
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
    'entry-1',
    { surface: 'entity-entry', host: 'page', entity: 'TestEntity', view: 'main', mode },
    context,
  );
  const surface = new EntityEntrySurface(level, context, {
    entityKey: 'TestEntity',
    mode,
    uiMetadata,
    initialRecord: { name: 'Before', nested: { n: 1 } },
    ...(initialCollectionResources ? { initialCollectionResources } : {}),
    fieldMetadata: {
      name: { key: 'name', label: 'Name', type: 'string', order: 1 },
      nested: { key: 'nested', label: 'Nested', type: 'string', order: 2 },
    },
  });
  return { context, level, replace, surface };
}

describe('V2 Entity Entry surface', () => {
  it('initializes canonical original/current/fields once and exposes field bindings over that CTX', () => {
    const { context, surface } = fixture();
    surface.prepare();
    surface.activate();

    expect(context.get('data.entry.original')).toEqual({ name: 'Before', nested: { n: 1 } });
    expect(context.get('data.entry.current')).toEqual({ name: 'Before', nested: { n: 1 } });
    expect(context.get('data.entry.original')).not.toBe(context.get('data.entry.current'));

    surface.field<string>('name').write('After', { source: 'test' });
    expect(context.get('data.entry.current.name')).toBe('After');
    expect(context.get('data.entry.original.name')).toBe('Before');
    expect(context.get('state.dirty')).toBe(true);
    expect(() => surface.prepare()).toThrow(/already prepared/);
  });

  it('imports owner-provided Entry state only through canonical field authorities', () => {
    const { replace, surface } = fixture();
    surface.prepare();
    replace.mockClear();

    surface.importEntry({
      entityKey: 'TestEntity',
      identity: 'entry-1',
      identityField: 'id',
      current: { name: 'Owned current', nested: { n: 2 } },
      original: { name: 'Owned original', nested: { n: 1 } },
      resources: {},
    });

    const paths = replace.mock.calls.map(([path]) => path);
    expect(paths).not.toContain('ctx.ui.level.data.entry.original');
    expect(paths).not.toContain('ctx.ui.level.data.entry.current');
    expect(paths).toContain('ctx.ui.level.data.fields.name.originalValue');
    expect(paths).toContain('ctx.ui.level.data.fields.name.value');
  });

  it('switches effective uiView without replacing UiLevel identity or semantic entry state', () => {
    const { context, level, surface } = fixture();
    surface.prepare();
    const current = context.get('data.entry.current');
    const original = context.get('data.entry.original');
    const field = surface.field('name');
    const binding = field.binding;

    const resolved = surface.switchView('quick');

    expect(resolved.key).toBe('quick');
    expect(resolved.viewType).toBe('quick');
    expect(surface.level).toBe(level);
    expect(context.get('data.entry.current')).toBe(current);
    expect(context.get('data.entry.original')).toBe(original);
    expect(surface.field('name')).toBe(field);
    expect(surface.field('name').binding).toBe(binding);
    expect(context.get('control.presentation.uiView')).toEqual({
      key: 'quick',
      viewType: 'quick',
      label: 'Quick',
    });
    expect(level.invocation?.view).toBe('main');
  });

  it('makes view-mode field bindings read-only and rejects mismatched entity ownership', () => {
    const { surface } = fixture('view');
    surface.prepare();
    expect(surface.field('name').writable).toBe(false);
    expect(() => surface.field('name').write('No')).toThrow(/read-only/);

    const { context, level } = fixture();
    expect(
      () =>
        new EntityEntrySurface(level, context, {
          entityKey: 'OtherEntity',
          mode: 'edit',
          uiMetadata,
          initialRecord: {},
          fieldMetadata: {},
        }),
    ).toThrow(/invocation targets/);
  });
});

// Rematerialization invariants are intentionally tested on the semantic surface rather than DOM.
describe('V2 Entity Entry uiView rematerialization', () => {
  it('replaces only view-owned presentation while preserving semantic runtime identities', () => {
    const { context, level, surface } = fixture();
    surface.prepare();
    surface.activate();
    const firstPresentation = surface.presentation;
    const current = context.get('data.entry.current');
    const original = context.get('data.entry.original');
    const field = surface.field('name');
    const binding = field.binding;
    const dirty = surface.dirty;
    const validation = surface.validation;

    surface.switchView('quick');

    expect(firstPresentation?.lifecycle).toBe('disposed');
    expect(surface.presentation).not.toBe(firstPresentation);
    expect(surface.presentation?.lifecycle).toBe('mounted');
    expect(surface.level).toBe(level);
    expect(context.get('data.entry.current')).toBe(current);
    expect(context.get('data.entry.original')).toBe(original);
    expect(surface.field('name')).toBe(field);
    expect(surface.field('name').binding).toBe(binding);
    expect(surface.dirty).toBe(dirty);
    expect(surface.validation).toBe(validation);
  });

  it('does not rematerialize when the already-effective uiView is selected again', () => {
    const { surface } = fixture();
    surface.prepare();
    const presentation = surface.presentation;
    surface.switchView('main');
    expect(surface.presentation).toBe(presentation);
  });

  it('adopts production collection-resource snapshots as parent-owned V2 drafts', () => {
    const { surface } = fixture('edit', {
      contacts: {
        original: [{ id: 'stale', value: 'Stale' }],
        current: [{ id: 'c1', value: 'Canonical' }],
        references: { type: [{ value: 'work', label: 'Work' }] },
      },
    });
    surface.prepare();

    expect(surface.collection('contacts').original()).toEqual([{ id: 'c1', value: 'Canonical' }]);
    expect(surface.collection('contacts').current()).toEqual([{ id: 'c1', value: 'Canonical' }]);
  });
});
