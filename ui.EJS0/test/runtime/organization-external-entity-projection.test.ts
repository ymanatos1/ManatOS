import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { OrganizationHierarchySurface } from '../../src/runtime/v2/organization-hierarchy-surface.js';
import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiLevel } from '../../src/runtime/v2/ui-level.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
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
const surface = () => {
  const levelValue: UiCtxObject = {
    state: { dirty: false },
    data: {
      list: {
        entries: [{ id: 'p1', userId: 'draft:u1', name: 'Principal' }],
        originalEntries: [{ id: 'p1', userId: 'u0', name: 'Principal' }],
      },
      resources: {
        workspace: {},
        workspaceTransaction: {
          version: 1,
          mutations: [
            {
              mutationId: 'sys-users:draft:u1',
              entityKey: 'sys-users',
              identity: 'draft:u1',
              identityKind: 'workspace',
              operation: 'create',
              original: null,
              current: { id: 'draft:u1', name: 'new-user' },
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
    'hierarchy-1',
    'level1',
    { surface: 'hierarchy', host: 'page', entity: 'sys-principals' },
    context,
  );
  return new OrganizationHierarchySurface(level, { identityField: 'id' });
};

describe('Organization external entity projection', () => {
  it('removes only draft external mutations and clears matching root relationship fields', () => {
    const organization = surface();
    const result = organization.removeExternalDraftMutation('sys-users:draft:u1', ['userId']);
    expect(result.changed).toBe(true);
    expect(organization.transactionSnapshot().mutations).toHaveLength(0);
    expect(organization.entries[0]?.userId).toBe('u0');
  });

  it('projects workspaceTransaction generically and keeps existing external deletion disabled', async () => {
    const [tree, workspace, template] = await Promise.all([
      read('../../public/js/sysbo/hierarchy/hierarchy-tree.js'),
      read('../../public/js/sysbo/hierarchy/hierarchy-workspace.js'),
      read('../../views/components/sysbo/hierarchy/hierarchy-workspace.ejs'),
    ]);
    expect(template).toContain("transactionSource: 'resources.workspaceTransaction'");
    expect(tree).toContain('externalMutations');
    expect(tree).toContain('semanticChangePresentation?.entryDescriptor?.');
    expect(tree).toContain('ownerWorkspaceState: true');
    expect(tree).toContain("' fst-italic'");
    expect(tree).toContain('metadata?.pluralLabel');
    expect(tree).toContain('edit-external-entry');
    expect(tree).toContain('remove-external-entry');
    expect(tree).toContain('Existing external entries cannot be deleted');
    expect(workspace).toContain('provideEntryIfPresent');
    expect(workspace).toContain('removeExternalDraftMutation');
    expect(tree).not.toContain("entityKey === 'sys-users'");
  });
});
