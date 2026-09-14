import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SysBOUserRole } from '@manatos/shared';

import { ApiContextSnapshotWriter } from '../../src/context/api-context-snapshot.js';
import { ApiContextRuntime, createApiRootContext } from '../../src/context/api-context-runtime.js';

describe('API CTX snapshot diagnostics', () => {
  it('writes redacted request and storage subtree snapshots before CTX disposal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-api-ctx-'));
    const writer = new ApiContextSnapshotWriter({
      settings: () => ({ enabled: true, outputDirectory: directory }),
    });
    const runtime = new ApiContextRuntime(createApiRootContext(), writer);

    let storageId = '';
    let calculationId = '';

    await runtime.runRequest('call/snapshot', { method: 'POST', path: '/save' }, async () => {
      runtime.setUser({ userId: '1', userName: 'Admin', role: SysBOUserRole.Admin });
      await runtime.runLevel(
        {
          name: 'STORAGE · save',
          diagnosticGroup: 'storage',
          resources: {
            connection: {
              host: 'localhost',
              password: 'do-not-write-this',
              accessToken: 'also-secret',
            },
          },
        },
        async (storageLevel) => {
          storageId = storageLevel.control.id;
          await runtime.runLevel(
            {
              name: 'CALCULATION · example',
              data: { value: 42, clientSecret: 'hidden' },
            },
            async (calculationLevel) => {
              calculationId = calculationLevel.control.id;
            },
          );
        },
      );
      runtime.endRequest('call/snapshot');
    });

    await writer.flush();

    const callFolder = join(directory, 'call_snapshot');
    const request = JSON.parse(await readFile(join(callFolder, 'api.json'), 'utf8')) as {
      snapshot: Record<string, unknown>;
      ctx: Record<string, unknown>;
    };
    const storage = JSON.parse(
      await readFile(join(callFolder, 'storage', storageId, 'ctx.json'), 'utf8'),
    ) as { ctx: Record<string, unknown> };
    const calculation = JSON.parse(
      await readFile(
        join(callFolder, 'storage', storageId, 'levels', calculationId, 'ctx.json'),
        'utf8',
      ),
    ) as { ctx: Record<string, unknown> };

    expect(request.snapshot).toMatchObject({ callId: 'call/snapshot', reason: 'request-dispose' });
    expect(JSON.stringify(storage)).toContain('[REDACTED]');
    expect(JSON.stringify(storage)).not.toContain('do-not-write-this');
    expect(JSON.stringify(storage)).not.toContain('also-secret');
    expect(JSON.stringify(calculation)).not.toContain('hidden');
    expect(calculation.ctx).toMatchObject({ data: { value: 42, clientSecret: '[REDACTED]' } });
    expect(runtime.tree().api).toEqual({});
  });

  it('does not write files when snapshot diagnostics are disabled', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-api-ctx-disabled-'));
    const writer = new ApiContextSnapshotWriter({
      settings: () => ({ enabled: false, outputDirectory: directory }),
    });
    const runtime = new ApiContextRuntime(createApiRootContext(), writer);

    await runtime.runRequest('disabled', { method: 'GET', path: '/' }, async () => {
      await runtime.runLevel(
        { name: 'STORAGE · read', diagnosticGroup: 'storage' },
        async () => 'ok',
      );
      runtime.endRequest('disabled');
    });
    await writer.flush();

    await expect(readFile(join(directory, 'disabled', 'api.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps API execution successful when snapshot output cannot be written', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-api-ctx-failure-'));
    const blockedPath = join(directory, 'not-a-directory');
    await writeFile(blockedPath, 'file', 'utf8');
    const warnings: string[] = [];
    const writer = new ApiContextSnapshotWriter({
      settings: () => ({ enabled: true, outputDirectory: blockedPath }),
      warn: (message) => warnings.push(message),
    });
    const runtime = new ApiContextRuntime(createApiRootContext(), writer);

    const result = await runtime.runRequest('nonfatal', { method: 'GET', path: '/' }, async () => {
      const value = await runtime.runLevel(
        { name: 'STORAGE · read', diagnosticGroup: 'storage' },
        async () => 123,
      );
      runtime.endRequest('nonfatal');
      return value;
    });
    await writer.flush();

    expect(result).toBe(123);
    expect(warnings).toContain('API CTX snapshot could not be written');
    expect(runtime.tree().api).toEqual({});
  });
});
