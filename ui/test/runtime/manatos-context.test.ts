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
  entityContextName,
  registerContextEntity,
} from '../../src/context/manatos-context.js';

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

    expect(Object.keys(ctx)).toEqual(['system', 'entities', 'company', 'user']);
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

  it('uses keyed fields without repeating the field name or metadata', () => {
    const fields = contextFields({ email: 'a@example.test' });

    expect(fields.email).toEqual({ value: 'a@example.test' });
    expect('name' in (fields.email ?? {})).toBe(false);
    expect('metadata' in (fields.email ?? {})).toBe(false);
  });

  it('keeps canonical metadata in the root entity registry', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    registerContextEntity(
      ctx,
      'sys-users',
      { name: 'sysUsers', label: 'User' },
      { key: 'sys-users' },
    );

    expect(entityContextName('sys-users')).toBe('sysUsers');
    expect(ctx.entities.sysUsers?.key).toBe('sys-users');
    expect(ctx.entities.sysUsers?.metadata).toEqual({ name: 'sysUsers', label: 'User' });
  });

  it('keeps canonical entity expression source and executable AST together in CTX', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    registerContextEntity(ctx, 'sys-users', sysBOUsersMetadata);

    const fullName = (ctx.entities.sysUsers?.metadata as any)?.fieldDefinition?.fullName
      ?.calculation;
    expect(fullName?.expression).toBe(
      "firstName !== '' && lastName !== '' ? firstName + ' ' + lastName : firstName !== '' ? firstName : lastName",
    );
    expect(fullName).not.toHaveProperty('ast');
  });

  it('rejects ctx identifiers that the future expression grammar cannot address', () => {
    expect(() => contextFields({ 'bad-name': 1 })).toThrow(/Invalid ManatOS ctx field identifier/);
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

  it('keeps nested UI metadata expression source and AST without evaluating variables', () => {
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
    expect(field).not.toHaveProperty('ast');

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
