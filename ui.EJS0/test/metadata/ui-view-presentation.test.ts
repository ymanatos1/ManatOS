import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  resolveSysBOUIListView,
  resolveSysBOUIView,
  sysBOPrincipalsUIMetadata,
  sysBOUsersUIMetadata,
  tabContentKeys,
} from '@manatos/shared';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');
const sharedSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', '..', 'shared', relativePath), 'utf8');

describe('generic entity ui-view architecture', () => {
  it('keeps named ui-views generic and composable for every entity', async () => {
    const types = await sharedSource('src/metadata/ui/types.ts');
    const resolver = await sharedSource('src/metadata/ui/view-resolution.ts');
    const identity = await sharedSource('src/metadata/ui/manatos/auth/ui-users.ts');
    const business = await sharedSource('src/metadata/ui/manatos/principals/ui-principals.ts');

    expect(types).toContain('uiViews?: Readonly<Record<string, SysBOUIEntryViewMetadata>>');
    expect(types).toContain('defaultUIView?: string');
    expect(types).toContain('viewType: string');
    expect(types).toContain('record?: Readonly<SysBOUIRecordViewMetadata>');
    expect(resolver).toContain('export function resolveSysBOUIView(');
    expect(resolver).toContain('fieldOverrides: {');
    expect(resolver).toContain('...common.fieldOverrides');
    expect(identity).toContain("defaultUIView: 'main'");
    expect(identity).toContain('quickView: {');
    expect(business).toContain('quick: {');
    expect(business).toContain("viewType: 'quick'");
  });

  it('resolves the requested view before invocation-level field overrides', async () => {
    const renderer = await uiSource('src/routes/sysbo/entry/renderer.ts');
    const invocation = await uiSource('src/routes/sysbo/entry/invocation.ts');
    const host = await uiSource('public/js/runtime/ui-host-runtime.js');

    expect(renderer).toContain('resolveSysBOUIView(');
    expect(renderer).toContain('surface.uiViewKey ?? invocation.uiViewKey');
    expect(renderer).toContain('effectiveEntryUIMetadata(resolvedUIView.metadata, invocation)');
    expect(invocation).toContain('_entryUIView');
    expect(renderer).toContain(
      'uiView: { key: resolvedUIView.key, viewType: resolvedUIView.viewType, metadata: metadataUI }',
    );
    expect(host).toContain('bootstrap.uiView ? { uiView: { ...bootstrap.uiView } } : {}');
  });
});

// Runtime composition behavior is protected separately from the source-architecture
// checks above so later metadata refactors may change syntax without changing meaning.

