import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) => readFile(resolve(testDirectory, relativePath), 'utf8');

describe('SysBO route responsibility boundaries', () => {
  it('keeps permissions, form coercion and entry-representation compilation outside route orchestration', async () => {
    const [routes, permissions, payload, representation, listRenderer, hierarchyRenderer, recordRenderer, hierarchyWrite, ownerManagedEntry, entryWrite, providerWrite] = await Promise.all([
      source('../src/routes/sysbo-routes.ts'),
      source('../src/sysbo/permissions.ts'),
      source('../src/routes/sysbo/form-payload.ts'),
      source('../src/routes/sysbo/entry-representation-runtime.ts'),
      source('../src/routes/sysbo/list-renderer.ts'),
      source('../src/routes/sysbo/hierarchy-renderer.ts'),
      source('../src/routes/sysbo/record-renderer.ts'),
      source('../src/routes/sysbo/hierarchy-write.ts'),
      source('../src/routes/sysbo/owner-managed-entry.ts'),
      source('../src/routes/sysbo/entry-write.ts'),
      source('../src/routes/sysbo/external-provider-write.ts'),
    ]);

    expect(routes).toContain("from '../sysbo/permissions.js'");
    expect(entryWrite).toContain("from './form-payload.js'");
    expect(routes).not.toContain("from './sysbo/form-payload.js'");
    expect(recordRenderer).toContain("from './entry-representation-runtime.js'");
    expect(routes).not.toContain('function uiPermissions(');
    expect(routes).not.toContain('function formPayload(');
    expect(routes).toContain("from './sysbo/list-renderer.js'");
    expect(listRenderer).toContain('export async function renderMetadataDrivenList(');
    expect(routes).toContain("from './sysbo/hierarchy-renderer.js'");
    expect(hierarchyRenderer).toContain('export async function renderMetadataDrivenHierarchyWorkspace(');
    expect(routes).not.toContain('async function renderMetadataDrivenHierarchyWorkspace(');
    expect(routes).toContain("from './sysbo/record-renderer.js'");
    expect(recordRenderer).toContain('export async function renderMetadataDrivenRecord(');
    expect(routes).not.toContain('async function renderMetadataDrivenRecord(');
    expect(routes).not.toContain('function compiledEntryRepresentationRuntime(');
    expect(routes).toContain("from './sysbo/hierarchy-write.js'");
    expect(hierarchyWrite).toContain('export async function commitMetadataDrivenHierarchy(');
    expect(routes).toContain("from './sysbo/owner-managed-entry.js'");
    expect(ownerManagedEntry).toContain('export function ownerManagedEntryFromRequest(');
    expect(ownerManagedEntry).toContain('export function mergeOwnerManagedEntryFromRequest(');
    expect(routes).not.toContain("const parseRows = (value: unknown)");
    expect(routes).toContain("from './sysbo/entry-write.js'");
    expect(entryWrite).toContain('export async function persistMetadataDrivenEntry(');
    expect(entryWrite).toContain('export async function completeMetadataDrivenSave(');
    expect(routes).toContain("from './sysbo/external-provider-write.js'");
    expect(providerWrite).toContain('export async function handleExternalProviderCredentialSave(');
    expect(routes).not.toContain("const action = String(req.body.providerCredentialAction");

    expect(permissions).toContain("definition.key === 'sys-users' && recordId === user.id");
    expect(payload).toContain('field.generated || field.readOnly || field.sensitive');
    expect(representation).toContain('compileExpression(derived.expression).ast');
  });
});
