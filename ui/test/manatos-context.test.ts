import { describe, expect, it } from 'vitest';
import {
  MANATOS_COMPANY,
  contextCollectionMemberKey,
  resolveContextMember,
  resolveContextMembers,
  resolvePlatform,
  evaluateExpression,
  sysBOUsersMetadata,
} from '@manatos/shared';

import {
  contextFields,
  contextPlatformAccess,
  createManatOSContext,
  currentPageContext,
  currentPagePath,
  entityContextName,
  pageContextNode,
  pageBreadcrumbItems,
  pageEntryRuntimeContext,
  pageCollectionRuntimeContext,
  pageListRuntimeContext,
  registerContextEntity,
  setPageContext,
} from '../src/context/manatos-context.js';

describe('ManatOS ctx tree', () => {
  it('resolves keyed array members by zero-based index or semantic id', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    expect(contextCollectionMemberKey(ctx.company.platforms[0])).toBe(platform.id);
    expect(resolveContextMember(ctx.company.platforms, 0)).toBe(ctx.company.platforms[0]);
    expect(resolveContextMember(ctx.company.platforms, platform.id)).toBe(ctx.company.platforms[0]);
    expect(resolveContextMembers(ctx, ['company', 'platforms', platform.id, 'id'])).toBe(
      platform.id,
    );
    expect(resolveContextMembers(ctx, ['company', 'platforms', 0, 'id'])).toBe(platform.id);

    const uuid = 'ce34b655-e494-438f-a091-ab18d2b37bad';
    const rows = [{ id: uuid, name: 'Our Admin' }];
    expect(contextCollectionMemberKey(rows[0])).toBe(uuid);
    expect(resolveContextMember(rows, uuid)).toBe(rows[0]);
  });

  it('keeps the system branch first in root CTX traversal order', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    expect(Object.keys(ctx)).toEqual(['system', 'entities', 'company', 'user', 'page']);
    expect(ctx.system.scope).toBe('sys');
    expect(ctx.system.runtime.mode).toBe('development');
    expect(ctx.system.runtime.developerMode).toBe(true);
  });

  it('exposes the safe runtime/developer mode under ctx.system', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const production = createManatOSContext(
      MANATOS_COMPANY,
      platform,
      'http://localhost:3000',
      '0.1.0',
      null,
      {},
      'sys',
      'production',
    );
    expect(production.system.runtime).toEqual({ mode: 'production', developerMode: false });
  });

  it('keeps company platforms as an array and identifies the current platform', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    expect(Array.isArray(ctx.company.platforms)).toBe(true);
    expect(ctx.company.currentPlatform).toBe(platform.id);
    expect(ctx.company.platforms[ctx.company.currentPlatformIndex]?.id).toBe(platform.id);
  });

  it('normalizes enum choices into the same option/options CTX shape used by references', () => {
    const fields = contextFields(
      { platformId: 'protocrm' },
      {
        platformId: {
          key: 'platformId',
          label: 'Platform',
          type: 'enum',
          order: 10,
          enumValues: ['protocrm', 'other'],
        },
      },
    );

    expect(fields.platformId?.value).toBe('protocrm');
    expect(fields.platformId?.option).toEqual({ value: 'protocrm', label: 'protocrm' });
    expect(fields.platformId?.options).toEqual([
      { value: 'protocrm', label: 'protocrm' },
      { value: 'other', label: 'other' },
    ]);
  });
  it('uses contextual enum options as the CTX option source when supplied', () => {
    const fields = contextFields(
      { provider: null },
      {
        provider: {
          key: 'provider',
          label: 'Provider',
          type: 'enum',
          order: 10,
          enumValues: ['microsoft', 'google', 'github'],
          enumItems: [
            { value: 'microsoft', label: 'Microsoft', icon: 'microsoft' },
            { value: 'google', label: 'Google', icon: 'google' },
            { value: 'github', label: 'GitHub', icon: 'github' },
          ],
        },
      },
      {
        provider: [
          { value: 'google', label: 'Google', callbackPath: '/auth/google/callback' },
          { value: 'github', label: 'GitHub', callbackPath: '/auth/github/callback' },
        ],
      },
    );

    expect(fields.provider?.options).toEqual([
      { value: 'google', label: 'Google', icon: 'google', callbackPath: '/auth/google/callback' },
      { value: 'github', label: 'GitHub', icon: 'github', callbackPath: '/auth/github/callback' },
    ]);

    const noneAvailable = contextFields(
      { provider: null },
      {
        provider: {
          key: 'provider',
          label: 'Provider',
          type: 'enum',
          order: 10,
          enumValues: ['microsoft', 'google'],
        },
      },
      { provider: [] },
    );
    expect(noneAvailable.provider?.options).toEqual([]);
  });

  it('derives path() from nested page names and stores no path property', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const base = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');
    const entry = pageContextNode('entry', 'sysbo-entry', 'edit', contextFields({ id: 'u1' }));
    const list = pageContextNode(
      'sysUsers',
      'sysbo-list',
      'list',
      contextFields({ entity: 'sysUsers' }),
      entry,
    );
    const ctx = setPageContext(base, list);

    expect(currentPageContext(ctx)).toBe(entry);
    expect(currentPagePath(ctx)).toBe('/sysUsers/entry');
    expect('path' in list).toBe(false);
    expect('path' in entry).toBe(false);
  });

  it('derives SysBO breadcrumbs from the logical CTX page hierarchy', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const base = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');
    registerContextEntity(base, 'sys-principals', {
      name: 'Principal',
      pluralName: 'Principals',
      primaryField: 'name',
    });

    const entry = pageContextNode(
      'entry',
      'sysbo-entry',
      'edit',
      contextFields({ id: 'p1', name: 'Guest Maria' }),
      null,
      pageEntryRuntimeContext({ id: 'p1', name: 'Guest Maria' }),
    );
    const list = pageContextNode(
      'sysPrincipals',
      'sysbo-list',
      'list',
      contextFields({ entity: 'sysPrincipals' }),
      entry,
      pageListRuntimeContext([], [], {}),
    );
    const ctx = setPageContext(base, list);

    expect(pageBreadcrumbItems(ctx)).toEqual([
      { label: 'ManatOS', href: '/' },
      { label: 'Principals', href: '/bo/sys-principals' },
      { label: 'Edit Principal - Guest Maria', href: null },
    ]);
  });

  it('keeps hierarchy workspaces beneath the list context and derives their breadcrumb title from CTX', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const base = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');
    registerContextEntity(base, 'sys-principals', {
      name: 'Principal',
      pluralName: 'Principals',
      primaryField: 'name',
    });

    const hierarchy = pageContextNode(
      'organization',
      'sysbo-hierarchy',
      'edit',
      contextFields({ title: 'Edit Organization', focusedMemberId: 'p1' }),
      null,
      pageCollectionRuntimeContext([
        { id: 'p1', name: 'ManatOS' },
        { id: 'p2', name: 'Guest Maria', parentId: 'p1' },
      ]),
    );
    const list = pageContextNode(
      'sysPrincipals',
      'sysbo-list',
      'list',
      contextFields({ entity: 'sysPrincipals' }),
      hierarchy,
      pageListRuntimeContext([], [], {}),
    );
    const ctx = setPageContext(base, list);

    expect(currentPagePath(ctx)).toBe('/sysPrincipals/organization');
    expect(list.entriesOriginal).toEqual([]);
    expect(list.entries).toEqual([]);
    expect(hierarchy.entriesOriginal?.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(hierarchy.entries?.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(pageBreadcrumbItems(ctx)).toEqual([
      { label: 'ManatOS', href: '/' },
      { label: 'Principals', href: '/bo/sys-principals' },
      { label: 'Edit Organization', href: null },
    ]);
  });

  it('supports a member entry as a third page level beneath a hierarchy workspace', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const base = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');
    registerContextEntity(base, 'sys-principals', {
      name: 'Principal',
      pluralName: 'Principals',
      primaryField: 'name',
    });

    const memberEntry = pageContextNode(
      'entry',
      'sysbo-entry',
      'edit',
      contextFields({ id: 'p2', name: 'Guest Maria' }),
      null,
      pageEntryRuntimeContext({ id: 'p2', name: 'Guest Maria' }),
    );
    const hierarchy = pageContextNode(
      'organization',
      'sysbo-hierarchy',
      'edit',
      contextFields({ title: 'Edit Organization', focusedMemberId: 'p2' }),
      memberEntry,
      pageCollectionRuntimeContext([
        { id: 'p1', name: 'ManatOS' },
        { id: 'p2', name: 'Guest Maria', parentId: 'p1' },
      ]),
    );
    const list = pageContextNode(
      'sysPrincipals',
      'sysbo-list',
      'list',
      contextFields({ entity: 'sysPrincipals' }),
      hierarchy,
      pageListRuntimeContext([], [], {}),
    );
    const ctx = setPageContext(base, list);

    expect(currentPagePath(ctx)).toBe('/sysPrincipals/organization/entry');
    expect(pageBreadcrumbItems(ctx)).toEqual([
      { label: 'ManatOS', href: '/' },
      { label: 'Principals', href: '/bo/sys-principals' },
      { label: 'Edit Organization', href: null },
      { label: 'Edit Principal - Guest Maria', href: null },
    ]);
  });

  it('uses keyed fields without repeating the field name or metadata', () => {
    const fields = contextFields({ email: 'a@example.test' });

    expect(fields.email).toEqual({ value: 'a@example.test' });
    expect('name' in (fields.email ?? {})).toBe(false);
    expect('metadata' in (fields.email ?? {})).toBe(false);
  });

  it('keeps canonical metadata in the root entity registry', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    registerContextEntity(ctx, 'sys-users', { name: 'User' }, { key: 'sys-users' });

    expect(entityContextName('sys-users')).toBe('sysUsers');
    expect(ctx.entities.sysUsers?.key).toBe('sys-users');
    expect(ctx.entities.sysUsers?.metadata).toEqual({ name: 'User' });
  });

  it('precompiles canonical entity derived-field expressions for DEBUG AST inspection', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    registerContextEntity(ctx, 'sys-users', sysBOUsersMetadata);

    const fullName = (ctx.entities.sysUsers?.metadata as any)?.fieldDefinition?.fullName
      ?.calculation;
    expect(fullName?.expression).toBe(
      "firstName !== '' && lastName !== '' ? firstName + ' ' + lastName : firstName !== '' ? firstName : lastName",
    );
    expect(fullName?.ast?.kind).toBe('conditional');
  });

  it('rejects ctx identifiers that the future expression grammar cannot address', () => {
    expect(() => contextFields({ 'bad-name': 1 })).toThrow(/Invalid ManatOS ctx field identifier/);
    expect(() => pageContextNode('bad-name', 'page', 'none')).toThrow(
      /Invalid ManatOS ctx page identifier/,
    );
  });

  it('gives authenticated-user calculations a nearest-owner mode pointer', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const user = {
      id: 'u1',
      name: 'Admin',
      email: 'admin@example.test',
      emailVerified: true,
      hasPassword: true,
      passwordHash: 'never-exposed',
      role: 'Admin',
      firstName: '',
      lastName: '',
      description: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    } as any;
    const ctx = createManatOSContext(
      MANATOS_COMPANY,
      platform,
      'http://localhost:3000',
      '0.1.0',
      user,
    );

    expect(ctx.user?.mode).toEqual({ kind: 'pointer', value: 'view' });
    const localPasswordStatus = ctx.user?.fields.localPasswordStatus as any;
    expect(
      evaluateExpression(localPasswordStatus.expression, ctx, ctx.user?.fields, {
        source: 'test',
        purpose: 'verify nearest-owner mode pointer',
      }),
    ).toBe('Configured');
  });

  it('names the logged-in user entity context explicitly as entityName', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const user = {
      id: 'u1',
      name: 'Admin',
      email: 'admin@example.test',
      emailVerified: true,
      passwordHash: 'never-exposed',
      role: 'Admin',
      firstName: '',
      lastName: '',
      description: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    } as any;
    const ctx = createManatOSContext(
      MANATOS_COMPANY,
      platform,
      'http://localhost:3000',
      '0.1.0',
      user,
    );
    expect(ctx.user?.scope).toBe('sys');
    expect(ctx.user?.entityName).toBe('sysUsers');
    expect('entity' in (ctx.user ?? {})).toBe(false);
  });

  it('exposes safe client feature facts to evaluator expressions', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(
      MANATOS_COMPANY,
      platform,
      'http://localhost:3000',
      '0.1.0',
      null,
      { allowAdminEmailVerification: true },
    );

    expect(ctx.system.client.features.allowAdminEmailVerification).toBe(true);
    expect(ctx).not.toHaveProperty('client');
    expect(ctx).not.toHaveProperty('server');
    expect(ctx.system.server).toBeDefined();
  });

  it('allows non-SysBO page kinds and modes without a closed CRUD union', () => {
    const node = pageContextNode(
      'configuration',
      'sysconfiguration',
      'special',
      contextFields({ section: 'ui' }),
    );

    expect(node.kind).toBe('sysconfiguration');
    expect(node.mode).toBe('special');
  });

  it('precompiles nested UI metadata expressions without evaluating their variables', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    registerContextEntity(ctx, 'sys-users', sysBOUsersMetadata, {
      key: 'sys-users',
      record: {
        relatedCollections: {
          externalIdentities: {
            entityKey: 'external-identities',
            fields: {
              status: {
                expression: "emailVerified ? 'Verified' : 'Not verified'",
              },
            },
          },
        },
      },
    });

    const entity = ctx.entities.sysUsers as any;
    const field =
      entity?.uiMetadata?.record?.relatedCollections?.externalIdentities?.fields?.status;
    expect(field?.expression).toContain('emailVerified');
    expect(field?.ast?.kind).toBe('conditional');

    // Canonical objects remain self-identifying outside CTX, but the outer
    // ctx.entities key already owns identity so nested metadata does not repeat it.
    expect(entity?.key).toBe('sys-users');
    expect(entity?.metadata?.key).toBeUndefined();
    expect(entity?.uiMetadata?.key).toBeUndefined();
  });

  it('exposes a stable user permission branch for role and current platform', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'guest',
      email: 'guest@example.test',
      role: 'Guest',
      enabled: true,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      createdBy: 'test',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test',
    } as any;

    const ctx = createManatOSContext(
      MANATOS_COMPANY,
      platform,
      'http://localhost:3000',
      '0.1.0',
      user,
    );

    expect(ctx.user?.permissions.userRole).toBe('Guest');
    expect(ctx.user?.permissions.platforms[platform.id]).toEqual({
      capabilities: { platformAccess: false },
    });
    expect(contextPlatformAccess(ctx, platform.id)).toBe(false);

    const entitled = createManatOSContext(
      MANATOS_COMPANY,
      platform,
      'http://localhost:3000',
      '0.1.0',
      user,
      {},
      'sys',
      'development',
      { platformAccess: true },
    );
    expect(entitled.user?.permissions.platforms[platform.id]).toEqual({
      capabilities: { platformAccess: true },
    });
    expect(contextPlatformAccess(entitled, platform.id)).toBe(true);
  });
});

