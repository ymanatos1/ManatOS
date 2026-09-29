import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Organization-owned picture runtime resources', () => {
  it('owns accepted pending binary inside the canonical surface #data', async () => {
    const level = await source('src/runtime/v2/ui-level.ts');
    const surface = await source('src/runtime/v2/organization-hierarchy-surface.ts');
    const picture = await source('public/js/sysbo/entry/fields/picture-fields.js');
    expect(level).not.toContain('readonly #runtimeResources = new Map<string, unknown>()');
    expect(level).toContain('data.resources.runtime');
    expect(level).toContain('runtimeResourceSnapshot()');
    expect(surface).toContain('mergeRuntimeResources(resources: unknown)');
    expect(surface).toContain('pictureResourceKeysReferencedBy(this.transactionSnapshot())');
    expect(picture).not.toContain('organizationOwnerSurfaceFor');
    expect(picture).toContain('uiRuntimeResourceForPath');
    expect(picture).toContain('setUiRuntimeResourceForPath');
    expect(picture).not.toContain('manatos.pending-picture.v1:');
    expect(picture).not.toContain('pendingScalarPictures = new Map()');
  });

  it('transports private resources across full-page owned-entry handoff and return', async () => {
    const workspace = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const template = await source('views/components/runtime/entity-entry.ejs');
    const owner = await source('src/routes/sysbo/entry/owner-managed-entry.ts');
    const routes = await source('src/routes/sysbo/index.ts');
    expect(workspace).toContain(
      '_ownerRuntimeResources: JSON.stringify(organizationSurface.runtimeResourceSnapshot())',
    );
    expect(template).toContain('name="_ownerRuntimeResources"');
    expect(owner).toContain('runtimeResources: parseObject(req.body._ownerRuntimeResources)');
    expect(routes).toContain('runtimeResources: parentOwnerContext.runtimeResources');
  });

  it('captures and restores private resources with Organization outage recovery', async () => {
    const recovery = await source('src/runtime/v2/organization-recovery.ts');
    const owned = await source('src/runtime/v2/owned-entry-recovery.ts');
    expect(recovery).toContain(
      'runtimeResources: structuredClone(surface.recoverableRuntimeResourceSnapshot())',
    );
    expect(recovery).toContain(
      'surface.replaceRuntimeResources(structuredClone(changes.runtimeResources || {}))',
    );
    expect(recovery).toContain(
      '_ownerRuntimeResources: JSON.stringify(changes.runtimeResources || {})',
    );
    expect(owned).toContain(
      '_ownerRuntimeResources: JSON.stringify(changes.runtimeResources || {})',
    );
  });

  it('does not treat an owner-rehydrated pending picture payload as a new child edit', async () => {
    const picture = await source('public/js/sysbo/entry/fields/picture-fields.js');
    expect(picture).toContain('dirty: canonicalFieldDirty(root, key)');
    expect(picture).not.toContain('dirty: Boolean(payload.value)');
  });
});