describe('ui-view composition behavior', () => {
  it('uses main by default and lets a selected view replace arrays while composing keyed maps', () => {
    const main = resolveSysBOUIView(sysBOUsersUIMetadata);
    const quickView = resolveSysBOUIView(sysBOUsersUIMetadata, 'quickView');

    expect(main.key).toBe('main');
    expect(main.viewType).toBe('full');
    expect(main.metadata.record.tabs[0]?.id).toBe('general');
    expect(tabContentKeys(main.metadata.record.tabs[0]?.content)).toContain('enabled');

    // The resolved view is a complete entry composition. `mode=view` is a
    // renderer/runtime concern and must never splice tabs from another ui-view.
    expect(main.metadata.record.tabs.map((tab) => tab.id)).toEqual([
      'general',
      'authentication',
      'system',
    ]);
    expect(main.metadata.record.tabs[1]?.layout).toBe('summary');
    expect(tabContentKeys(main.metadata.record.tabs[1]?.content)).toEqual([
      'principalId',
      'emailVerificationStatus',
      'emailVerificationSource',
      'emailVerifiedAt',
      'localPasswordStatus',
      'externalIdentities',
    ]);

    expect(quickView.key).toBe('quickView');
    expect(quickView.viewType).toBe('quick');
    expect(tabContentKeys(quickView.metadata.record.tabs[0]?.content)).toContain('photo');
    expect(quickView.metadata.record.tabs[0]?.layout).toBe('details');
    expect(quickView.metadata.record.tabs[0]?.representation).toBe('summary');
    expect(quickView.metadata.record.tabs[0]?.readOnly).toBeUndefined();
    expect(quickView.metadata.record.tabs[0]?.component).toBeUndefined();
    expect(quickView.metadata.record.readOnly).toBe(true);
    expect(tabContentKeys(quickView.metadata.record.tabs[0]?.content)).toEqual([
      'name',
      'email',
      'role',
      'fullName',
      'firstName',
      'lastName',
      'description',
      'photo',
    ]);
    expect(quickView.metadata.record.tabs[0]?.content?.[0]).toMatchObject({ kind: 'column' });
    expect(quickView.metadata.record.tabs[0]?.content?.[1]).toMatchObject({ kind: 'column' });
    expect(quickView.metadata.record.tabs[1]?.layout).toBe('details');
    expect(quickView.metadata.record.tabs[1]?.representation).toBe('summary');
    expect(quickView.metadata.record.tabs[1]?.component).toBeUndefined();
    expect(tabContentKeys(quickView.metadata.record.tabs[1]?.content)).toContain(
      'localPasswordStatus',
    );
    expect(tabContentKeys(quickView.metadata.record.tabs[1]?.content)).toContain(
      'externalIdentities',
    );
    expect(
      quickView.metadata.record.fieldOverrides.photo?.presentation?.pictureEditor,
    ).toBeDefined();
    expect(quickView.metadata.record.fieldOverrides.principalId).toBeUndefined();
    expect(quickView.metadata.record.entryActions?.save?.visible).toBe(false);
    expect(quickView.metadata.record.entryActions?.delete?.visible).toBe(false);
    expect(sysBOUsersUIMetadata.uiViews?.quickView?.record?.entryActions).toBeUndefined();
    expect(sysBOUsersUIMetadata.uiViews?.quickView?.record?.actionOverrides).toMatchObject({
      setPassword: {
        visible: { expression: 'id === $user.fields.id.value && hasPassword !== true' },
      },
      changePassword: {
        visible: { expression: 'id === $user.fields.id.value && hasPassword === true' },
      },
    });
    expect(sysBOUsersUIMetadata.list.common.rowActions?.quickView).toMatchObject({
      kind: 'open-entry',
      placement: 'start',
      iconOnly: true,
      mode: 'view',
      uiView: 'quickView',
    });
  });

  it('gives Principals a deliberate read-only quickView through the standard list action', () => {
    const quickView = resolveSysBOUIView(sysBOPrincipalsUIMetadata, 'quickView');

    expect(quickView.viewType).toBe('quick');
    expect(quickView.metadata.record.readOnly).toBe(true);
    expect(quickView.metadata.record.tabs.map((tab) => tab.id)).toEqual([
      'general',
      'contact',
      'system',
    ]);
    expect(quickView.metadata.record.tabs[0]?.layout).toBe('details');
    expect(tabContentKeys(quickView.metadata.record.tabs[0]?.content)).toContain('parentId');
    expect(tabContentKeys(quickView.metadata.record.tabs[1]?.content)).toEqual([
      'emailAddresses',
      'telephoneNumbers',
      'addresses',
    ]);
    expect(quickView.metadata.record.tabs[1]?.content).toEqual([
      { kind: 'column', span: 6, content: [{ kind: 'collection', collection: 'emailAddresses' }] },
      {
        kind: 'column',
        span: 6,
        content: [{ kind: 'collection', collection: 'telephoneNumbers' }],
      },
      { kind: 'column', span: 12, content: [{ kind: 'collection', collection: 'addresses' }] },
    ]);
    expect(sysBOPrincipalsUIMetadata.list.common.rowActions?.quickView).toMatchObject({
      kind: 'open-entry',
      placement: 'start',
      iconOnly: true,
      mode: 'view',
      uiView: 'quickView',
    });
  });

  it('models Principal quick editing as a quick ui-view rather than a second metadata concept', () => {
    const quick = resolveSysBOUIView(sysBOPrincipalsUIMetadata, 'quick');

    expect(quick.viewType).toBe('quick');
    expect(quick.metadata.record.tabNavigationVisible).toBe(false);
    expect(quick.metadata.record.tabs).toHaveLength(1);
    expect(quick.metadata.record.tabs[0]?.id).toBe('quick');
    expect(quick.metadata.record.tabs[0]?.content?.map((item) => item.kind)).toContain('field');
    expect(quick.metadata.record.fieldOverrides.firstName?.visible).toEqual({
      expression: "principalType === 'Person'",
    });
  });

  it('keeps UI expressions concise while canonical BO defaults use portable entry paths', async () => {
    const principal = await sharedSource('src/metadata/ui/manatos/principals/ui-principals.ts');
    const userUI = await sharedSource('src/metadata/ui/manatos/auth/ui-users.ts');
    const providerUI = await sharedSource('src/metadata/ui/manatos/auth/ui-ext-auth-providers.ts');
    const providerBO = await sharedSource('src/metadata/bo/manatos/auth/bo-ext-auth-providers.ts');

    expect(principal).toContain('principalType.option.canHaveParent === true');
    expect(providerUI).toContain("provider === 'microsoft'");
    expect(providerUI).toContain("hasClientSecret ? 'lock-fill' : 'lock'");
    expect(userUI).toContain('id !== $user.fields.id.value');
    expect(providerBO).toContain(
      "FindCtx($enums.SysBOExtAuthProviderType.values, 'value', $entry-current.provider, 'callbackPath')",
    );
    expect(`${principal}
${userUI}
${providerUI}`).not.toMatch(/#level\.(?:entry\.current|fields\.[A-Za-z0-9_]+\.value)/);
    expect(`${principal}
${userUI}
${providerUI}`).not.toContain('$entry-current.');
  });

  it('resolves every list uiView from common metadata plus keyed overrides', () => {
    const main = resolveSysBOUIListView(sysBOUsersUIMetadata, 'main');
    const simple = resolveSysBOUIListView(sysBOUsersUIMetadata, 'simple');
    expect(main.metadata.visibleFields).toContain('role');
    expect(simple.metadata.visibleFields).toEqual(['name', 'email']);
    expect(simple.metadata.sortableFields).toEqual(main.metadata.sortableFields);
    expect(simple.metadata.addAction).toEqual(main.metadata.addAction);
    expect(simple.metadata.rowActions).toEqual(main.metadata.rowActions);
  });
});
