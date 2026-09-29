import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('surface provider encapsulation contract', () => {
  it('defines one temporary generic Entry DTO and the two provider boundaries', async () => {
    const providers = await source('src/runtime/v2/surface-providers.ts');
    expect(providers).toContain('interface UiEntryTransferDto');
    expect(providers).toContain('Readonly<Record<string, unknown>>');
    expect(providers).toContain('interface UiEntrySurfaceProvider');
    expect(providers).toContain('interface UiOwnerSurfaceProvider');
    expect(providers).toContain('saveEntry(');
    expect(providers).toContain('queryEntries(');
    expect(providers).not.toContain('referenceOptions(');
    expect(providers).not.toContain('ownerToken');
  });

  it('connects owned Save through Entry export and Owner acceptance', async () => {
    const persistence = await source('src/runtime/v2/owned-entry-persistence.ts');
    expect(persistence).toContain('options.entry.exportEntry(');
    expect(persistence).toContain('options.owner.saveEntry(');
    expect(persistence).not.toContain('options.level.runtimeResourceSnapshot()');
  });

  it('keeps accepted surface resources in canonical CTX rather than a private map', async () => {
    const level = await source('src/runtime/v2/ui-level.ts');
    expect(level).toContain('data.resources.runtime');
    expect(level).not.toContain('new Map<string, unknown>()');
  });
  it('propagates owner capability through existing browser hosting without topology discovery', async () => {
    const host = await source('src/browser/browser-host-bridge.ts');
    const runtime = await source('src/browser/runtime-entry.ts');
    expect(host).toContain('preparedCaller?.workspaceOwned === true');
    expect(host).toContain('level.bindOwnerProvider(parent.ownerProvider)');
    expect(runtime).toContain('ownerProviderForPath');
    expect(runtime).not.toContain('organizationOwnerSurfaceFor');
    expect(runtime).not.toContain('ownerWorkspaceSurfaceFor');
  });

  it('hydrates persisted Entry resources through the canonical server resource routes', async () => {
    const runtime = await source('src/browser/runtime-entry.ts');
    expect(runtime).toContain('hydratePersistedEntryResources');
    expect(runtime).toContain('persistedScalarPictureSource');
    expect(runtime).toContain('persistedCollectionPictureSource');
    expect(runtime).toContain('surface.acceptResource(key');
    expect(runtime).not.toContain("if (mode !== 'create')");
  });

  it('refreshes owner-backed references by provider identity rather than hierarchy ancestry', async () => {
    const runtime = await source('src/browser/runtime-entry.ts');
    expect(runtime).toContain('candidate.ownerProvider === surface.ownerProvider');
    expect(runtime).toContain('ownerWorkspace.queryEntries(targetEntityKey)');
    expect(runtime).not.toContain("triggerPath: 'data.resources.workspaceTransaction'");
  });

  it('binds an encapsulated provider rather than the Organization surface itself', async () => {
    const runtime = await source('src/browser/runtime-entry.ts');
    const owner = await source('src/runtime/v2/organization-hierarchy-surface.ts');
    expect(runtime).toContain('level.bindOwnerProvider(surface.ownerProvider)');
    expect(runtime).not.toContain('level.bindOwnerProvider(surface);');
    expect(runtime).not.toContain('instanceof OrganizationHierarchySurface');
    expect(owner).toContain(
      'class OrganizationOwnerSurfaceProvider implements UiOwnerSurfaceProvider',
    );
    expect(owner).toContain('get ownerProvider(): UiOwnerSurfaceProvider');
  });

  it('keeps new owned hierarchy Entries out of owner state until explicit Save', async () => {
    const workspace = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const openStart = workspace.indexOf('const openQuickPopup');
    const beginStart = workspace.indexOf('const beginQuick');
    const section = workspace.slice(openStart, workspace.indexOf('const metaValue', beginStart));
    expect(section).not.toContain('_ownerEntryTransfer');
    expect(section).not.toContain(
      "replaceEntries([...entries().map((entry) => ({ ...entry })), row], 'begin-quick')",
    );
    expect(section).toContain('remains untouched until explicit Save');
  });
});
