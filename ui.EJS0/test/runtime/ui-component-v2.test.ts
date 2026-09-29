import { describe, expect, it, vi } from 'vitest';

import { CtxBinding, EntityFieldBinding } from '../../src/runtime/v2/binding.js';
import { UiComponentInstance, type UiComponentDefinition } from '../../src/runtime/v2/component.js';
import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const fixture = () => {
  const levelValue: UiCtxObject = {
    control: { id: 'entry' },
    state: { lifecycle: 'active', active: true },
    data: { fields: { name: { value: 'Before' } } },
    components: { nameEditor: { state: {} } },
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
  const replace = (path: string, value: unknown) => {
    const parts = path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
    const key = parts.pop();
    let owner = root;
    for (const part of parts) owner = owner[part] as UiCtxObject;
    if (key) owner[key] = value;
    return value;
  };
  const port: UiCtxRuntimePort = {
    value: root,
    get,
    set: replace,
    replace,
    delete: vi.fn(),
    add: vi.fn(),
  };
  const levelContext = new UiContext('ctx.ui.level', levelValue, port);
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'entry',
    { surface: 'entry', host: 'page' },
    levelContext,
  );
  return { level, levelContext };
};

describe('V2 typed component runtime', () => {
  it('composes level + component CTX + compatible binding without copying semantic values', () => {
    const { level, levelContext } = fixture();
    const componentContext = levelContext.child('components.nameEditor');
    expect(componentContext).not.toBeNull();
    const binding = new EntityFieldBinding<string>(levelContext, 'name');
    const create = vi.fn(() => ({}));
    const definition: UiComponentDefinition<EntityFieldBinding<string>> = {
      id: 'text-editor',
      contractVersion: 1,
      binding: { kinds: new Set(['entity-field']), writable: true },
      create,
    };
    const instance = new UiComponentInstance(
      'nameEditor',
      level,
      componentContext!,
      definition,
      binding,
    );

    expect(create).toHaveBeenCalledWith({
      id: 'nameEditor',
      level,
      context: componentContext,
      binding,
    });
    expect(instance.lifecycle).toBe('created');
    binding.write('After');
    expect(binding.read()).toBe('After');
  });

  it('rejects incompatible binding kinds and read-only bindings before controller creation', () => {
    const { level, levelContext } = fixture();
    const context = levelContext.child('components.nameEditor')!;
    const create = vi.fn(() => ({}));
    const definition: UiComponentDefinition = {
      id: 'editor',
      contractVersion: 1,
      binding: { kinds: new Set(['entity-field']), writable: true },
      create,
    };

    expect(
      () =>
        new UiComponentInstance(
          'bad-kind',
          level,
          context,
          definition,
          new CtxBinding(levelContext, 'data.fields.name.value'),
        ),
    ).toThrow(/requires binding kind/);
    expect(
      () =>
        new UiComponentInstance(
          'readonly',
          level,
          context,
          definition,
          new EntityFieldBinding(levelContext, 'name', 'read'),
        ),
    ).toThrow(/requires a writable binding/);
    expect(create).not.toHaveBeenCalled();
  });

  it('owns view/component-lifetime disposers and disposes them exactly once', () => {
    const { level, levelContext } = fixture();
    const calls: string[] = [];
    const definition: UiComponentDefinition<EntityFieldBinding<string>> = {
      id: 'lifecycle-editor',
      contractVersion: 1,
      create: () => ({
        mount: () => calls.push('mount'),
        unmount: () => calls.push('unmount'),
        dispose: () => calls.push('controller-dispose'),
      }),
    };
    const instance = new UiComponentInstance(
      'nameEditor',
      level,
      levelContext.child('components.nameEditor')!,
      definition,
      new EntityFieldBinding(levelContext, 'name'),
    );
    instance.own(() => calls.push('subscription-dispose'));

    instance.mount();
    instance.dispose();
    instance.dispose();

    expect(instance.lifecycle).toBe('disposed');
    expect(calls).toEqual(['mount', 'unmount', 'subscription-dispose', 'controller-dispose']);
  });
});
