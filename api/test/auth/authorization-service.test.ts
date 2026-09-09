import { beforeEach, describe, expect, it } from 'vitest';

import { PROTOCRM_PLATFORM_ID, SysBOUserRole, type SysBOEntity } from '@manatos/shared';

import {
  AuthorizationService,
  type AuthorizationSubject,
} from '../../src/auth/authorization-service.js';

import { createTestApi } from '../support/test-helpers.js';

describe('AuthorizationService', () => {
  let authorization: AuthorizationService;
  let context: Awaited<ReturnType<typeof createTestApi>>;

  beforeEach(async () => {
    context = await createTestApi();
    authorization = new AuthorizationService(context.store);
  });

  it.each(['read', 'create', 'update', 'delete'] as const)(
    'allows an Admin to %s a normal SysBO',
    async (action) => {
      const record = entity('application-1');

      await expect(
        authorization.can(action, subject(SysBOUserRole.Admin), 'sys-applications', record),
      ).resolves.toBe(true);
    },
  );

  it.each([SysBOUserRole.Superuser, SysBOUserRole.User, SysBOUserRole.Guest])(
    'blocks an unlicensed non-Admin %s from protoCRM SysBOApplications',
    async (role) => {
      await expect(authorization.can('read', subject(role), 'sys-applications')).resolves.toBe(
        false,
      );
    },
  );

  it('keeps platform applications Admin-only until license authorization is rebuilt', async () => {
    const nonAdmin = subject(SysBOUserRole.User, 'user-1', 'User1');
    await expect(authorization.can('read', nonAdmin, 'sys-applications')).resolves.toBe(false);
    await expect(
      authorization.platformCapabilities(nonAdmin, PROTOCRM_PLATFORM_ID),
    ).resolves.toEqual({ platformAccess: false });
  });

  it('scopes non-Admin SysBOUser reads to the authenticated user record', async () => {
    const guest = subject(SysBOUserRole.Guest, 'guest-id', 'Guest');

    await expect(authorization.can('read', guest, 'sys-users')).resolves.toBe(true);
    await expect(authorization.can('read', guest, 'sys-users', entity('guest-id'))).resolves.toBe(
      true,
    );
    await expect(authorization.can('read', guest, 'sys-users', entity('other-id'))).resolves.toBe(
      false,
    );
    await expect(
      authorization.filterListItems(guest, 'sys-users', [entity('guest-id'), entity('other-id')]),
    ).resolves.toEqual([entity('guest-id')]);
  });

  it('does not constrain an Admin SysBOUser list', async () => {
    const items = [entity('admin-id'), entity('other-id')];
    await expect(
      authorization.filterListItems(subject(SysBOUserRole.Admin, 'admin-id'), 'sys-users', items),
    ).resolves.toEqual(items);
  });

  it('allows an Admin to delete another SysBOUser', async () => {
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');
    const otherUser = entity('other-user-id');

    await expect(authorization.can('delete', admin, 'sys-users', otherUser)).resolves.toBe(true);
  });

  it('blocks an Admin from deleting their own SysBOUser', async () => {
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');
    const ownUser = entity('admin-id');

    await expect(authorization.can('delete', admin, 'sys-users', ownUser)).resolves.toBe(false);
  });

  it('blocks a non-Admin from deleting their own SysBOUser', async () => {
    const user = subject(SysBOUserRole.User, 'user-id', 'User');
    const ownUser = entity('user-id');

    await expect(authorization.can('delete', user, 'sys-users', ownUser)).resolves.toBe(false);
  });

  it.each([SysBOUserRole.Superuser, SysBOUserRole.User, SysBOUserRole.Guest])(
    'blocks external-authentication configuration from %s',
    async (role) => {
      await expect(
        authorization.can('read', subject(role), 'sys-ext-auth-providers'),
      ).resolves.toBe(false);
      await expect(
        authorization.can('update', subject(role), 'sys-ext-auth-providers', entity('provider')),
      ).resolves.toBe(false);
    },
  );

  it('allows Admin access to external-authentication configuration', async () => {
    await expect(
      authorization.can('read', subject(SysBOUserRole.Admin), 'sys-ext-auth-providers'),
    ).resolves.toBe(true);
    await expect(
      authorization.can('create', subject(SysBOUserRole.Admin), 'sys-ext-auth-providers'),
    ).resolves.toBe(true);
  });

  it('blocks SysBOUser deletion when the target record was not resolved', async () => {
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');

    await expect(authorization.can('delete', admin, 'sys-users')).resolves.toBe(false);
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

describe('AuthorizationService capabilities projection', () => {
  it.each([
    [SysBOUserRole.Admin, true, true],
    [SysBOUserRole.Superuser, true, false],
    [SysBOUserRole.User, true, false],
    [SysBOUserRole.Guest, true, false],
  ] as const)('projects collection capabilities for %s', async (role, read, create) => {
    const context = await createTestApi();
    const authorization = new AuthorizationService(context.store);

    await expect(authorization.capabilities(subject(role), 'sys-principals')).resolves.toEqual({
      read,
      create,
      update: false,
      delete: false,
    });
  });

  it('projects Admin self-delete as false while preserving the other record capabilities', async () => {
    const context = await createTestApi();
    const authorization = new AuthorizationService(context.store);
    const admin = subject(SysBOUserRole.Admin, 'admin-id', 'Admin');

    await expect(
      authorization.capabilities(admin, 'sys-users', entity('admin-id')),
    ).resolves.toEqual({
      read: true,
      create: true,
      update: true,
      delete: false,
    });
  });
});
