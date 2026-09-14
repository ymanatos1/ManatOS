import { describe, expect, it } from 'vitest';

import { SysBOUserRole } from '@manatos/shared';

import { apiContextRuntime } from '../../src/context/api-context-runtime.js';
import { runStorageOperation } from '../../src/storage/execution-context.js';

describe('storage API CTX execution', () => {
  it('creates a nested STORAGE level with effective adapter capabilities and behavior strategy', async () => {
    await apiContextRuntime.runRequest(
      'storage-context-test',
      { method: 'POST', path: '/storage-test' },
      async () => {
        apiContextRuntime.setUser({
          userId: 'admin',
          userName: 'Admin',
          role: SysBOUserRole.Admin,
        });

        const observed = await runStorageOperation('in-memory-json', 'transaction', () => {
          const level = apiContextRuntime.currentLevel();
          return {
            name: level?.control.name,
            userName: level ? undefined : null,
            resources: level?.resources,
            path: apiContextRuntime.currentPath(),
          };
        });

        expect(observed.name).toBe('STORAGE · transaction');
        expect(observed.path).toContain('level-storage-context-test');
        expect(observed.resources).toMatchObject({
          storage: {
            adapterId: 'in-memory-json',
            familyId: 'document-file',
          },
        });
        expect(
          (observed.resources?.storage as { behaviors?: readonly unknown[] } | undefined)
            ?.behaviors,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              behavior: 'calculations.persisted',
              mechanism: 'adapter-evaluation',
            }),
          ]),
        );

        apiContextRuntime.endRequest('storage-context-test');
      },
    );
  });
});
