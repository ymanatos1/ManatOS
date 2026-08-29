import { describe, expect, it } from 'vitest';
import {
  MANATOS_COMPANY,
  contextCollectionMemberKey,
  resolveContextMember,
  resolveContextMembers,
  resolvePlatform,
} from '@manatos/shared';

import {
  contextFields,
  createManatOSContext,
  currentPageContext,
  currentPagePath,
  entityContextName,
  pageContextNode,
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
    expect(resolveContextMembers(ctx, ['company', 'platforms', platform.id, 'id'])).toBe(platform.id);
    expect(resolveContextMembers(ctx, ['company', 'platforms', 0, 'id'])).toBe(platform.id);
  });

  it('keeps company platforms as an array and identifies the current platform', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0');

    expect(Array.isArray(ctx.company.platforms)).toBe(true);
    expect(ctx.company.currentPlatform).toBe(platform.id);
    expect(ctx.company.platforms[ctx.company.currentPlatformIndex]?.id).toBe(platform.id);
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

  it('rejects ctx identifiers that the future expression grammar cannot address', () => {
    expect(() => contextFields({ 'bad-name': 1 })).toThrow(/Invalid ManatOS ctx field identifier/);
    expect(() => pageContextNode('bad-name', 'page', 'none')).toThrow(/Invalid ManatOS ctx page identifier/);
  });


  it('names the logged-in user entity context explicitly as entityName', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const user = {
      id: 'u1', name: 'Admin', email: 'admin@example.test', emailVerified: true,
      passwordHash: 'never-exposed', role: 'Admin', firstName: '', lastName: '',
      description: '', enabled: true, createdAt: '', updatedAt: '',
    } as any;
    const ctx = createManatOSContext(MANATOS_COMPANY, platform, 'http://localhost:3000', '0.1.0', user);
    expect(ctx.user?.entityName).toBe('sysUsers');
    expect('entity' in (ctx.user ?? {})).toBe(false);
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
});
