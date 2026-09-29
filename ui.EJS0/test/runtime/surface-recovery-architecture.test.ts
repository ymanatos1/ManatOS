import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('typed surface recovery ownership', () => {
  it('keeps the outage coordinator surface-agnostic for capture and missing-child continuation', async () => {
    const recovery = await source('src/runtime/workspace-recovery.ts');
    const organization = await source('src/runtime/v2/organization-recovery.ts');
    const ownedEntry = await source('src/runtime/v2/owned-entry-recovery.ts');
    const navigation = await source('src/runtime/v2/recovery-navigation.ts');
    expect(recovery).not.toContain('hierarchyChangesFromLiveLevel');
    expect(recovery).not.toContain('resumeOwnedEntryRecovery');
    expect(recovery).toContain('surfaceRecovery?.capture?.(level)');
    expect(recovery).toContain('surfaceRecovery?.resumeMissing?.({');
    expect(recovery).not.toContain('_ownerRecycleBin');
    expect(recovery).not.toContain('/owned-entry/');
    expect(organization).toContain("format: 'hierarchy-commit-v2'");
    expect(organization).toContain('surface.transactionSnapshot()');
    expect(organization).toContain('surface.recycleBin');
    expect(ownedEntry).toContain('_ownerRecycleBin: JSON.stringify(changes.recycleBin || [])');
    expect(ownedEntry).toContain(
      '_ownerRuntimeResources: JSON.stringify(changes.runtimeResources || {})',
    );
    expect(organization).toContain(
      'const target = `/bo/${encodeURIComponent(entityKey)}/owned/return`',
    );
    expect(organization).toContain('_ownerEntries: JSON.stringify(changes.entries || [])');
    expect(organization).toContain(
      '_ownerRuntimeResources: JSON.stringify(changes.runtimeResources || {})',
    );
    expect(organization).toContain('submitRecoveryPost(target, {');
    expect(ownedEntry).toContain('submitRecoveryPost(target, fields)');
    expect(navigation).toContain('form.requestSubmit()');
    expect(organization).toContain('continueRecoveryAt(levelIndex, target)');
    expect(ownedEntry).toContain('continueRecoveryAt(levelIndex, target)');
    expect(organization).not.toContain('writePackage');
    expect(ownedEntry).not.toContain('writePackage');
    expect(organization).not.toContain('restoreRequested');
    expect(ownedEntry).not.toContain('restoreRequested');
  });

  it('preserves recycle-bin state through the owned-entry return boundary', async () => {
    const routes = await source('src/routes/sysbo/index.ts');
    const renderer = await source('src/routes/sysbo/hierarchy/renderer.ts');
    expect(routes).toContain('recycleBin: parentOwnerContext.recycleBin');
    expect(routes).toContain('const parentOwnerContext = ownerManagedContextFromRequest(req);');
    expect(routes).toContain(
      'const permissions = await resolveUIEntityPermissions(req, definition);',
    );
    expect(routes).not.toContain(
      'const { parentOwnerContext } = ownerManagedEntryFromRequest(req, id);',
    );
    expect(renderer).toContain('recycleBin?: Record<string, unknown>[];');
    expect(renderer).toContain('(workspaceOverride?.recycleBin ?? []).map');
  });
  it('keeps the complete shell model defined when page-context hydration was unavailable', async () => {
    const renderer = await source('src/presentation/page/render-page.ts');
    expect(renderer).toContain('currentUser: viewModel.currentUser ?? null');
  });
});

describe('Organization recovery identity', () => {
  it('preserves the immutable opening member and can reconstruct after that member is recycled', async () => {
    const recovery = await source('src/runtime/v2/organization-recovery.ts');
    const renderer = await source('src/routes/sysbo/hierarchy/renderer.ts');

    expect(recovery).toContain('originalMemberId: String(');
    expect(recovery).toContain("originalMemberId: String(changes.originalMemberId || '')");
    expect(recovery).toContain('actualOriginalMemberId !== expectedOriginalMemberId');
    expect(recovery).toContain('if (!hierarchyRootId) return false;');

    expect(renderer).toContain('const originalMemberId = workspaceOverride?.originalMemberId');
    expect(renderer).toContain('...workspaceOverride.entriesOriginal');
    expect(renderer).toContain('...(workspaceOverride.recycleBin ?? [])');
    expect(renderer).toContain('const workspaceAnchor =');
    expect(renderer).toContain('...hierarchyOriginalItems');
    expect(renderer).toContain('...(workspaceOverride?.recycleBin ?? [])');
  });
  it('keeps Organization workspace identity and dirty authority on owned-Entry pages', async () => {
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');
    const host = await source('public/js/runtime/ui-host-runtime.js');
    const runtimeEntry = await source('src/browser/runtime-entry.ts');

    expect(renderer).toContain('record.parentOwnerContext.fields as Record<string, unknown>');
    expect(host).toContain('structuredClone(bootstrap.owner.fields)');
    expect(runtimeEntry).toContain("candidate.invocation?.surface !== 'hierarchy'");
    expect(runtimeEntry).toContain("other.invocation?.surface === 'entry'");
    expect(runtimeEntry).toContain('organizationSurfaceFor(candidatePath)');
  });
});
