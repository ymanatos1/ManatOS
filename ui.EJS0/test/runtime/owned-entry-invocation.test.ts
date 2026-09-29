import { describe, expect, it } from 'vitest';

import { ownedEntryInvocation } from '../../src/runtime/v2/owned-entry-invocation.js';

const principal = (id: string, name: string) => ({ id, name });

describe('owned Entry invocation', () => {
  it('materializes only the child semantic state while retaining workspace reference facts', () => {
    const invocation = ownedEntryInvocation(
      'sys-principals',
      'draft:child',
      'id',
      [principal('draft:child', 'Child'), principal('draft:sibling', 'Sibling')],
      [],
      {
        version: 1,
        mutations: [
          {
            mutationId: 'sys-principals:draft:child',
            entityKey: 'sys-principals',
            identity: 'draft:child',
            identityKind: 'workspace',
            operation: 'create',
            original: null,
            current: principal('draft:child', 'Child'),
          },
          {
            mutationId: 'sys-users:draft:user',
            entityKey: 'sys-users',
            identity: 'draft:user',
            identityKind: 'workspace',
            operation: 'create',
            original: null,
            current: { id: 'draft:user', userName: 'User' },
          },
        ],
      },
    );

    expect(invocation.current).toEqual(principal('draft:child', 'Child'));
    expect(invocation.existingMutation?.identity).toBe('draft:child');
    expect(invocation.workspaceIdentities).toEqual([
      'sys-principals:draft:child',
      'sys-users:draft:user',
    ]);
    expect(JSON.stringify(invocation)).not.toContain('Sibling');
    expect(JSON.stringify(invocation)).not.toContain('userName');
  });

  it('materializes a heterogeneous owned descendant directly from workspaceTransaction', () => {
    const invocation = ownedEntryInvocation(
      'sys-users',
      'draft:user',
      'id',
      [principal('principal-1', 'Principal')],
      [principal('principal-1', 'Principal')],
      {
        version: 1,
        mutations: [
          {
            mutationId: 'sys-users:draft:user',
            entityKey: 'sys-users',
            identity: 'draft:user',
            identityKind: 'workspace',
            operation: 'create',
            original: null,
            current: { id: 'draft:user', userName: 'owned-user', enabled: true },
          },
        ],
      },
      'sys-principals',
    );

    expect(invocation.current).toEqual({
      id: 'draft:user',
      userName: 'owned-user',
      enabled: true,
    });
    expect(invocation.original).toBeNull();
    expect(invocation.existingMutation?.entityKey).toBe('sys-users');
  });

  it('preserves original/current for an existing heterogeneous owned descendant', () => {
    const invocation = ownedEntryInvocation(
      'sys-users',
      'user-1',
      'id',
      [],
      [],
      {
        version: 1,
        mutations: [
          {
            mutationId: 'sys-users:user-1',
            entityKey: 'sys-users',
            identity: 'user-1',
            identityKind: 'persistent',
            operation: 'update',
            original: { id: 'user-1', userName: 'before' },
            current: { id: 'user-1', userName: 'after' },
          },
        ],
      },
      'sys-principals',
    );

    expect(invocation.original).toEqual({ id: 'user-1', userName: 'before' });
    expect(invocation.current).toEqual({ id: 'user-1', userName: 'after' });
  });
});