it('keeps list API rows and filter values directly on the page context instead of page.fields', () => {
  const platform = resolvePlatform(MANATOS_COMPANY);
  const base = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');
  const runtime = pageListRuntimeContext(
    [
      { id: 'p1', name: 'ManatOS', principalType: 'Company' },
      { id: 'p2', name: 'Our Admin', principalType: 'Person' },
    ],
    ['name', 'principalType'],
    { 'filter.name': 'Admin' },
  );
  const page = pageContextNode(
    'sysPrincipals',
    'sysbo-list',
    'list',
    contextFields({ entity: 'sysPrincipals' }),
    null,
    runtime,
  );
  const ctx = setPageContext(base, page);

  expect(ctx.page?.filters).toEqual({ name: 'Admin', principalType: null, listExceptions: null });
  expect(ctx.page?.entries).toEqual([
    { id: 'p1', name: 'ManatOS', principalType: 'Company' },
    { id: 'p2', name: 'Our Admin', principalType: 'Person' },
  ]);
  expect(ctx.page?.fields).not.toHaveProperty('items');
});

it('keeps entryOriginal/entry entry values directly on the child entry page context', () => {
  const platform = resolvePlatform(MANATOS_COMPANY);
  const base = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');
  const entryRuntime = pageEntryRuntimeContext({
    id: 'p2',
    name: 'Our Admin',
    principalType: 'Person',
    parentId: 'p1',
  });
  const entry = pageContextNode(
    'entry',
    'sysbo-entry',
    'edit',
    contextFields({ name: 'Our Admin', principalType: 'Person', parentId: 'p1' }),
    null,
    entryRuntime,
  );
  const list = pageContextNode(
    'sysPrincipals',
    'sysbo-list',
    'list',
    contextFields({ entity: 'sysPrincipals' }),
    entry,
  );
  const ctx = setPageContext(base, list);

  expect(ctx.page?.scope).toBe('sys');
  expect(ctx.page?.page?.scope).toBe('sys');
  expect(ctx.page?.page?.entryOriginal).toEqual({
    id: 'p2',
    name: 'Our Admin',
    principalType: 'Person',
    parentId: 'p1',
  });
  expect(ctx.page?.page?.entry).toEqual(ctx.page?.page?.entryOriginal);
  expect(ctx.page?.page?.state).toEqual({
    dirty: false,
    valid: true,
    internalEditing: false,
    internalEditorCount: 0,
    saving: false,
    deleting: false,
  });
});
