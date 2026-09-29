import { describe, expect, it } from 'vitest';

import { OrganizationHierarchySurface } from '../../src/runtime/v2/organization-hierarchy-surface.js';
import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiLevel } from '../../src/runtime/v2/ui-level.js';
import { normalizeWorkspaceTransaction } from '../../src/runtime/v2/workspace-transaction.js';

const portFor = (value: UiCtxObject): UiCtxRuntimePort => ({
  value,
  get: (path) =>
    path
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], value),
  set: (path, next) => {
    const parts = path.split('.');
    let node: Record<string, unknown> = value;
    for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
    node[parts.at(-1)!] = next;
    return next;
  },
  replace: (path, next) => {
    const parts = path.split('.');
    let node: Record<string, unknown> = value;
    for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
    node[parts.at(-1)!] = next;
    return next;
  },
  delete: () => undefined,
  add: () => undefined,
  subscribe: () => () => undefined,
});

describe('OrganizationHierarchySurface', () => {
  it('owns hierarchy aggregate CTX mutations through one typed surface contract', () => {
    const levelValue: UiCtxObject = {
      state: { dirty: false },
      data: {
        list: { entries: [{ id: 'a' }], originalEntries: [{ id: 'a' }] },
        resources: { workspace: { focusedMemberId: 'a' } },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const root = UiLevel.structuralRoot('$root');
    const level = UiLevel.child(
      root,
      'hierarchy-1',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, {
      normalizeEntries: (items) => items.map((item) => ({ ...item, projected: true })),
    });

    const provider = surface.ownerProvider;
    expect(provider).toBe(surface.ownerProvider);
    expect(provider).not.toBe(surface);
    level.bindOwnerProvider(provider);
    expect(level.ownerProvider).toBe(provider);

    expect(
      surface.sameRows(
        [
          { id: 'b', nested: { x: 1, y: 2 } },
          { id: 'a', value: 3 },
        ],
        [
          { value: 3, id: 'a' },
          { nested: { y: 2, x: 1 }, id: 'b' },
        ],
      ),
    ).toBe(true);
    expect(surface.sameRows([{ id: 'a', value: 1 }], [{ id: 'a', value: 2 }])).toBe(false);

    expect(surface.sameTransactionSnapshot({ version: 1, mutations: [] })).toBe(true);

    expect(surface.dirty).toBe(false);
    surface.replaceEntries([{ id: 'b' }], 'move-member');
    expect(surface.entries).toEqual([{ id: 'b', projected: true }]);
    expect(surface.dirty).toBe(true);
    expect(context.get('state.dirty')).toBe(true);
    surface.replaceOriginalEntries(surface.entries, 'commit');
    expect(surface.dirty).toBe(false);
    expect(context.get('state.dirty')).toBe(false);
    surface.setWorkspaceValue('focusedMemberId', 'b', 'focus-member');
    surface.setStateValue('dirty', false, 'refresh-dirty');
    expect(surface.workspaceValue('focusedMemberId')).toBe('b');
    expect(context.get('state.dirty')).toBe(false);

    surface.upsertTransactionMutation(
      {
        mutationId: 'sys-users:workspace:u1',
        entityKey: 'sys-users',
        identity: 'workspace:u1',
        identityKind: 'workspace',
        operation: 'create',
        original: null,
        current: { id: 'workspace:u1', email: 'new@example.test' },
      },
      'related-user-save',
    );
    expect(surface.dirty).toBe(true);
    expect(context.get('state.dirty')).toBe(true);
    expect(surface.transactionSnapshot().mutations).toHaveLength(1);
    surface.replaceTransaction(surface.transactionSnapshot(), 'draft-round-trip');
    expect(surface.transactionSnapshot().mutations[0]).toMatchObject({
      entityKey: 'sys-users',
      identity: 'workspace:u1',
    });
    surface.upsertTransactionMutation(
      {
        mutationId: 'future:workspace:f1',
        entityKey: 'future-entity',
        identity: 'workspace:f1',
        identityKind: 'workspace',
        operation: 'create',
        original: null,
        current: { id: 'workspace:f1', value: 1 },
      },
      'nested-save',
      'sys-users:workspace:u1',
    );
    expect(surface.transactionSnapshot().mutations[0]?.children?.[0]?.entityKey).toBe(
      'future-entity',
    );
    surface.removeTransactionMutation('sys-users:workspace:u1', 'discard-related-user');
    expect(surface.transactionSnapshot().mutations).toEqual([]);
    expect(surface.dirty).toBe(false);
    expect(context.get('state.dirty')).toBe(false);
  });

  it('applies an owned child result without replacing unrelated owner working state', () => {
    const siblingMutation = {
      mutationId: 'sys-users:sibling',
      entityKey: 'sys-users',
      identity: 'sibling',
      identityKind: 'persistent' as const,
      operation: 'update' as const,
      original: { id: 'sibling', name: 'Before' },
      current: { id: 'sibling', name: 'Unsaved sibling' },
    };
    const levelValue: UiCtxObject = {
      state: {},
      data: {
        list: {
          entries: [
            { key: 'child', name: 'Before' },
            { key: 'other', name: 'Unsaved owner row' },
          ],
          originalEntries: [
            { key: 'child', name: 'Before' },
            { key: 'other', name: 'Persisted owner row' },
          ],
        },
        resources: {
          workspace: { focusedMemberId: 'other', customDraftValue: 'keep-me' },
          workspaceTransaction: { version: 1, mutations: [siblingMutation] },
        },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-1',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, { identityField: 'key' });
    const childMutation = {
      mutationId: 'sys-principals:child',
      entityKey: 'sys-principals',
      identity: 'child',
      identityKind: 'persistent' as const,
      operation: 'update' as const,
      original: { key: 'child', name: 'Before' },
      current: { key: 'child', name: 'After' },
    };

    surface.applyOwnedEntryResult({
      entityKey: 'sys-principals',
      identity: 'child',
      record: { key: 'child', name: 'After' },
      mutation: childMutation,
    });

    expect(surface.entries).toEqual([
      { key: 'child', name: 'After' },
      { key: 'other', name: 'Unsaved owner row' },
    ]);
    expect(surface.originalEntries[1]).toEqual({ key: 'other', name: 'Persisted owner row' });
    expect(surface.workspaceValue('customDraftValue')).toBe('keep-me');
    expect(surface.transactionSnapshot().mutations).toEqual(
      normalizeWorkspaceTransaction({
        version: 1,
        mutations: [siblingMutation, childMutation],
      }).mutations,
    );
  });

  it('owns hierarchy membership placement, removal and original hydration semantically', () => {
    const levelValue: UiCtxObject = {
      state: {},
      data: {
        list: {
          entries: [
            { id: 'root', name: 'Root', type: 'company', parentId: null },
            { id: 'child', name: 'Child', type: 'person', parentId: 'root' },
          ],
          originalEntries: [{ id: 'root', name: 'Root', type: 'company', parentId: null }],
        },
        resources: { workspace: { originalMemberId: 'root' } },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-relations',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    // A partial early adopter (owned-entry/recovery resource access) must be safely
    // upgraded when the hierarchy workspace later supplies its behavioral policy.
    const surface = new OrganizationHierarchySurface(level).configure({
      identityField: 'id',
      rootField: 'rootId',
      relationship: {
        identityField: 'id',
        parentField: 'parentId',
        typeField: 'type',
        containerTrait: 'container',
        canHaveParentTrait: 'canParent',
        typeOptions: [
          { value: 'company', container: true, canParent: false },
          { value: 'group', container: true, canParent: true },
          { value: 'person', container: false, canParent: true },
        ],
      },
    });

    expect(surface.relationshipTypeOption(surface.entries[0]!)).toMatchObject({
      value: 'company',
      container: true,
    });
    expect(surface.removeMember('root')).toEqual({
      changed: false,
      reason: 'The original Organization member cannot be removed.',
    });
    expect(
      surface.hydrateOriginalSnapshots([
        { id: 'child', name: 'Persisted Child', type: 'person', parentId: 'root' },
      ]),
    ).toBe(true);
    expect(surface.originalEntries).toContainEqual({
      id: 'child',
      name: 'Persisted Child',
      type: 'person',
      parentId: 'root',
    });

    expect(
      surface.addExistingMemberForRelation(
        { id: 'group', name: 'Group', type: 'group', parentId: null },
        'child',
        'parent',
      ),
    ).toEqual({ changed: true, reason: null });
    expect(surface.entries.find((row) => row.id === 'child')?.parentId).toBe('group');
    expect(surface.entries.find((row) => row.id === 'group')?.parentId).toBe('root');
    expect(surface.originalEntries.some((row) => row.id === 'group')).toBe(true);

    expect(surface.removeMember('group').reason).toMatch(/children/);
    expect(surface.reparentMember('child', 'root', 'restore-child')).toBe(true);
    const editedGroup = surface.entries.map((row) =>
      row.id === 'group' ? { ...row, name: 'Edited before delete', rootId: 'root' } : row,
    );
    surface.replaceEntries(editedGroup, 'edit-before-delete');
    expect(surface.removeMember('group')).toEqual({ changed: true, reason: null });
    expect(surface.entries.some((row) => row.id === 'group')).toBe(false);
    expect(surface.originalEntries.some((row) => row.id === 'group')).toBe(true);
    expect(surface.recycleBin).toContainEqual(
      expect.objectContaining({ id: 'group', name: 'Edited before delete' }),
    );

    expect(surface.restoreRecycledMember('group')).toEqual({ changed: true, reason: null });
    expect(surface.entries).toContainEqual(
      expect.objectContaining({
        id: 'group',
        name: 'Edited before delete',
        parentId: null,
        rootId: null,
      }),
    );
    expect(surface.recycleBin).toEqual([]);
  });

  it('rejects non-hierarchy UiLevels', () => {
    const levelValue: UiCtxObject = { state: {}, data: {} };
    const value: UiCtxObject = { ctx: { ui: { level: levelValue } } };
    const context = new UiContext('ctx.ui.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'entry-1',
      'level1',
      { surface: 'entry', host: 'page' },
      context,
    );
    expect(() => new OrganizationHierarchySurface(level)).toThrow(/requires a hierarchy UiLevel/);
  });
});

// Stage 21.9g-B proof: the canonical recursive transaction is itself the outage-recovery payload.
describe('Organization heterogeneous transaction recovery', () => {
  it('round-trips mixed staged entities and rematerializes an owned Entry from recovered semantic state', () => {
    const principalDraftId = 'draft:principal-1';
    const userDraftId = 'draft:user-1';
    const licenseDraftId = 'draft:license-1';
    const principalMutation = {
      mutationId: `sys-principals:${principalDraftId}`,
      entityKey: 'sys-principals',
      identity: principalDraftId,
      identityKind: 'workspace' as const,
      operation: 'create' as const,
      original: null,
      current: { id: principalDraftId, name: 'Recovered organization member', parentId: 'p-root' },
      references: [
        {
          key: 'parentId',
          entityKey: 'sys-principals',
          identity: 'p-root',
          identityKind: 'persistent' as const,
        },
      ],
      children: [
        {
          mutationId: `sys-users:${userDraftId}`,
          entityKey: 'sys-users',
          identity: userDraftId,
          identityKind: 'workspace' as const,
          operation: 'create' as const,
          original: null,
          current: { id: userDraftId, principalId: principalDraftId, email: 'draft@example.test' },
          references: [
            {
              key: 'principalId',
              entityKey: 'sys-principals',
              identity: principalDraftId,
              identityKind: 'workspace' as const,
            },
          ],
          children: [
            {
              mutationId: `sys-licenses:${licenseDraftId}`,
              entityKey: 'sys-licenses',
              identity: licenseDraftId,
              identityKind: 'workspace' as const,
              operation: 'create' as const,
              original: null,
              current: { id: licenseDraftId, principalId: principalDraftId, enabled: true },
              references: [
                {
                  key: 'principalId',
                  entityKey: 'sys-principals',
                  identity: principalDraftId,
                  identityKind: 'workspace' as const,
                },
              ],
            },
          ],
        },
      ],
    };
    const existingPrincipalMutation = {
      mutationId: 'sys-principals:p-existing',
      entityKey: 'sys-principals',
      identity: 'p-existing',
      identityKind: 'persistent' as const,
      operation: 'update' as const,
      original: { id: 'p-existing', name: 'Before', description: 'Persisted' },
      current: { id: 'p-existing', name: 'After outage', description: 'Persisted' },
      changedFields: ['name'],
      collections: {
        addresses: {
          original: [{ id: 'address-1', city: 'Athens' }],
          current: [{ id: 'address-1', city: 'Sofia' }],
        },
      },
    };
    const recoveredEntries = [
      { id: 'p-root', name: 'Root', parentId: null },
      { id: 'p-existing', name: 'After outage', description: 'Persisted', parentId: 'p-root' },
      { id: principalDraftId, name: 'Recovered organization member', parentId: 'p-root' },
    ];
    const recoveredOriginalEntries = [
      { id: 'p-root', name: 'Root', parentId: null },
      { id: 'p-existing', name: 'Before', description: 'Persisted', parentId: 'p-root' },
    ];
    const outagePayload = JSON.parse(
      JSON.stringify({
        entries: recoveredEntries,
        entriesOriginal: recoveredOriginalEntries,
        workspaceTransaction: {
          version: 1,
          mutations: [existingPrincipalMutation, principalMutation],
        },
      }),
    );

    const levelValue: UiCtxObject = {
      state: {},
      data: {
        list: { entries: [], originalEntries: [] },
        resources: { workspace: {}, workspaceTransaction: { version: 1, mutations: [] } },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-recovered',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, { identityField: 'id' });

    surface.replaceEntries(outagePayload.entries, 'workspace-recovery');
    surface.replaceOriginalEntries(outagePayload.entriesOriginal, 'workspace-recovery-original');
    surface.replaceTransaction(
      outagePayload.workspaceTransaction,
      'workspace-recovery-transaction',
    );

    expect(surface.entries).toEqual(recoveredEntries);
    expect(surface.originalEntries).toEqual(recoveredOriginalEntries);
    expect(surface.transactionSnapshot()).toEqual(outagePayload.workspaceTransaction);

    const reopenedExisting = surface.ownedEntryInvocation('sys-principals', 'p-existing');
    expect(reopenedExisting.current).toMatchObject({ name: 'After outage' });
    expect(reopenedExisting.original).toMatchObject({ name: 'Before' });
    expect(reopenedExisting.existingMutation).toEqual(existingPrincipalMutation);

    const reopenedDraft = surface.ownedEntryInvocation('sys-principals', principalDraftId);
    expect(reopenedDraft.identity).toBe(principalDraftId);
    expect(reopenedDraft.current).toEqual(principalMutation.current);
    expect(reopenedDraft.existingMutation).toEqual(principalMutation);
    expect(reopenedDraft.workspaceIdentities).toEqual(
      expect.arrayContaining([
        `sys-principals:${principalDraftId}`,
        `sys-users:${userDraftId}`,
        `sys-licenses:${licenseDraftId}`,
      ]),
    );
    expect(reopenedDraft.existingMutation?.children?.[0]?.references?.[0]).toMatchObject({
      identity: principalDraftId,
      identityKind: 'workspace',
    });
  });
  it('preserves the persisted baseline when a member is removed', () => {
    const levelValue: UiCtxObject = {
      state: { dirty: false },
      data: {
        list: {
          entries: [
            { id: 'root', parentId: null, type: 'Company' },
            { id: 'child', parentId: 'root', type: 'Person' },
          ],
          originalEntries: [
            { id: 'root', parentId: null, type: 'Company' },
            { id: 'child', parentId: 'root', type: 'Person' },
          ],
        },
        resources: { workspaceTransaction: { version: 1, mutations: [] } },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-remove',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, {
      relationship: { identityField: 'id', parentField: 'parentId', typeField: 'type' },
    });

    expect(surface.removeMember('child').changed).toBe(true);
    expect(surface.entries.map((entry) => entry.id)).toEqual(['root']);
    expect(surface.originalEntries.map((entry) => entry.id)).toEqual(['root', 'child']);
    expect(context.get('state.dirty')).toBe(true);
  });

  it('promotes a successful Commit to the clean aggregate baseline before navigation', () => {
    const levelValue: UiCtxObject = {
      state: { dirty: true },
      data: {
        list: {
          entries: [{ id: 'p1', name: 'After' }],
          originalEntries: [{ id: 'p1', name: 'Before' }],
        },
        resources: {
          workspaceTransaction: {
            version: 1,
            mutations: [
              {
                mutationId: 'p1',
                entityKey: 'sys-principals',
                identity: 'p1',
                identityKind: 'persistent',
                operation: 'update',
                original: { id: 'p1', name: 'Before' },
                current: { id: 'p1', name: 'After' },
              },
            ],
          },
        },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-commit',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, { identityField: 'id' });

    expect(surface.dirty).toBe(true);
    surface.acceptCommittedBaseline();
    expect(surface.originalEntries).toEqual(surface.entries);
    expect(surface.transactionSnapshot().mutations).toEqual([]);
    expect(context.get('state.dirty')).toBe(false);
  });
});

// Persistence and dirty state are orthogonal presentation dimensions for Organization members.
describe('organization hierarchy entry-state projection', () => {
  it('classifies persisted unchanged, persisted changed, and draft members without mutable flags', async () => {
    const { organizationHierarchyEntryState } =
      await import('../../src/runtime/v2/organization-hierarchy-surface.js');
    const original = { id: 'persisted-1', name: 'Before', parentId: null };
    expect(organizationHierarchyEntryState(original, [original])).toEqual({
      persisted: true,
      changed: false,
    });
    expect(organizationHierarchyEntryState({ ...original, name: 'After' }, [original])).toEqual({
      persisted: true,
      changed: true,
    });
    expect(
      organizationHierarchyEntryState({ id: 'persisted-2', name: 'Added existing' }, [original]),
    ).toEqual({ persisted: true, changed: false });
    expect(organizationHierarchyEntryState({ id: 'draft:new', name: 'New' }, [original])).toEqual({
      persisted: false,
      changed: false,
    });
  });

  it('stages heterogeneous owned results without projecting them into Principal hierarchy rows', () => {
    const levelValue: UiCtxObject = {
      state: { dirty: false },
      data: {
        list: {
          entries: [{ id: 'p1', name: 'Principal' }],
          originalEntries: [{ id: 'p1', name: 'Principal' }],
        },
        resources: { workspaceTransaction: { version: 1, mutations: [] } },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-external',
      'level1',
      { surface: 'hierarchy', host: 'page', entity: 'sys-principals' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, { identityField: 'id' });
    expect(surface.canOwnExternalEntity('sys-users')).toBe(true);
    expect(surface.canOwnExternalEntity('sys-principals')).toBe(false);

    const invocation = surface.newOwnedEntryInvocation('sys-users', 'draft:u1');

    expect(invocation.current).toEqual({ id: 'draft:u1' });
    expect(invocation.original).toBeNull();
    expect(invocation.workspaceIdentities).toContain('sys-users:draft:u1');

    surface.applyOwnedEntryResult({
      entityKey: 'sys-users',
      identity: 'draft:u1',
      record: { id: 'draft:u1', name: 'New User' },
      mutation: {
        mutationId: 'sys-users:draft:u1',
        entityKey: 'sys-users',
        identity: 'draft:u1',
        identityKind: 'workspace',
        operation: 'create',
        original: null,
        current: { id: 'draft:u1', name: 'New User' },
      },
    });

    expect(surface.entries).toEqual([{ id: 'p1', name: 'Principal' }]);
    expect(surface.transactionSnapshot().mutations).toHaveLength(1);
    expect(surface.transactionSnapshot().mutations[0]?.entityKey).toBe('sys-users');
    expect(surface.ownedEntryInvocationIfPresent('sys-users', 'draft:u1')).toMatchObject({
      entityKey: 'sys-users',
      identity: 'draft:u1',
      original: null,
    });
    expect(surface.workspaceIdentitySnapshot()).toContain('sys-users:draft:u1');

    surface.applyOwnedEntryResult({
      entityKey: 'sys-users',
      identity: 'draft:u1',
      record: { id: 'draft:u1', name: 'New User' },
      removeMutationId: 'sys-users:draft:u1',
    });
    expect(surface.ownedEntryInvocationIfPresent('sys-users', 'draft:u1')).toBeNull();
    expect(surface.transactionSnapshot().mutations).toEqual([]);
  });
  it('installs owned resources before publishing semantic pending descriptors', () => {
    const levelValue: UiCtxObject = {
      state: { dirty: false },
      data: {
        list: { entries: [{ id: 'org-1' }], originalEntries: [{ id: 'org-1' }] },
        resources: { workspaceTransaction: { version: 1, mutations: [] } },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const listeners = new Map<string, Array<() => void>>();
    const port: UiCtxRuntimePort = {
      ...portFor(value),
      replace: (path, next) => {
        const parts = path.split('.');
        let node: Record<string, unknown> = value;
        for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
        node[parts.at(-1)!] = next;
        for (const listener of listeners.get(path) ?? []) listener();
        return next;
      },
      subscribe: (path, listener) => {
        const callbacks = listeners.get(path) ?? [];
        const callback = () => listener({ operation: 'replace', path });
        callbacks.push(callback);
        listeners.set(path, callbacks);
        return () =>
          listeners.set(
            path,
            callbacks.filter((candidate) => candidate !== callback),
          );
      },
    };
    const context = new UiContext('ctx.ui.level.level', levelValue, port);
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'hierarchy-resource-order',
      'level1',
      { surface: 'hierarchy', host: 'page', entity: 'sys-principals' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level, { identityField: 'id' });
    let observedResource: unknown = null;
    context.subscribe('data.resources.workspaceTransaction', () => {
      observedResource = level.getRuntimeResource('picture:pending:photo-atomic');
    });

    surface.applyOwnedEntryResult({
      entityKey: 'sys-users',
      identity: 'draft:u1',
      record: { id: 'draft:u1' },
      mutation: {
        mutationId: 'sys-users:draft:u1',
        entityKey: 'sys-users',
        identity: 'draft:u1',
        identityKind: 'workspace',
        operation: 'create',
        original: null,
        current: {
          id: 'draft:u1',
          photo: { pending: true, revision: 'pending:photo-atomic', contentType: 'image/jpeg' },
        },
      },
      runtimeResources: {
        'picture:pending:photo-atomic': { dataUrl: 'data:image/jpeg;base64,AA==' },
      },
    });

    expect(observedResource).toEqual({ dataUrl: 'data:image/jpeg;base64,AA==' });
  });

  it('captures every pending resource referenced by heterogeneous workspace mutations', () => {
    const levelValue: UiCtxObject = {
      state: { dirty: false },
      data: {
        list: { entries: [{ id: 'org-1' }], originalEntries: [{ id: 'org-1' }] },
        resources: {
          workspace: { focusedMemberId: 'org-1' },
          workspaceTransaction: {
            version: 1,
            mutations: [
              {
                mutationId: 'sys-users:workspace:u1',
                entityKey: 'sys-users',
                identity: 'workspace:u1',
                identityKind: 'workspace',
                operation: 'create',
                original: null,
                current: {
                  id: 'workspace:u1',
                  photo: { pending: true, revision: 'pending:photo-1', contentType: 'image/jpeg' },
                },
              },
            ],
          },
        },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: { level: levelValue } } } };
    const context = new UiContext('ctx.ui.level.level', levelValue, portFor(value));
    const root = UiLevel.structuralRoot('$root');
    const level = UiLevel.child(
      root,
      'hierarchy-resources',
      'level1',
      { surface: 'hierarchy', host: 'page' },
      context,
    );
    const surface = new OrganizationHierarchySurface(level);
    level.setRuntimeResource('picture:pending:photo-1', {
      contentType: 'image/jpeg',
      dataBase64: 'bytes',
    });
    level.setRuntimeResource('picture:pending:unreferenced', { dataBase64: 'unused' });

    expect(surface.recoverableRuntimeResourceSnapshot()).toEqual({
      'picture:pending:photo-1': { contentType: 'image/jpeg', dataBase64: 'bytes' },
    });
    level.deleteRuntimeResource('picture:pending:photo-1');
    expect(() => surface.recoverableRuntimeResourceSnapshot()).toThrow(
      "Organization recovery is missing required runtime resource 'picture:pending:photo-1'.",
    );
  });
});

describe('OrganizationHierarchySurface owned Entry Save boundary', () => {
  const metadata = {
    key: 'sys-users',
    fieldDefinition: {
      id: { key: 'id', label: 'Id', type: 'string', order: 1 },
      name: { key: 'name', label: 'Name', type: 'string', order: 2 },
      photo: { key: 'photo', label: 'Photo', type: 'picture', order: 3 },
    },
  } as any;

  const ownedFixture = () => {
    const levelValue: UiCtxObject = {
      state: {},
      data: {
        list: {
          entries: [{ id: 'p1', name: 'Principal A' }],
          originalEntries: [{ id: 'p1', name: 'Principal A' }],
        },
        resources: {
          workspace: { focusedMemberId: 'p1', identityField: 'id' },
          workspaceTransaction: { version: 1, mutations: [] },
          recycleBin: [],
        },
      },
    };
    const value: UiCtxObject = { ctx: { ui: { level: levelValue } } };
    const context = new UiContext('ctx.ui.level', levelValue, portFor(value));
    const level = UiLevel.child(
      UiLevel.structuralRoot('$root'),
      'organization-1',
      'level1',
      { surface: 'hierarchy', host: 'page', entity: 'sys-principals' },
      context,
    );
    return new OrganizationHierarchySurface(level, { identityField: 'id' });
  };

  it('accepts a root Entry into entries while preserving the ultimate original', () => {
    const surface = ownedFixture();
    const invocation = surface.ownedEntryInvocation('sys-principals', 'p1');

    surface.acceptOwnedEntrySave(
      {
        entityKey: 'sys-principals',
        mode: 'edit',
        original: { id: 'p1', name: 'Principal A' },
        current: { id: 'p1', name: 'Principal B' },
      },
      invocation,
      { key: 'sys-principals', fieldDefinition: {} } as any,
      {},
    );

    expect(surface.entries).toEqual([{ id: 'p1', name: 'Principal B' }]);
    expect(surface.originalEntries).toEqual([{ id: 'p1', name: 'Principal A' }]);
  });

  it('merges only semantically changed root Entry fields back into Organization', () => {
    const surface = ownedFixture();
    const invocation = surface.ownedEntryInvocation('sys-principals', 'p1');

    surface.acceptOwnedEntrySave(
      {
        entityKey: 'sys-principals',
        mode: 'edit',
        original: { id: 'p1', name: 'Principal A', firstName: null, lastName: null },
        current: { id: 'p1', name: 'Principal B', firstName: null, lastName: null },
      },
      invocation,
      { key: 'sys-principals', fieldDefinition: {} } as any,
      {},
    );

    expect(surface.entries).toEqual([{ id: 'p1', name: 'Principal B' }]);
    expect(surface.originalEntries).toEqual([{ id: 'p1', name: 'Principal A' }]);
  });

  it('accepts external A→B→C saves into one mutation and transfers pending resources', () => {
    const surface = ownedFixture();
    const opening = {
      version: 1 as const,
      entityKey: 'sys-users',
      identity: 'u1',
      identityField: 'id',
      current: { id: 'u1', name: 'A', photo: null },
      original: { id: 'u1', name: 'A', photo: null },
      parentMutationId: null,
      workspaceIdentities: [],
    };
    const pending = {
      pending: true,
      revision: 'pending:photo-1',
      name: 'avatar.png',
    };
    const resource = { contentType: 'image/png', base64: 'AA==' };

    surface.acceptOwnedEntrySave(
      {
        entityKey: 'sys-users',
        mode: 'edit',
        original: opening.current,
        current: { id: 'u1', name: 'B', photo: pending },
      },
      opening,
      metadata,
      { 'picture:pending:photo-1': resource },
    );
    const afterB = surface.ownedEntryInvocation('sys-users', 'u1');
    surface.acceptOwnedEntrySave(
      {
        entityKey: 'sys-users',
        mode: 'edit',
        original: afterB.current,
        current: { id: 'u1', name: 'C', photo: pending },
      },
      afterB,
      metadata,
      { 'picture:pending:photo-1': resource },
    );

    const mutation = surface.transactionSnapshot().mutations[0];
    expect(mutation).toMatchObject({
      entityKey: 'sys-users',
      identity: 'u1',
      operation: 'update',
      original: { id: 'u1', name: 'A', photo: null },
      current: { id: 'u1', name: 'C', photo: pending },
    });
    expect(surface.transactionSnapshot().mutations).toHaveLength(1);
    expect(surface.runtimeResourceSnapshot()['picture:pending:photo-1']).toEqual(resource);
  });
});
