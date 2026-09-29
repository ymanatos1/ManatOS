import { describe, expect, it, vi } from 'vitest';
import { allManatOSRelationshipDefinitions, relationshipDefinition } from '@manatos/shared';
import {
  CtxBinding,
  EntityFieldBinding,
  EntityRelationshipBinding,
} from '../../src/runtime/v2/binding.js';
import {
  UiContext,
  type UiCtxChange,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';

const makePort = (level: UiCtxObject) => {
  let subscriber: ((change: UiCtxChange) => void) | undefined;
  const replace = vi.fn((path: string, value: unknown) => {
    if (path.endsWith('.fields.name.value')) (level.fields as any).name.value = value;
  });
  const port: UiCtxRuntimePort = {
    value: { ui: { level } },
    get: (path) =>
      path.endsWith('.fields.name.value') ? (level.fields as any).name.value : undefined,
    set: vi.fn(),
    replace,
    delete: vi.fn(),
    add: vi.fn(),
    subscribe: (_path, listener) => {
      subscriber = listener;
      return () => {
        subscriber = undefined;
      };
    },
  };
  return { port, replace, emit: (change: UiCtxChange) => subscriber?.(change) };
};

describe('V2 CTX-native bindings', () => {
  it('keeps no semantic value and reads/writes through canonical CTX', () => {
    const level = { fields: { name: { value: 'Before' } } };
    const { port, replace } = makePort(level);
    const binding = new EntityFieldBinding<string>(
      new UiContext('ctx.ui.level', level, port),
      'name',
    );
    expect(binding.read()).toBe('Before');
    binding.write('After', { source: 'test' });
    expect(replace).toHaveBeenCalledWith('ctx.ui.level.data.fields.name.value', 'After', {
      source: 'test',
    });
    expect(binding.read()).toBe('After');
    expect(binding.currentPath).toBe('ctx.ui.level.data.entry.current.name');
  });

  it('resolves arbitrary level-relative CTX paths and rejects writes on read-only bindings', () => {
    const level = { fields: { name: { value: 'A' } } };
    const { port } = makePort(level);
    const binding = new CtxBinding<string>(
      new UiContext('ctx.ui.level', level, port),
      'data.fields.name.value',
      'read',
    );
    expect(binding.path).toBe('ctx.ui.level.data.fields.name.value');
    expect(() => binding.write('B')).toThrow(/read-only/);
  });

  it('subscribes through the canonical CTX subscription authority and rereads canonical state', () => {
    const level = { fields: { name: { value: 'A' } } };
    const { port, emit } = makePort(level);
    const binding = new EntityFieldBinding<string>(
      new UiContext('ctx.ui.level', level, port),
      'name',
    );
    const listener = vi.fn();
    const release = binding.subscribe(listener, { label: 'name editor' });
    (level.fields as any).name.value = 'B';
    emit({ operation: 'replace', path: binding.path, newValue: 'B' });
    expect(listener).toHaveBeenCalledWith('B', expect.objectContaining({ path: binding.path }));
    release();
  });

  it('binds relationship navigation to live CTX endpoint values without owning semantic state', () => {
    const definition = relationshipDefinition(
      allManatOSRelationshipDefinitions,
      'sys-principals',
      'user',
    );
    expect(definition).toBeDefined();
    const level = { fields: { userId: { value: 'user-1' } } };
    const port: UiCtxRuntimePort = {
      value: { ui: { level } },
      get: (path) =>
        path.endsWith('.fields.userId.value') ? (level.fields as any).userId.value : undefined,
      set: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
      add: vi.fn(),
      subscribe: () => () => undefined,
    };
    const binding = new EntityRelationshipBinding(
      new UiContext('ctx.ui.level', level, port),
      definition!,
      () => [
        { id: 'user-1', userName: 'admin' },
        { id: 'user-2', userName: 'other' },
      ],
    );
    expect(binding.kind).toBe('entity-relationship');
    expect(binding.cardinality).toBe('one-to-one');
    expect(binding.read()).toEqual({ id: 'user-1', userName: 'admin' });
    (level.fields as any).userId.value = null;
    expect(binding.read()).toBeNull();
  });
});
