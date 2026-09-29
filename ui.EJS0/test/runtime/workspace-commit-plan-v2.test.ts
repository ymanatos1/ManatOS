import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceCommitPlan,
  commitPlanReportModel,
} from '../../src/runtime/v2/workspace-commit-plan.js';

describe('immutable workspace CommitPlan', () => {
  it('orders newly-created identity providers before consumers and freezes the reviewed plan', () => {
    const plan = buildWorkspaceCommitPlan({
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [],
      entries: [
        { id: 'draft:child', name: 'Child', parentId: 'draft:parent' },
        { id: 'draft:parent', name: 'Parent', parentId: null },
      ],
      workspaceTransaction: { version: 1, mutations: [] },
    });
    const parent = plan.operations.find((item) => item.identity === 'draft:parent')!;
    const child = plan.operations.find((item) => item.identity === 'draft:child')!;
    expect(child.dependsOn).toContain(parent.operationId);
    expect(plan.executionOrder.indexOf(parent.operationId)).toBeLessThan(
      plan.executionOrder.indexOf(child.operationId),
    );
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.operations)).toBe(true);
  });

  it('orders heterogeneous workspace references recursively and rejects unresolved references', () => {
    const base = {
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entries: [],
      entriesOriginal: [],
      workspaceTransaction: {
        version: 1 as const,
        mutations: [
          {
            mutationId: 'user',
            entityKey: 'sys-users',
            identity: 'workspace:user',
            identityKind: 'workspace' as const,
            operation: 'create' as const,
            original: null,
            current: { id: 'workspace:user', userName: 'new-user' },
            children: [
              {
                mutationId: 'license',
                entityKey: 'sys-licenses',
                identity: 'workspace:license',
                identityKind: 'workspace' as const,
                operation: 'create' as const,
                original: null,
                current: { id: 'workspace:license' },
                references: [
                  {
                    key: 'userId',
                    entityKey: 'sys-users',
                    identity: 'workspace:user',
                    identityKind: 'workspace' as const,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const plan = buildWorkspaceCommitPlan(base);
    expect(plan.executionOrder).toEqual(['mutation:user', 'mutation:license']);
    expect(() =>
      buildWorkspaceCommitPlan({
        ...base,
        workspaceTransaction: {
          version: 1,
          mutations: [
            {
              ...base.workspaceTransaction.mutations[0]!,
              mutationId: 'broken',
              references: [
                {
                  key: 'x',
                  entityKey: 'future',
                  identity: 'missing',
                  identityKind: 'workspace' as const,
                },
              ],
            },
          ],
        },
      }),
    ).toThrow(/unresolved workspace identity/);
  });

  it('reports every operation expanded initially with exact update fields', () => {
    const plan = buildWorkspaceCommitPlan({
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [{ id: 'p1', name: 'Before', description: 'same' }],
      entries: [{ id: 'p1', name: 'After', description: 'same' }],
    });
    const model = commitPlanReportModel(plan);
    expect(model.nodes[0]?.entityKey).toBe('sys-principals');
    expect(model.nodes[0]?.expanded).toBe(true);
    expect(model.nodes[0]?.children[0]?.expanded).toBe(true);
    expect(model.nodes[0]?.children[0]?.children[0]?.expanded).toBe(true);
    expect(model.nodes[0]?.children[0]?.children[0]?.details).toHaveLength(1);
    expect(model.nodes[0]?.children[0]?.children[0]?.details[0]?.fieldKey).toBe('name');
    expect(model.nodes[0]?.children[0]?.children[0]?.identity).toBe('p1');
    expect(model.nodes[0]?.children[0]?.children[0]?.details[0]?.from?.rawValue).toBe('Before');
    expect(model.nodes[0]?.children[0]?.children[0]?.details[0]?.to?.rawValue).toBe('After');
  });

  it('omits empty create values and the workspace identity from the user-facing report', () => {
    const plan = buildWorkspaceCommitPlan({
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [],
      entries: [
        { id: 'draft:p1', name: 'Nickos Galis', description: '', photo: null, enabled: true },
      ],
    });
    const report = commitPlanReportModel(plan);
    const details = report.nodes[0]?.children[0]?.children[0]?.details ?? [];
    expect(details.map((detail) => detail.fieldKey)).toEqual(['name', 'enabled']);
  });

  it('reconciles a root draft and its recursive workspace mutation into one create', () => {
    const plan = buildWorkspaceCommitPlan({
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [],
      entries: [{ id: 'draft:p1', name: 'Nickos Galis', parentId: null }],
      workspaceTransaction: {
        version: 1,
        mutations: [
          {
            mutationId: 'principal-p1',
            entityKey: 'sys-principals',
            identity: 'draft:p1',
            identityKind: 'workspace',
            operation: 'create',
            original: null,
            current: { id: 'draft:p1', name: 'Nickos Galis' },
            references: [],
          },
        ],
      },
    });
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.identity).toBe('draft:p1');
    expect(plan.operations[0]?.kind).toBe('create');
    expect(plan.operations[0]?.current?.parentId).toBeNull();
    const report = commitPlanReportModel(plan, { blockers: ['Organization has no root.'] });
    expect(report.summary).toContain('Commit is currently unavailable');
    expect(report.nodes[0]?.label).toBe('Incomplete organization');
  });

  it('lets final deletion of a persistent root member dominate its retained update mutation', () => {
    const original = { id: 'p1', name: 'Panayiotis', description: 'Before' };
    const edited = { ...original, description: 'Edited before removal' };
    const plan = buildWorkspaceCommitPlan({
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [original],
      entries: [],
      workspaceTransaction: {
        version: 1,
        mutations: [
          {
            mutationId: 'principal-p1-update',
            entityKey: 'sys-principals',
            identity: 'p1',
            identityKind: 'persistent',
            operation: 'update',
            original,
            current: edited,
            changedFields: ['description'],
            references: [],
          },
        ],
      },
    });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.identity).toBe('p1');
    expect(plan.operations[0]?.kind).toBe('delete');
    expect(plan.operations[0]?.original).toEqual(original);
    expect(plan.operations[0]?.current).toBeNull();
  });

  it('uses the retained update again when the removed persistent member is restored', () => {
    const original = { id: 'p1', name: 'Panayiotis', description: 'Before' };
    const edited = { ...original, description: 'Edited before removal' };
    const plan = buildWorkspaceCommitPlan({
      rootEntityKey: 'sys-principals',
      identityField: 'id',
      entriesOriginal: [original],
      entries: [edited],
      workspaceTransaction: {
        version: 1,
        mutations: [
          {
            mutationId: 'principal-p1-update',
            entityKey: 'sys-principals',
            identity: 'p1',
            identityKind: 'persistent',
            operation: 'update',
            original,
            current: edited,
            changedFields: ['description'],
            references: [],
          },
        ],
      },
    });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.identity).toBe('p1');
    expect(plan.operations[0]?.kind).toBe('update');
    expect(plan.operations[0]?.changedFields).toEqual(['description']);
    expect(plan.operations[0]?.current).toEqual(edited);
  });
});
