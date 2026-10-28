import { describe, expect, it } from 'vitest';

import {
  ExpressionEvaluationError,
  ExpressionParseError,
  calculatedContextField,
  evaluateExpression,
  evaluateExpressionAsync,
  type EntityResolver,
  type ExpressionCapabilityDelegate,
  type ExpressionDiagnostic,
} from '../src/index.js';

const caller = {
  source: 'test' as const,
  purpose: 'shared expression evaluator conformance',
};

function asyncExecution(root: unknown, scope: unknown) {
  return {
    owner: 'shared-test',
    root,
    scope,
    capabilities: ['pure', 'clock', 'ctx'] as const,
  };
}

describe('async expression evaluator', () => {
  it('keeps sync and async operator semantics aligned', async () => {
    const cases: ReadonlyArray<readonly [string, unknown]> = [
      ['+2', 2],
      ['-2', -2],
      ['!false', true],
      ['~1', -2],
      ['2 + 3', 5],
      ["'A' + 2", 'A2'],
      ['7 - 2', 5],
      ['3 * 4', 12],
      ['8 / 2', 4],
      ['8 % 3', 2],
      ['2 ** 3', 8],
      ["2 == '2'", true],
      ["2 != '3'", true],
      ['2 === 2', true],
      ["2 !== '2'", true],
      ['2 < 3', true],
      ['2 <= 2', true],
      ['3 > 2', true],
      ['3 >= 3', true],
      ['1 << 2', 4],
      ['8 >> 1', 4],
      ['8 >>> 1', 4],
      ['6 & 3', 2],
      ['6 ^ 3', 5],
      ['6 | 3', 7],
      ['2 IN [1, 2, 3]', true],
      ['true ? 10 : 20', 10],
      ['false && missing', false],
      ['true || missing', true],
      ['5 ?? missing', 5],
    ];

    for (const [expression, expected] of cases) {
      expect(evaluateExpression(expression, {}, {}, caller)).toEqual(expected);
      await expect(
        evaluateExpressionAsync(expression, asyncExecution({}, {}), caller),
      ).resolves.toEqual(expected);
    }
  });

  it('keeps sync and async operator failures aligned', async () => {
    const cases = ['1 / 0', '1 % 0', '1 ? 2 : 3', '1 IN 2', "SqRoot('9')"];

    for (const expression of cases) {
      let syncMessage: string | undefined;
      try {
        evaluateExpression(expression, {}, {}, caller);
      } catch (error) {
        syncMessage = error instanceof Error ? error.message : String(error);
      }

      let asyncMessage: string | undefined;
      try {
        await evaluateExpressionAsync(expression, asyncExecution({}, {}), caller);
      } catch (error) {
        asyncMessage = error instanceof Error ? error.message : String(error);
      }

      expect(asyncMessage).toBe(syncMessage);
    }
  });

  it('reports the actual nested calculated expression and complete chain', async () => {
    const ctx = {
      fields: {
        a: calculatedContextField('b + 1'),
        b: calculatedContextField('missing + 1'),
      },
    };

    const targetCaller = {
      ...caller,
      targetPath: 'ctx.fields.a',
    };

    const syncDiagnostics: ExpressionDiagnostic[] = [];
    let syncError: unknown;

    try {
      evaluateExpression('a', ctx, ctx.fields, targetCaller, {
        diagnosticSink: (diagnostic) => syncDiagnostics.push(diagnostic),
      });
    } catch (error) {
      syncError = error;
    }

    expect(syncError).toBeInstanceOf(ExpressionEvaluationError);
    expect((syncError as ExpressionEvaluationError).expression).toBe('missing + 1');
    expect((syncError as ExpressionEvaluationError).evaluationChain).toEqual([
      'ctx.fields.a',
      'ctx.fields.b',
    ]);

    const syncDiagnostic = syncDiagnostics.find((diagnostic) => diagnostic.phase === 'evaluate');
    expect(syncDiagnostic?.expression).toBe('missing + 1');
    expect(syncDiagnostic?.evaluationChain).toEqual(['ctx.fields.a', 'ctx.fields.b']);

    const asyncDiagnostics: ExpressionDiagnostic[] = [];
    let asyncError: unknown;

    try {
      await evaluateExpressionAsync('a', asyncExecution(ctx, ctx.fields), targetCaller, {
        diagnosticSink: (diagnostic) => asyncDiagnostics.push(diagnostic),
      });
    } catch (error) {
      asyncError = error;
    }

    expect(asyncError).toBeInstanceOf(ExpressionEvaluationError);
    expect((asyncError as ExpressionEvaluationError).expression).toBe('missing + 1');
    expect((asyncError as ExpressionEvaluationError).evaluationChain).toEqual([
      'ctx.fields.a',
      'ctx.fields.b',
    ]);

    const asyncDiagnostic = asyncDiagnostics.find((diagnostic) => diagnostic.phase === 'evaluate');
    expect(asyncDiagnostic?.expression).toBe('missing + 1');
    expect(asyncDiagnostic?.evaluationChain).toEqual(['ctx.fields.a', 'ctx.fields.b']);
  });

  it('forwards async parse diagnostics through the normal evaluation API', async () => {
    const diagnostics: ExpressionDiagnostic[] = [];

    await expect(
      evaluateExpressionAsync('2 + )', asyncExecution({}, {}), caller, {
        diagnosticSink: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).rejects.toBeInstanceOf(ExpressionParseError);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.phase).toBe('parse');
    expect(diagnostics[0]?.expression).toBe('2 + )');
  });

  it('does not touch EntityResolver when a lazy traversal branch is unreachable', async () => {
    let reads = 0;

    const resolver: EntityResolver = {
      async getById() {
        reads += 1;
        return null;
      },
    };

    const fields = {
      parentId: { value: null },
    };

    const expression =
      "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')";

    await expect(
      evaluateExpressionAsync(
        expression,
        {
          owner: 'shared-test',
          root: fields,
          scope: fields,
          capabilities: ['pure', 'ctx'],
          entityResolver: resolver,
        },
        caller,
      ),
    ).resolves.toBeNull();

    expect(reads).toBe(0);
  });

  it('requires the entityResolver capability before a reached traversal can read', async () => {
    let reads = 0;

    const resolver: EntityResolver = {
      async getById() {
        reads += 1;
        return null;
      },
    };

    const fields = {
      parentId: { value: 'parent' },
    };

    const expression = "TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')";

    await expect(
      evaluateExpressionAsync(
        expression,
        {
          owner: 'shared-test',
          root: fields,
          scope: fields,
          capabilities: ['pure', 'ctx'],
          entityResolver: resolver,
        },
        caller,
      ),
    ).rejects.toThrow("requires capability 'entityResolver'");

    expect(reads).toBe(0);
  });

  it('uses EntityResolver only when persisted traversal is actually reached', async () => {
    let reads = 0;

    const rows = new Map<string, Readonly<Record<string, unknown>>>([
      ['parent', { id: 'parent', parentId: 'root' }],
      ['root', { id: 'root', parentId: null }],
    ]);

    const resolver: EntityResolver = {
      async getById(entityKey, id) {
        expect(entityKey).toBe('sys-principals');
        reads += 1;
        return rows.get(String(id)) ?? null;
      },
    };

    const fields = {
      parentId: { value: 'parent' },
    };

    const expression =
      "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')";

    await expect(
      evaluateExpressionAsync(
        expression,
        {
          owner: 'shared-test',
          root: fields,
          scope: fields,
          capabilities: ['pure', 'ctx', 'entityResolver'],
          entityResolver: resolver,
        },
        caller,
      ),
    ).resolves.toBe('root');

    expect(reads).toBe(2);
  });

  it('delegates only a reached capability that the browser owner does not provide locally', async () => {
    const calls: unknown[] = [];
    const delegate: ExpressionCapabilityDelegate = {
      capabilities: ['entityResolver'],
      async evaluateFunction(call) {
        calls.push(call);
        return 'root';
      },
    };
    const fields = { parentId: { value: 'parent' } };

    await expect(
      evaluateExpressionAsync(
        "TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
        {
          owner: 'browser-test',
          root: fields,
          scope: fields,
          capabilities: ['pure', 'clock', 'ctx'],
          capabilityDelegate: delegate,
        },
        caller,
      ),
    ).resolves.toBe('root');

    expect(calls).toEqual([
      {
        functionName: 'TraverseEntity',
        capability: 'entityResolver',
        args: ['parent', 'sys-principals', 'parentId', 'id'],
      },
    ]);
  });

  it('does not delegate an unreachable capability-backed branch', async () => {
    let calls = 0;
    const delegate: ExpressionCapabilityDelegate = {
      capabilities: ['entityResolver'],
      async evaluateFunction() {
        calls += 1;
        return 'unexpected';
      },
    };
    const fields = { parentId: { value: null } };

    await expect(
      evaluateExpressionAsync(
        "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
        {
          owner: 'browser-test',
          root: fields,
          scope: fields,
          capabilities: ['pure', 'clock', 'ctx'],
          capabilityDelegate: delegate,
        },
        caller,
      ),
    ).resolves.toBeNull();

    expect(calls).toBe(0);
  });
});
