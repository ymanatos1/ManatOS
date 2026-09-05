import { beforeEach, describe, expect, it } from 'vitest';

import {
  PROTOCRM_PLATFORM_ID,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  SysBOUserPrincipalRelationship,
  SysBOUserRole,
  type SysBOEntity,
} from '@manatos/shared';

import {
  AuthorizationService,
  type AuthorizationSubject,
} from '../src/auth/authorization-service.js';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';

import { createTestApi } from './test-helpers.js';

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

  it('uses linked-principal licenses for protoCRM collection and application read access', async () => {
    const user = await context.services.users.createUser(
      {
        name: 'LicensedUser',
        email: 'licensed@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const principal = await context.services.principals.create(
      {
        name: 'Licensed Principal',
        principalType: SysBOPrincipalType.Company,
        parentId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await context.services.userPrincipals.link(
      user.id,
      principal.id,
      SysBOUserPrincipalRelationship.Member,
      true,
      SYSTEM_AUDIT_ACTOR,
    );
    const allowedApp = await context.services.applications.create(
      { name: 'Allowed App', fullName: 'Allowed Application', enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );
    const otherApp = await context.services.applications.create(
      { name: 'Other App', fullName: 'Other Application', enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );
    await context.services.licenses.create(
      {
        name: 'Restricted protoCRM license',
        principalId: principal.id,
        platformId: PROTOCRM_PLATFORM_ID,
        applicationId: allowedApp.id,
        status: SysBOLicenseStatus.Active,
        quantity: 1,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const licensed = subject(SysBOUserRole.User, user.id, user.name);
    await expect(authorization.can('read', licensed, 'sys-applications')).resolves.toBe(true);
    await expect(authorization.can('read', licensed, 'sys-applications', allowedApp)).resolves.toBe(
      true,
    );
    await expect(authorization.can('read', licensed, 'sys-applications', otherApp)).resolves.toBe(
      false,
    );
    await expect(
      authorization.capabilities(licensed, 'sys-applications', allowedApp),
    ).resolves.toEqual({
      read: true,
      create: false,
      update: true,
      delete: true,
    });
    await expect(
      authorization.capabilities(licensed, 'sys-applications', otherApp),
    ).resolves.toEqual({
      read: false,
      create: false,
      update: false,
      delete: false,
    });
  });

  it.each([SysBOUserRole.Superuser, SysBOUserRole.User, SysBOUserRole.Guest])(
    'blocks generic SysBO creation for %s',
    async (role) => {
      await expect(authorization.can('create', subject(role), 'sys-applications')).resolves.toBe(
        false,
      );
    },
  );

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
