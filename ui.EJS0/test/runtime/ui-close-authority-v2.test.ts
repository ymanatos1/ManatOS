import { describe, expect, it, vi } from 'vitest';

import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const fixture = (dirty: boolean, policy?: 'prompt' | 'discard') => {
  const value: UiCtxObject = {
    control: { id: 'entry' },
    state: { lifecycle: 'active', active: true, dirty },
  };
  const root: UiCtxObject = { ui: { level: value } };
  const resolvePath = (path: string): unknown => {
    const segments = path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
    let cursor: unknown = root;
    for (const segment of segments) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
      cursor = (cursor as UiCtxObject)[segment];
    }
    return cursor;
  };
  const replacePath = (path: string, next: unknown): unknown => {
    const segments = path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
    let cursor = root;
    for (const segment of segments.slice(0, -1)) {
      cursor = cursor[segment] as UiCtxObject;
    }
    cursor[segments.at(-1)!] = next;
    return next;
  };
  const deletePath = (path: string): void => {
    const segments = path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
    let cursor = root;
    for (const segment of segments.slice(0, -1)) {
      cursor = cursor[segment] as UiCtxObject;
    }
    delete cursor[segments.at(-1)!];
  };
  const port: UiCtxRuntimePort = {
    value: root,
    get: resolvePath,
    set: replacePath,
    replace: replacePath,
    delete: deletePath,
    add: replacePath,
    subscribe: () => () => {},
  };
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'entry',
    {
      surface: 'entry',
      host: 'page',
      ...(policy ? { behavior: { closePolicy: { dirty: policy } } } : {}),
    },
    new UiContext('ctx.ui.level', value, port),
  );
  return { runtime, level };
};

describe('UiRuntime single close authority', () => {
  it('refuses to destroy a dirty default surface without Save/Discard/Cancel decision', async () => {
    const { runtime, level } = fixture(true);
    expect((await runtime.requestClose(level)).status).toBe('decision-required');
    expect(runtime.find('entry')).toBe(level);
  });

  it('Cancel keeps the dirty surface live', async () => {
    const { runtime, level } = fixture(true);
    expect((await runtime.requestClose(level, { decision: 'cancel' })).status).toBe('cancelled');
    expect(runtime.find('entry')).toBe(level);
  });

  it('Save must succeed before destruction', async () => {
    const { runtime, level } = fixture(true);
    const save = vi.fn(async () => true);
    expect((await runtime.requestClose(level, { decision: 'save', save })).status).toBe('closed');
    expect(save).toHaveBeenCalledOnce();
  });

  it('runs discard through the same authority before destruction', async () => {
    const { runtime, level } = fixture(true);
    const discard = vi.fn(async () => true);
    expect((await runtime.requestClose(level, { decision: 'discard', discard })).status).toBe(
      'closed',
    );
    expect(discard).toHaveBeenCalledOnce();
    expect(runtime.find('entry')).toBeUndefined();
  });

  it('keeps the surface live when canonical Save or Discard fails', async () => {
    for (const decision of ['save', 'discard'] as const) {
      const { runtime, level } = fixture(true);
      const operation = vi.fn(async () => false);
      const result = await runtime.requestClose(level, {
        decision,
        ...(decision === 'save' ? { save: operation } : { discard: operation }),
      });
      expect(result.status).toBe('failed');
      expect(runtime.find('entry')).toBe(level);
    }
  });

  it('an explicit parent Discard abandons dirty descendants and then closes the owner', async () => {
    const { runtime, level } = fixture(true);
    const childValue: UiCtxObject = {
      control: { id: 'child' },
      state: { lifecycle: 'active', active: true, dirty: true },
    };
    (level.context!.get() as UiCtxObject).level = childValue;
    const child = runtime.adoptChild(
      level,
      'child',
      { surface: 'entry', host: 'popup' },
      new UiContext('ctx.ui.level.level', childValue, level.context!.port),
    );
    const discard = vi.fn(async () => true);

    const result = await runtime.requestClose(level, { decision: 'discard', discard });

    expect(result.status).toBe('closed');
    expect(discard).toHaveBeenCalledOnce();
    expect(runtime.find(child.id)).toBeUndefined();
    expect(runtime.find(level.id)).toBeUndefined();
  });

  it('supports the explicit invocation dirty-discard exception without bypassing requestClose', async () => {
    const { runtime, level } = fixture(true, 'discard');
    const discard = vi.fn(async () => true);
    expect((await runtime.requestClose(level, { discard })).status).toBe('closed');
    expect(discard).toHaveBeenCalledOnce();
  });

  it('announces authorized disposal before canonical CTX removal', async () => {
    const { runtime, level } = fixture(false);
    const order: string[] = [];
    const context = level.context!;
    const result = await runtime.requestClose(level, {
      dispose: (closingLevel) => {
        order.push(`dispose:${closingLevel.id}`);
        expect(context.get('state.lifecycle')).toBe('disposed');
        expect(context.get()).toBeDefined();
      },
    });
    order.push(context.port.get(context.path) === undefined ? 'ctx-removed' : 'ctx-live');
    expect(result.status).toBe('closed');
    expect(order).toEqual(['dispose:entry', 'ctx-removed']);
  });
});
