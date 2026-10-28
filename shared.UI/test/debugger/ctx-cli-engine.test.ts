import { describe, expect, it, vi } from 'vitest';
import {
  ContextTreeRuntime,
  type ExpressionCapabilityDelegate,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';

import { executeCtxCliCommand } from '../../src/index.js';

function createRuntime(): ContextTreeRuntime<ManatOSRuntimeRootContext> {
  const entities = {
    sysUsers: {
      key: 'sysUsers',
      name: 'sysUsers',
      subsystem: 'users',
      fields: {},
    },
  };
  const enums = {};
  const root = {
    system: {},
    company: { parentId: 'parent' },
    runtime: { subsystems: {}, entities, enums, user: null },
  } as unknown as ManatOSRuntimeRootContext;
  return new ContextTreeRuntime(root);
}

describe('CTX CLI engine', () => {
  it('keeps CTX command/path semantics framework-neutral', async () => {
    const context = createRuntime();

    const relative = await executeCtxCliCommand({
      context,
      currentPath: 'ctx.entities',
      source: 'cd ../runtime/entities',
    });
    expect(relative.currentPath).toBe('ctx.runtime.entities');

    const cd = await executeCtxCliCommand({
      context,
      currentPath: 'ctx',
      source: 'cd $entities.sysUsers',
    });
    expect(cd.currentPath).toBe('ctx.entities.sysUsers');
    expect(cd.output).toBe('$entities.sysUsers');

    const parent = await executeCtxCliCommand({
      context,
      currentPath: cd.currentPath,
      source: '.. ls',
    });
    expect(parent.currentPath).toBe('ctx.entities');
    expect(parent.output).toContain('sysUsers');

    await expect(
      executeCtxCliCommand({ context, currentPath: 'ctx', source: '1 + 2' }),
    ).resolves.toMatchObject({ currentPath: 'ctx', output: '3' });
  });

  it('delegates reached server-backed expression capabilities without owning transport', async () => {
    const context = createRuntime();
    const evaluateFunction = vi.fn(async () => 'root');
    const delegate: ExpressionCapabilityDelegate = {
      capabilities: ['entityResolver'],
      evaluateFunction,
    };

    const result = await executeCtxCliCommand({
      context,
      currentPath: 'ctx.company',
      source: "TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
      expressionCapabilityDelegate: delegate,
    });

    expect(result.output).toBe('root');
    expect(evaluateFunction).toHaveBeenCalledWith({
      functionName: 'TraverseEntity',
      capability: 'entityResolver',
      args: ['parent', 'sys-principals', 'parentId', 'id'],
    });
  });

  it('returns clear as a view instruction rather than owning transcript state', async () => {
    const result = await executeCtxCliCommand({
      context: createRuntime(),
      currentPath: 'ctx',
      source: 'clear',
    });

    expect(result).toEqual({ currentPath: 'ctx', clearTranscript: true });
  });
});
