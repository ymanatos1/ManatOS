import { beforeEach, describe, expect, it } from 'vitest';

import {
  entrySemanticChangeReport,
  hierarchySemanticChangeReport,
  recoveredFieldDeltaReport,
} from '../../src/runtime/v2/semantic-change-report.js';

describe('hierarchy semantic change report', () => {
  beforeEach(() => {
    (globalThis as any).ManatOS = {
      semanticChangePresentation: {
        entityContext: () => ({ metadata: {} }),
        entryDescriptor: (
          _entityKey: string,
          row: Readonly<Record<string, unknown>>,
          identityField: string,
          options: any,
        ) => ({
          label: String(
            row.name ?? row.userName ?? row[identityField] ?? options.fallbackIdentity ?? 'Entry',
          ),
          icons: [],
          ownerWorkspaceState: options.ownerWorkspaceState === true,
        }),
        fieldLabel: (_entity: string, field: string) => field,
        changeDetail: ({ fieldKey, before, after }: any) => ({
          fieldKey,
          label: fieldKey,
          from: { label: String(before ?? '∅') },
          to: { label: String(after ?? '∅') },
        }),
      },
    };
  });

  it('passes the owning Entry CTX path to canonical field presentation', () => {
    (globalThis as any).ManatOS.semanticChangePresentation.changeDetail = ({
      fieldKey,
      before,
      after,
      ownerPath,
    }: any) => ({
      fieldKey,
      label: fieldKey,
      from: { label: `${ownerPath}:${String(before)}` },
      to: { label: `${ownerPath}:${String(after)}` },
    });

    const model = entrySemanticChangeReport({
      entityKey: 'sys-principals',
      caption: 'Principal',
      ownerPath: 'ctx.ui.level.level',
      original: { userId: 'old-user' },
      current: { userId: 'new-user' },
    });

    expect(model.nodes[0]?.children[0]?.details[0]).toEqual(
      expect.objectContaining({
        fieldKey: 'userId',
        from: { label: 'ctx.ui.level.level:old-user' },
        to: { label: 'ctx.ui.level.level:new-user' },
      }),
    );
  });

  it('passes the owning hierarchy CTX path to canonical reference presentation', () => {
    (globalThis as any).ManatOS.semanticChangePresentation.changeDetail = ({
      fieldKey,
      before,
      after,
      ownerPath,
    }: any) => ({
      fieldKey,
      label: fieldKey,
      from: { label: `${ownerPath}:${String(before)}` },
      to: { label: `${ownerPath}:${String(after)}` },
    });

    const model = hierarchySemanticChangeReport({
      entityKey: 'sys-principals',
      ownerPath: 'ctx.ui.level.level',
      entriesOriginal: [{ id: 'p1', userId: null }],
      entries: [{ id: 'p1', userId: 'user-1' }],
      workspaceTransaction: { version: 1, mutations: [] },
    });

    expect(model.nodes[0]?.children[0]?.children[0]?.details[0]).toEqual(
      expect.objectContaining({
        fieldKey: 'userId',
        from: { label: 'ctx.ui.level.level:null' },
        to: { label: 'ctx.ui.level.level:user-1' },
      }),
    );
  });

  it('treats object key order as semantically equal when reporting changes', () => {
    const model = entrySemanticChangeReport({
      entityKey: 'sys-principals',
      caption: 'Principal',
      original: { settings: { alpha: 1, nested: { beta: 2 } } },
      current: { settings: { nested: { beta: 2 }, alpha: 1 } },
    });

    expect(model.summary).toBe('0 changes in this entry.');
    expect(model.nodes[0]?.children).toEqual([]);
  });

  it('reports hierarchy semantic changes without requiring a persistence CommitPlan', () => {
    const model = hierarchySemanticChangeReport({
      entityKey: 'sys-principals',
      caption: 'Principals organization',
      identityField: 'id',
      entriesOriginal: [
        { id: 'root', name: 'Root', parentId: null },
        { id: 'existing', name: 'Existing', parentId: null },
        { id: 'removed', name: 'Removed', parentId: 'root' },
      ],
      entries: [
        { id: 'root', name: 'Root', parentId: null },
        { id: 'existing', name: 'Existing', parentId: 'root' },
        { id: 'draft:new', name: 'New', parentId: 'root' },
      ],
      workspaceTransaction: { version: 1, mutations: [] },
    });

    expect(model.summary).toBe('3 changes in this organization workspace.');
    expect(model.nodes[0]?.children.map((node: any) => node.label)).toEqual([
      'Added to organization',
      'Changed members',
      'Removed from organization',
    ]);
    const added = model.nodes[0]?.children[0]?.children[0];
    expect(added.details).toEqual([
      expect.objectContaining({ fieldKey: 'name', value: { label: 'New' } }),
      expect.objectContaining({ fieldKey: 'parentId', value: { label: 'root' } }),
    ]);
    const changed = model.nodes[0]?.children[1]?.children[0];
    expect(changed.label).toBe('Existing');
    expect(changed.entryDescriptor?.ownerWorkspaceState).toBe(false);
    expect(changed.details).toEqual([
      expect.objectContaining({
        fieldKey: 'parentId',
        from: { label: '∅' },
        to: { label: 'root' },
      }),
    ]);
  });

  it('resolves workspace references from canonical mutation references and groups related changes by entity', () => {
    const semantic = (globalThis as any).ManatOS.semanticChangePresentation;
    semantic.entityLabel = (entityKey: string) => (entityKey === 'sys-users' ? 'Users' : entityKey);
    semantic.entityIcon = (entityKey: string) => (entityKey === 'sys-users' ? 'person' : 'box');
    semantic.entryDescriptor = (
      _entityKey: string,
      row: Readonly<Record<string, unknown>>,
      _identityField: string,
      options: any,
    ) => ({
      label: String(row.userName ?? options.fallbackIdentity ?? 'Entry'),
      icons: ['bi-person'],
      ownerWorkspaceState: options.ownerWorkspaceState === true,
    });

    const model = hierarchySemanticChangeReport({
      entityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [{ id: 'p1', name: 'Principal', userId: null }],
      entries: [{ id: 'p1', name: 'Principal', userId: 'draft:user-1' }],
      workspaceTransaction: {
        version: 1,
        mutations: [
          {
            mutationId: 'principal-p1',
            entityKey: 'sys-principals',
            identity: 'p1',
            identityKind: 'persistent',
            operation: 'update',
            original: { id: 'p1', name: 'Principal', userId: null },
            current: { id: 'p1', name: 'Principal', userId: 'draft:user-1' },
            changedFields: ['userId'],
            references: [
              {
                key: 'userId',
                entityKey: 'sys-users',
                identity: 'draft:user-1',
                identityKind: 'workspace',
              },
            ],
            children: [
              {
                mutationId: 'user-draft',
                entityKey: 'sys-users',
                identity: 'draft:user-1',
                identityKind: 'workspace',
                operation: 'create',
                original: null,
                current: { userName: 'Mitsos' },
              },
            ],
          },
        ],
      },
    });

    const changed = model.nodes[0]?.children.find((node: any) => node.label === 'Changed members');
    expect(changed.children[0].details[0].to).toEqual({
      label: 'Mitsos',
      icons: ['bi-person'],
      ownerWorkspaceState: true,
    });
    const related = model.nodes[0]?.children.find((node: any) => node.label === 'Related changes');
    expect(related.children).toHaveLength(1);
    expect(related.children[0]).toEqual(
      expect.objectContaining({ label: 'Users', icon: 'bi-person', count: 1 }),
    );
    expect(related.children[0].children[0]).toEqual(
      expect.objectContaining({
        label: 'Mitsos',
        status: 'create',
        entryDescriptor: expect.objectContaining({
          label: 'Mitsos',
          ownerWorkspaceState: true,
        }),
      }),
    );
  });

  it('shows root collection changes semantically without duplicating root persistence mutations', () => {
    const model = hierarchySemanticChangeReport({
      entityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [{ id: 'p1', name: 'Principal' }],
      entries: [{ id: 'p1', name: 'Principal' }],
      workspaceTransaction: {
        version: 1,
        mutations: [
          {
            mutationId: 'principal-p1',
            entityKey: 'sys-principals',
            identity: 'p1',
            identityKind: 'persistent',
            operation: 'update',
            original: { id: 'p1', name: 'Principal' },
            current: { id: 'p1', name: 'Principal' },
            changedFields: [],
            collections: {
              emailAddresses: { original: [], current: [{ emailAddress: 'a@example.com' }] },
            },
          },
        ],
      },
    });

    expect(model.summary).toBe('1 change in this organization workspace.');
    expect(model.nodes[0]?.children.map((node: any) => node.label)).toEqual(['Changed members']);
    const member = model.nodes[0]?.children[0]?.children[0];
    expect(member.children[0]).toEqual(
      expect.objectContaining({ label: 'Related collections', count: 1 }),
    );
    expect(JSON.stringify(model)).not.toContain('sys-principals');
  });

  it('presents captured recovery field deltas through the canonical semantic catalogue', () => {
    (globalThis as any).ManatOS.semanticChangePresentation.fieldDescriptor = (
      _entity: string,
      field: string,
      value: unknown,
      ownerPath: string,
    ) => (field === 'userId' ? { label: `${ownerPath}:User ${String(value)}` } : null);
    (globalThis as any).ManatOS.semanticChangePresentation.descriptor = (value: unknown) => ({
      label: String(value ?? '∅'),
    });

    const model = recoveredFieldDeltaReport({
      entityKey: 'sys-principals',
      caption: 'Principal — Ours Admin',
      ownerPath: 'ctx.ui.level.level.level',
      fields: { userId: { restoredValue: 'user-1' }, name: { restoredValue: 'Ours Admin' } },
    });

    expect(model.nodes[0]?.details).toEqual([
      expect.objectContaining({
        label: 'userId',
        value: { label: 'ctx.ui.level.level.level:User user-1' },
      }),
      expect.objectContaining({ label: 'name', value: { label: 'Ours Admin' } }),
    ]);
  });

  it('keeps recycle-bin lifecycle and pre-deletion change state orthogonal', () => {
    const model = hierarchySemanticChangeReport({
      entityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [
        { id: 'removed-changed', name: 'Before', parentId: 'root' },
        { id: 'removed-plain', name: 'Plain', parentId: 'root' },
      ],
      entries: [],
      recycleBin: [
        { id: 'removed-changed', name: 'After', parentId: 'root' },
        { id: 'removed-plain', name: 'Plain', parentId: 'root' },
      ],
      workspaceTransaction: { version: 1, mutations: [] },
    });

    const removed = model.nodes[0]?.children.find(
      (node: any) => node.label === 'Removed from organization',
    );
    expect(removed.children[0].statuses).toEqual(['recycle bin', 'changed']);
    expect(removed.children[0].details).toEqual([
      expect.objectContaining({
        fieldKey: 'name',
        from: { label: 'Before' },
        to: { label: 'After' },
      }),
    ]);
    expect(removed.children[1].statuses).toEqual(['recycle bin']);
    expect(removed.children[1].details).toBeUndefined();
  });
});
