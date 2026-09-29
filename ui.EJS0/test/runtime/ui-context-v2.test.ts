import { describe, expect, it, vi } from 'vitest';

import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';

describe('UiContext V2 canonical CTX reference', () => {
  it('keeps the exact canonical object and resolves subordinate contexts without copying', () => {
    const field = { value: 'Admin' };
    const level = { fields: { userName: field } };
    const port: UiCtxRuntimePort = {
      value: { ui: { level } },
      get: (path) => (path === 'ctx.ui.level.data.fields.userName' ? field : undefined),
      set: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
      add: vi.fn(),
    };
    const context = new UiContext('ctx.ui.level', level, port);
    const child = context.child('data.fields.userName');

    expect(context.value).toBe(level);
    expect(child?.value).toBe(field);
    expect(child?.path).toBe('ctx.ui.level.data.fields.userName');
  });

  it('routes writes through the one canonical CTX mutation authority', () => {
    const set = vi.fn();
    const replace = vi.fn();
    const remove = vi.fn();
    const add = vi.fn();
    const level: UiCtxObject = {};
    const port: UiCtxRuntimePort = {
      value: { ui: { level } },
      get: vi.fn(),
      set,
      replace,
      delete: remove,
      add,
    };
    const context = new UiContext('ctx.ui.level', level, port);

    context.set('data.fields.name.value', 'Yiannis');
    context.replace('state.dirty', true);
    context.add('data.resources.items', { id: 'x' });
    context.delete('state.transient');

    expect(set).toHaveBeenCalledWith('ctx.ui.level.data.fields.name.value', 'Yiannis', undefined);
    expect(replace).toHaveBeenCalledWith('ctx.ui.level.state.dirty', true, undefined);
    expect(add).toHaveBeenCalledWith('ctx.ui.level.data.resources.items', { id: 'x' }, undefined);
    expect(remove).toHaveBeenCalledWith('ctx.ui.level.state.transient', undefined);
  });
});
