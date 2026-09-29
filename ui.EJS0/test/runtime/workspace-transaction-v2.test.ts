import { describe, expect, it } from 'vitest';

import {
  changedFieldKeys,
  flattenWorkspaceMutations,
  normalizeWorkspaceTransaction,
  removeWorkspaceMutation,
  upsertWorkspaceMutation,
  type UiWorkspaceRecordMutation,
} from '../../src/runtime/v2/workspace-transaction.js';

const principal: UiWorkspaceRecordMutation = {
  mutationId: 'principal:p1',
  entityKey: 'sys-principals',
  identity: 'p1',
  identityKind: 'persistent',
  operation: 'update',
  original: { id: 'p1', name: 'Original', description: 'kept', updatedAt: 'baseline' },
  current: { id: 'p1', name: 'Changed', description: 'kept', updatedAt: 'baseline' },
  baselineUpdatedAt: 'baseline',
  collections: {
    emails: {
      original: [{ id: 'e1', email: 'old@example.test' }],
      current: [{ id: 'e1', email: 'new@example.test' }],
    },
  },
};

describe('recursive workspace transaction', () => {
  it('retains heterogeneous recursive ownership, workspace references and changed-field intent', () => {
    let transaction = upsertWorkspaceMutation({ version: 1, mutations: [] }, principal);
    transaction = upsertWorkspaceMutation(
      transaction,
      {
        mutationId: 'user:workspace:u1',
        entityKey: 'sys-users',
        identity: 'workspace:u1',
        identityKind: 'workspace',
        operation: 'create',
        original: null,
        current: { id: 'workspace:u1', userName: 'nested-user' },
        references: [
          {
            key: 'principalId',
            entityKey: 'sys-principals',
            identity: 'p1',
            identityKind: 'persistent',
          },
        ],
      },
      'principal:p1',
    );
    transaction = upsertWorkspaceMutation(
      transaction,
      {
        mutationId: 'future:workspace:f1',
        entityKey: 'future-entity',
        identity: 'workspace:f1',
        identityKind: 'workspace',
        operation: 'create',
        original: null,
        current: { id: 'workspace:f1', value: 42 },
      },
      'user:workspace:u1',
    );

    const roundTrip = normalizeWorkspaceTransaction(JSON.parse(JSON.stringify(transaction)));
    expect(flattenWorkspaceMutations(roundTrip).map((item) => item.mutationId)).toEqual([
      'principal:p1',
      'user:workspace:u1',
      'future:workspace:f1',
    ]);
    expect(roundTrip.mutations[0]?.changedFields).toEqual(['name']);
    expect(roundTrip.mutations[0]?.baselineUpdatedAt).toBe('baseline');
    expect(roundTrip.mutations[0]?.collections?.emails.current[0]).toEqual({
      id: 'e1',
      email: 'new@example.test',
    });
    expect(roundTrip.mutations[0]?.children?.[0]?.references?.[0]).toMatchObject({
      key: 'principalId',
      identity: 'p1',
    });
  });

  it('removes a nested mutation subtree without entity-specific logic', () => {
    let transaction = upsertWorkspaceMutation({ version: 1, mutations: [] }, principal);
    transaction = upsertWorkspaceMutation(
      transaction,
      {
        mutationId: 'license:l1',
        entityKey: 'sys-licenses',
        identity: 'l1',
        identityKind: 'persistent',
        operation: 'delete',
        original: { id: 'l1' },
        current: null,
      },
      'principal:p1',
    );
    expect(flattenWorkspaceMutations(transaction)).toHaveLength(2);
    expect(
      flattenWorkspaceMutations(removeWorkspaceMutation(transaction, 'license:l1')),
    ).toHaveLength(1);
  });

  it('records only fields changed inside an existing-record workspace baseline', () => {
    expect(changedFieldKeys({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, c: 3 })).toEqual(['b']);
    expect(
      changedFieldKeys(
        { config: { first: 1, nested: { value: 2 } } },
        { config: { nested: { value: 2 }, first: 1 } },
      ),
    ).toEqual([]);
    expect(changedFieldKeys({ values: [1, 2] }, { values: [2, 1] })).toEqual(['values']);
  });

  it('rejects orphan nested ownership instead of silently promoting it to a root mutation', () => {
    expect(() =>
      upsertWorkspaceMutation({ version: 1, mutations: [principal] }, principal, 'missing-owner'),
    ).toThrow(/was not found/);
  });

  it('preserves scalar and structured collection payloads through transaction normalization', () => {
    const transaction = normalizeWorkspaceTransaction({
      version: 1,
      mutations: [
        {
          mutationId: 'principal:p1',
          entityKey: 'sys-principals',
          identity: 'p1',
          identityKind: 'persistent',
          operation: 'update',
          original: { id: 'p1' },
          current: { id: 'p1' },
          collections: {
            emailAddresses: { original: ['old@example.test'], current: ['new@example.test'] },
            telephoneNumbers: {
              original: [],
              current: [{ countryCode: '+30', number: '2100000000' }],
            },
          },
        },
      ],
    });
    expect(transaction.mutations[0]?.collections?.emailAddresses.current).toEqual([
      'new@example.test',
    ]);
    expect(transaction.mutations[0]?.collections?.telephoneNumbers.current).toEqual([
      { countryCode: '+30', number: '2100000000' },
    ]);
  });
});
