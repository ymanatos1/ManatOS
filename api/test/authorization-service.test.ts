import { beforeEach, describe, expect, it } from 'vitest';

import { SysBOUserRole, type SysBOEntity } from '@manatos/shared';

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
      authorization.can(action, subject(SysBOUserRole.Admin), 'sys-applications', record),
    ).resolves.toBe(true);
  });

  it.each([
    SysBOUserRole.Superuser,
    SysBOUserRole.Superuser,
    SysBOUserRole.User,
    SysBOUserRole.Guest,
  ])('allows an authenticated %s to read SysBOs', async (role) => {
    await expect(
      authorization.can('read', subject(role), 'sys-applications'),
    ).resolves.toBe(true);
  });

  it.each([
    SysBOUserRole.Superuser,
    SysBOUserRole.Superuser,
    SysBOUserRole.User,
    SysBOUserRole.Guest,
  ])('blocks generic SysBO creation for %s', async (role) => {
    await expect(
      authorization.can('create', subject(role), 'sys-applications'),
    ).resolves.toBe(false);
  });

  it('allows an Admin to delete another SysBOUser', async () => {
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');
    const otherUser = entity('other-user-id');

    await expect(
      authorization.can('delete', admin, 'sys-users', otherUser),
    ).resolves.toBe(true);
  });

  it('blocks an Admin from deleting their own SysBOUser', async () => {
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');
    const ownUser = entity('admin-id');

    await expect(
      authorization.can('delete', admin, 'sys-users', ownUser),
    ).resolves.toBe(false);
  });

  it('blocks a non-Admin from deleting their own SysBOUser', async () => {
    const user = subject(SysBOUserRole.User, 'user-id', 'User');
    const ownUser = entity('user-id');

    await expect(
      authorization.can('delete', user, 'sys-users', ownUser),
    ).resolves.toBe(false);
  });

  it.each([SysBOUserRole.Superuser, SysBOUserRole.User, SysBOUserRole.Guest])(
    'blocks external-authentication configuration from %s',
    async (role) => {
      await expect(authorization.can('read', subject(role), 'sys-ext-auth-providers')).resolves.toBe(false);
      await expect(authorization.can('update', subject(role), 'sys-ext-auth-providers', entity('provider'))).resolves.toBe(false);
    },
  );

  it('allows Admin access to external-authentication configuration', async () => {
    await expect(authorization.can('read', subject(SysBOUserRole.Admin), 'sys-ext-auth-providers')).resolves.toBe(true);
    await expect(authorization.can('create', subject(SysBOUserRole.Admin), 'sys-ext-auth-providers')).resolves.toBe(true);
  });

  it('blocks SysBOUser deletion when the target record was not resolved', async () => {
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');

    await expect(
      authorization.can('delete', admin, 'sys-users'),
    ).resolves.toBe(false);
  });
});

function subject(
  role: SysBOUserRole,
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
