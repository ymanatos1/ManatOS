import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) => readFile(resolve(testDirectory, relativePath), 'utf8');

describe('SysBO route responsibility boundaries', () => {
  it('keeps permissions, form coercion and entry-representation projection outside route orchestration', async () => {
    const [
      routes,
      permissions,
      definitions,
      types,
      navigation,
      apiPath,
      payload,
      representation,
      listRenderer,
      hierarchyRenderer,
      recordRenderer,
      hierarchyWrite,
      ownerManagedEntry,
      entryWrite,
      providerWrite,
    ] = await Promise.all([
      source('../../src/routes/sysbo/index.ts'),
      source('../../src/sysbo/permissions.ts'),
      source('../../src/sysbo/definitions.ts'),
      source('../../src/sysbo/types.ts'),
      source('../../src/navigation.ts'),
      source('../../src/sysbo/api-path.ts'),
      source('../../src/routes/sysbo/entry/form-payload.ts'),
      source('../../src/routes/sysbo/entry/representation-runtime.ts'),
      source('../../src/routes/sysbo/list/renderer.ts'),
      source('../../src/routes/sysbo/hierarchy/renderer.ts'),
      source('../../src/routes/sysbo/entry/renderer.ts'),
      source('../../src/routes/sysbo/hierarchy/write.ts'),
      source('../../src/routes/sysbo/entry/owner-managed-entry.ts'),
      source('../../src/routes/sysbo/entry/write.ts'),
      source('../../src/routes/sysbo/entry/external-provider-write.ts'),
    ]);

    expect(routes).toContain("from '../../sysbo/permissions.js'");
    expect(entryWrite).toContain("from './form-payload.js'");
    expect(routes).not.toContain("from './sysbo/form-payload.js'");
    expect(recordRenderer).toContain("from './representation-runtime.js'");
    expect(recordRenderer).not.toContain('resolveUIEntityPermissions(');
    expect(routes).not.toContain('function uiPermissions(');
    expect(routes).not.toContain('function formPayload(');
    expect(routes).toContain("from './list/renderer.js'");
    expect(listRenderer).toContain('export async function renderMetadataDrivenList(');
    expect(routes).toContain("from './hierarchy/renderer.js'");
    expect(hierarchyRenderer).toContain(
      'export async function renderMetadataDrivenHierarchyWorkspace(',
    );
    expect(routes).not.toContain('async function renderMetadataDrivenHierarchyWorkspace(');
    expect(routes).toContain("from './entry/renderer.js'");
    expect(recordRenderer).toContain('export async function renderMetadataDrivenRecord(');
    expect(
      recordRenderer.indexOf('registerContextEntity(ctx, definition.key, metadata, metadataUI);'),
    ).toBeLessThan(recordRenderer.indexOf('editPageSupplementalData('));
    expect(routes).not.toContain('async function renderMetadataDrivenRecord(');
    expect(routes).not.toContain('function entryRepresentationRuntime(');
    expect(routes).toContain("from './hierarchy/write.js'");
    expect(hierarchyWrite).toContain('export async function commitMetadataDrivenHierarchy(');
    expect(routes).toContain("from './entry/owner-managed-entry.js'");
    expect(ownerManagedEntry).toContain('export function ownerManagedEntryFromRequest(');
    expect(ownerManagedEntry).toContain('export function mergeOwnerManagedEntryFromRequest(');
    expect(routes).not.toContain('const parseRows = (value: unknown)');
    expect(routes).toContain("from './entry/write.js'");
    expect(entryWrite).toContain('export async function persistMetadataDrivenEntry(');
    expect(entryWrite).toContain('export async function completeMetadataDrivenSave(');
    expect(routes).toContain("from './entry/external-provider-write.js'");
    expect(providerWrite).toContain('export async function handleExternalProviderCredentialSave(');
    expect(routes).not.toContain('const action = String(req.body.providerCredentialAction');

    expect(permissions).toContain('export async function resolveUIEntityPermissions(');
    expect(permissions).toContain("from './api-path.js'");
    expect(apiPath).toContain("'sys-users': 'SysUsers'");
    expect(permissions).toContain('/$capabilities');
    expect(permissions).toContain('capabilities.read');
    expect(permissions).toContain('capabilities.update');
    expect(permissions).toContain('read: boolean;');
    expect(permissions).toContain('update: boolean;');
    expect(permissions).not.toContain('view: boolean;');
    expect(permissions).not.toContain('edit: boolean;');
    expect(permissions).not.toContain('definition.permissions');
    expect(permissions).not.toContain('SysBOUserRole');
    expect(definitions).not.toContain('SysBOUserRole');
    expect(definitions).not.toContain('permissions:');
    expect(types).not.toContain('SysBOPermissions');
    expect(types).not.toContain('permissions: SysBOPermissions');
    expect(navigation).not.toContain('role === SysBOUserRole.Admin');
    expect(navigation).toContain('const fallbackPlatformAccess = false;');
    expect(routes).toContain('await resolveUIEntityPermissions(req, definition');
    expect(payload).toMatch(/field\.generated\s*\|\|\s*field\.readOnly\s*\|\|\s*field\.sensitive/);
    expect(representation).toContain('field.calculation!.expression');
    expect(representation).not.toContain('compileExpression(');
    expect(representation).not.toContain('.ast');
  });
});
