import { describe, expect, it, vi } from 'vitest';

import { ContextTreeRuntime } from '../src/index.js';

describe('ContextTreeRuntime observation', () => {
  it('publishes one revision for an atomic root commit and exposes subscriber metadata', async () => {
    const runtime = new ContextTreeRuntime({
      runtime: { subsystems: {}, entities: {}, enums: {}, user: null as unknown },
      values: { one: 1 },
    });
    const all: number[] = [];
    const user: number[] = [];

    const unsubscribeAll = runtime.subscribe((mutation) => all.push(mutation.revision), {
      label: 'all-viewer',
    });
    const unsubscribeUser = runtime.subscribe((mutation) => user.push(mutation.revision), {
      label: 'user-viewer',
      path: 'ctx.user',
    });

    const nextUser = { id: 'u1' };
    runtime.setRootMembers({
      runtime: { subsystems: {}, entities: {}, enums: {}, user: nextUser },
    });

    await Promise.resolve();
    expect(runtime.revision).toBe(1);
    expect(all).toEqual([1]);
    expect(user).toEqual([1]);
    expect(runtime.subscriptionInfo('ctx.user').map((entry) => entry.label)).toEqual([
      'all-viewer',
      'user-viewer',
    ]);

    unsubscribeUser();
    runtime.set('ctx.values.one', 2);
    await Promise.resolve();
    expect(runtime.revision).toBe(2);
    expect(all).toEqual([1, 2]);
    expect(user).toEqual([1]);

    unsubscribeAll();
  });

  it('delivers synchronously by default and asynchronously only when requested', async () => {
    const runtime = new ContextTreeRuntime({ values: { one: 0 } });
    const immediate: number[] = [];
    const explicitImmediate: number[] = [];
    const deferred: number[] = [];
    const canceled: number[] = [];
    runtime.subscribe((mutation) => immediate.push(mutation.revision));
    runtime.subscribe((mutation) => explicitImmediate.push(mutation.revision), { async: false });
    runtime.subscribe((mutation) => deferred.push(mutation.revision), { async: true });
    const unsubscribe = runtime.subscribe((mutation) => canceled.push(mutation.revision), {
      async: true,
    });

    runtime.set('ctx.values.one', 1);
    runtime.set('ctx.values.one', 2);
    expect(immediate).toEqual([1, 2]);
    expect(explicitImmediate).toEqual([1, 2]);
    expect(deferred).toEqual([]);
    unsubscribe();
    await Promise.resolve();
    expect(deferred).toEqual([1, 2]);
    expect(canceled).toEqual([]);
  });

  it('isolates listener failures and reports logical tree statistics', async () => {
    const runtime = new ContextTreeRuntime({ values: { one: 1, two: 'two' } });
    let observed = 0;
    runtime.subscribe(() => {
      throw new Error('viewer failure');
    });
    runtime.subscribe(() => {
      observed += 1;
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      runtime.set('ctx.values.one', 3);
      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }

    expect(observed).toBe(1);
    const stats = runtime.statistics();
    expect(stats.nodes).toBeGreaterThanOrEqual(4);
    expect(stats.bytes).toBeGreaterThan(0);
  });
});
