import { describe, expect, it } from 'vitest';

import { evaluateExpression, SysBOUserRole } from '@manatos/shared';

import { ApiContextRuntime, createApiRootContext } from '../../src/context/api-context-runtime.js';

describe('API CTX runtime', () => {
  it('uses one global semantic root while each request owns an isolated API level and user', async () => {
    const runtime = new ApiContextRuntime(createApiRootContext());
    const seen: string[] = [];

    await Promise.all([
      runtime.runRequest('call-a', { method: 'GET', path: '/a' }, async () => {
        runtime.setUser({ userId: 'a', userName: 'Alice', role: SysBOUserRole.Admin });
        seen.push(String(runtime.currentLevel()?.user?.fields.name?.value));
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(String(runtime.currentLevel()?.user?.fields.name?.value));
        runtime.endRequest('call-a');
      }),
      runtime.runRequest('call-b', { method: 'GET', path: '/b' }, async () => {
        runtime.setUser({ userId: 'b', userName: 'Bob', role: SysBOUserRole.User });
        seen.push(String(runtime.currentLevel()?.user?.fields.name?.value));
        await new Promise((resolve) => setTimeout(resolve, 1));
        seen.push(String(runtime.currentLevel()?.user?.fields.name?.value));
        runtime.endRequest('call-b');
      }),
    ]);

    expect(seen.filter((value) => value === 'Alice')).toHaveLength(2);
    expect(seen.filter((value) => value === 'Bob')).toHaveLength(2);
    expect(runtime.tree().api).toEqual({});
    expect(runtime.tree().company).toBeDefined();
    expect(runtime.tree().system).toBeDefined();
    expect(Object.keys(runtime.tree().entities).length).toBeGreaterThan(0);
  });

  it('lets nested subsystem levels resolve request-owned user context through the shared evaluator', async () => {
    const runtime = new ApiContextRuntime(createApiRootContext());

    await runtime.runRequest(
      'call-expression',
      { method: 'PATCH', path: '/principal/1' },
      async () => {
        runtime.setUser({
          userId: 'admin-id',
          userName: 'Admin',
          role: SysBOUserRole.Admin,
        });

        const result = await runtime.runLevel(
          { name: 'STORAGE persist', data: { marker: 'storage' } },
          async () =>
            runtime.runLevel({ name: 'CALCULATION fullName' }, async (calculationLevel) =>
              evaluateExpression(
                "user.permissions.userRole === 'Admin' && data.marker === 'storage'",
                runtime.tree(),
                calculationLevel,
                { source: 'test', purpose: 'verify API CTX lexical ancestry' },
              ),
            ),
        );

        expect(result).toBe(true);
        // Nested levels are lifecycle-owned and disappear immediately after completion.
        expect(
          Object.keys(runtime.currentLevel() ?? {}).some((key) => key.startsWith('level-')),
        ).toBe(false);
        runtime.endRequest('call-expression');
      },
    );
  });

  it('keeps parallel nested levels independent within one API call', async () => {
    const runtime = new ApiContextRuntime(createApiRootContext());

    await runtime.runRequest('parallel', { method: 'POST', path: '/work' }, async () => {
      const paths = await Promise.all([
        runtime.runLevel({ name: 'one' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 3));
          return runtime.currentPath();
        }),
        runtime.runLevel({ name: 'two' }, async () => runtime.currentPath()),
      ]);

      expect(paths[0]).not.toBe(paths[1]);
      expect(paths.every((path) => path?.includes('level-parallel'))).toBe(true);
      runtime.endRequest('parallel');
    });
  });
});
