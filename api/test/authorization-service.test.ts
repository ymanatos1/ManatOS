import { beforeEach, describe, expect, it } from 'vitest';

import { SysUserRole, type SysBOEntity } from '@manatos/shared';

import { AuthorizationService, type AuthorizationSubject } from '../src/auth/authorization-service.js';

import { createTestApi } from './test-helpers.js';

describe('AuthorizationService', () => {
  let authorization: AuthorizationService;

  beforeEach(async () => {
    const context = await createTestApi();

    authorization = new AuthorizationService(context.store);
  });

  it.each([
    'read',
    'create',
    'update',
    'delete',
  ] as const)('allows an Admin to %s a normal SysBO', async (action) => {
    const record = entity('application-1');

    await expect(
      authorization.can(action, subject(SysUserRole.Admin), 'sys-applications', record),
    ).resolves.toBe(true);
  });

  it.each([
    SysUserRole.User,
    SysUserRole.Guest,
  ])('allows an authenticated %s to read SysBOs', async (role) => {
    await expect(
      authorization.can('read', subject(role), 'sys-applications'),
    ).resolves.toBe(true);
  });

  it.each([
    SysUserRole.User,
    SysUserRole.Guest,
  ])('blocks generic SysBO creation for %s', async (role) => {
    await expect(
      authorization.can('create', subject(role), 'sys-applications'),
    ).resolves.toBe(false);
  });

  it('allows an Admin to delete another SysUser', async () => {
    const admin = subject(SysUserRole.Admin, 'admin-id', 'Admin');
    const otherUser = entity('other-user-id');

    await expect(
      authorization.can('delete', admin, 'sys-users', otherUser),
    ).resolves.toBe(true);
  });

  it('blocks an Admin from deleting their own SysUser', async () => {
    const admin = subject(SysUserRole.Admin, 'admin-id', 'Admin');
    const ownUser = entity('admin-id');

    await expect(
      authorization.can('delete', admin, 'sys-users', ownUser),
    ).resolves.toBe(false);
  });

  it('blocks a non-Admin from deleting their own SysUser', async () => {
    const user = subject(SysUserRole.User, 'user-id', 'User');
    const ownUser = entity('user-id');

    await expect(
      authorization.can('delete', user, 'sys-users', ownUser),
    ).resolves.toBe(false);
  });

  it('blocks SysUser deletion when the target record was not resolved', async () => {
    const admin = subject(SysUserRole.Admin, 'admin-id', 'Admin');

    await expect(
      authorization.can('delete', admin, 'sys-users'),
    ).resolves.toBe(false);
  });
});

function subject(
  role: SysUserRole,
  userId = 'subject-id',
  userName = role,
): AuthorizationSubject {
  return {
    userId,
    userName,
    role,
  };
}

function entity(id: string): SysBOEntity {
  return {
    id,
    name: `Entity ${id}`,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'System',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'System',
  };
}
