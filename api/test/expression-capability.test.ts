import { describe, expect, it } from 'vitest';
import {
  evaluateExpressionAsync,
  type EntityResolver,
} from '@manatos/shared';

import { DataStoreEntityResolver } from '../src/services/entity-resolver.js';
import { createTestApi, seedAdmin } from './test-helpers.js';

const caller = { source: 'test' as const, purpose: 'owner/capability execution contract' };
const expression = "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')";

describe('expression evaluation ownership and EntityResolver capability', () => {
  it('preserves lazy ownership semantics when an unavailable resolver branch is unreachable', async () => {
    const fields = { parentId: { value: null } };

    const result = await evaluateExpressionAsync(
      expression,
      { owner: 'test-owner', root: fields, scope: fields, capabilities: ['pure', 'ctx'] },
      caller,
    );

    expect(result).toBeNull();
  });

  it('lets the same owner complete the expression while EntityResolver supplies only the reached traversal', async () => {
    const rows = new Map<string, Readonly<Record<string, unknown>>>([
      ['parent', { id: 'parent', parentId: 'root' }],
      ['root', { id: 'root', parentId: null }],
    ]);
    const resolver: EntityResolver = {
      async getById(entityKey, id) {
        expect(entityKey).toBe('sys-principals');
        return rows.get(String(id)) ?? null;
      },
    };
    const fields = { parentId: { value: 'parent' } };

    await expect(evaluateExpressionAsync(
      expression,
      { owner: 'test-owner', root: fields, scope: fields, capabilities: ['pure', 'ctx', 'entityResolver'], entityResolver: resolver },
      caller,
    )).resolves.toBe('root');
  });

  it('detects persisted hierarchy cycles inside TraverseEntity', async () => {
    const rows = new Map<string, Readonly<Record<string, unknown>>>([
      ['a', { id: 'a', parentId: 'b' }],
      ['b', { id: 'b', parentId: 'a' }],
    ]);
    const resolver: EntityResolver = {
      async getById(_entityKey, id) {
        return rows.get(String(id)) ?? null;
      },
    };
    const fields = { parentId: { value: 'a' } };

    await expect(evaluateExpressionAsync(
      expression,
      { owner: 'test-owner', root: fields, scope: fields, capabilities: ['pure', 'ctx', 'entityResolver'], entityResolver: resolver },
      caller,
    )).rejects.toThrow('TraverseEntity detected a parent cycle');
  });

  it('projects resolver records through non-sensitive canonical metadata fields', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const users = await context.store.sysUsers.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} });
    const admin = users.items[0];
    expect(admin?.passwordHash).toBeTruthy();

    const resolver = new DataStoreEntityResolver(context.store);
    const projected = await resolver.getById('sys-users', admin!.id);
    expect(projected).toMatchObject({ id: admin!.id, name: admin!.name });
    expect(projected).not.toHaveProperty('passwordHash');
  });
});
