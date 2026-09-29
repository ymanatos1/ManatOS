import { describe, expect, it, vi } from 'vitest';

import { UiExpressionRuntime } from '../../src/runtime/v2/expression.js';
import { UiPolicyRuntime } from '../../src/runtime/v2/policy.js';
import {
  UiContext,
  type UiCtxChange,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';

function fixture() {
  const root: UiCtxObject = {
    ui: {
      level: {
        mode: 'edit',
        allowed: true,
        data: { fields: { name: { value: 'Before' } } },
      },
    },
    user: { permissions: { admin: true } },
  };
  const listeners = new Map<string, Set<(change: UiCtxChange) => void>>();
  const get = (path: string) =>
    path.split('.').reduce<unknown>((value, key) => (value as UiCtxObject)?.[key], root);
  const replace = (path: string, value: unknown) => {
    const parts = path.split('.');
    let target = root;
    for (const key of parts.slice(0, -1)) target = target[key] as UiCtxObject;
    target[parts.at(-1)!] = value as never;
    const change = { operation: 'replace', path, newValue: value };
    for (const [watched, callbacks] of listeners) {
      if (path === watched || path.startsWith(`${watched}.`)) {
        callbacks.forEach((callback) => callback(change));
      }
    }
    return value;
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
  return {
    context: new UiContext('ui.level', get('ui.level') as UiCtxObject, port),
    replace,
    listeners,
  };
}

describe('V2 CTX expression/dependency/policy runtime', () => {
  it('uses Shared process-global compilation and canonical CTX without copying values', () => {
    const { context, replace } = fixture();
    const expression = new UiExpressionRuntime<boolean>(
      context,
      { expression: "mode === 'edit' && allowed === true" },
      'data.fields.name.ux.enabled',
      'field enabled policy',
    );
    expect(expression.dependencies.map((item) => item.path)).toEqual(['mode', 'allowed']);
    expect(expression.evaluate()).toBe(true);
    replace('ui.level.allowed', false);
    expect(expression.evaluate()).toBe(false);
  });

  it('reacts through canonical CTX subscriptions and disposes dependency ownership', () => {
    const { context, replace, listeners } = fixture();
    const seen: boolean[] = [];
    const expression = new UiExpressionRuntime<boolean>(
      context,
      { expression: "mode === 'edit'" },
      'data.fields.name.ux.visible',
      'field visibility',
    );
    const dispose = expression.subscribe((value) => seen.push(value));
    replace('ui.level.mode', 'view');
    expect(seen).toEqual([false]);
    dispose();
    replace('ui.level.mode', 'edit');
    expect(seen).toEqual([false]);
    expect(listeners.get('ui.level')?.size ?? 0).toBe(0);
  });

  it('composes visible/enabled/readOnly/required without owning semantic state', () => {
    const { context, replace } = fixture();
    const policy = new UiPolicyRuntime(
      context,
      {
        visible: { expression: 'allowed === true' },
        enabled: true,
        readOnly: { expression: "mode === 'view'" },
        required: true,
      },
      'data.fields.name.ux',
    );
    expect(policy.evaluate()).toEqual({
      visible: true,
      enabled: true,
      readOnly: false,
      required: true,
    });
    replace('ui.level.mode', 'view');
    expect(policy.evaluate()).toEqual({
      visible: true,
      enabled: false,
      readOnly: true,
      required: true,
    });
    expect(context.get('data.fields.name.value')).toBe('Before');
  });
});
