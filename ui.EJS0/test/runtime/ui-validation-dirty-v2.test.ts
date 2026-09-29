import { describe, expect, it, vi } from 'vitest';

import { UiDirtyRuntime, semanticEqual } from '../../src/runtime/v2/dirty.js';
import { EntityFieldRuntime } from '../../src/runtime/v2/field.js';
import {
  UiContext,
  type UiCtxChange,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';
import { EntityEntryValidationRuntime } from '../../src/runtime/v2/validation.js';

function fixture() {
  const root: UiCtxObject = {
    ui: {
      level: {
        data: {
          entry: { original: { name: 'Before' }, current: { name: 'Before' } },
          fields: { name: { value: 'Before' } },
        },
        state: {},
      },
    },
  };
  const listeners = new Map<string, Set<(change: UiCtxChange) => void>>();
  const get = (path: string) =>
    path.split('.').reduce<unknown>((value, key) => (value as UiCtxObject)?.[key], root);
  const replace = (path: string, value: unknown) => {
    const parts = path.split('.');
    let owner = root;
    for (const key of parts.slice(0, -1)) owner = owner[key] as UiCtxObject;
    const last = parts.at(-1)!;
    const oldValue = owner[last];
    owner[last] = value;
    const field = path.match(/\.fields\.([^.]+)\.value$/)?.[1];
    if (field) {
      const level = get('ui.level') as UiCtxObject;
      const entry = (level.data as UiCtxObject).entry as UiCtxObject;
      const current = entry.current as UiCtxObject;
      entry.current = { ...current, [field]: value };
      emit('ui.level.data.entry.current', current, entry.current);
    }
    emit(path, oldValue, value);
    return value;
  };
  const emit = (path: string, oldValue: unknown, newValue: unknown) => {
    const change: UiCtxChange = { operation: 'replace', path, oldValue, newValue };
    for (const [watched, callbacks] of listeners) {
      if (path === watched || path.startsWith(`${watched}.`))
        callbacks.forEach((callback) => callback(change));
    }
  };
  const port: UiCtxRuntimePort = {
    value: root,
    get,
    set: replace,
    replace,
    delete: vi.fn(),
    add: vi.fn(),
    subscribe: (path, listener) => {
      const set = listeners.get(path) ?? new Set();
      set.add(listener);
      listeners.set(path, set);
      return () => set.delete(listener);
    },
  };
  const levelValue = get('ui.level') as UiCtxObject;
  const context = new UiContext('ui.level', levelValue, port);
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'entry',
    { surface: 'entity-entry', host: 'page', entity: 'Test' },
    context,
  );
  const field = new EntityFieldRuntime<string>(
    level,
    context,
    { key: 'name', label: 'Name', type: 'string', order: 1, required: true, minLength: 3 },
    undefined,
    'read-write',
  );
  return { context, field, listeners };
}

describe('V2 validation and dirty ownership', () => {
  it('derives dirty only from canonical original/current and returns clean when value is restored', () => {
    const { context, field, listeners } = fixture();
    const dirty = new UiDirtyRuntime(context);
    dirty.start();
    expect(context.get('state.dirty')).toBe(false);
    field.write('After');
    expect(context.get('state.dirty')).toBe(true);
    field.write('Before');
    expect(context.get('state.dirty')).toBe(false);
    dirty.dispose();
    expect(listeners.get('ui.level.data.entry.current')?.size ?? 0).toBe(0);
  });

  it('supports a surface-specific semantic evaluator without changing the canonical dirty projection', () => {
    const { context, field } = fixture();
    const dirty = new UiDirtyRuntime(context, {
      evaluate: (ctx) => ctx.get('data.entry.current.name') === 'After',
    });
    expect(dirty.refresh()).toBe(false);
    field.write('After');
    expect(dirty.refresh()).toBe(true);
    expect(context.get('state.dirty')).toBe(true);
    field.write('Before');
    expect(dirty.refresh()).toBe(false);
    expect(context.get('state.dirty')).toBe(false);
  });

  it('uses structural semantic equality rather than object identity or key order', () => {
    expect(semanticEqual({ a: 1, nested: { b: [2, 3] } }, { nested: { b: [2, 3] }, a: 1 })).toBe(
      true,
    );
    expect(semanticEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(semanticEqual([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(semanticEqual([1, 2], [2, 1])).toBe(false);
    expect(semanticEqual(null, null)).toBe(true);
    expect(semanticEqual(null, {})).toBe(false);
    expect(semanticEqual('same', 'same')).toBe(true);
    expect(semanticEqual('same', 'different')).toBe(false);
  });

  it('validates canonical field metadata/bindings and projects one CTX-observable result', () => {
    const { context, field } = fixture();
    const validation = new EntityEntryValidationRuntime(context, new Map([['name', field]]));
    field.write('');
    expect(validation.validate()).toMatchObject({
      valid: false,
      issues: [{ code: 'required', fieldKey: 'name' }],
    });
    expect(context.get('validation.valid')).toBe(false);
    expect(context.get('validation.fields.name.valid')).toBe(false);
    field.write('ab');
    expect(validation.validate().issues[0]?.code).toBe('minLength');
    field.write('Valid');
    expect(validation.validate()).toEqual({ valid: true, issues: [] });
    expect(context.get('validation.valid')).toBe(true);
  });
});
