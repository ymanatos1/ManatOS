import { beforeEach, describe, expect, it } from 'vitest';

import {
  PROTOCRM_PLATFORM_ID,
  SysBOPrincipalType,
  SysBOUserRole,
  type SysBOEntity,
} from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';

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

  it.each([SysBOUserRole.User, SysBOUserRole.Guest])(
    'blocks %s from protoCRM SysBOApplications',
    async (role) => {
      await expect(authorization.can('read', subject(role), 'sys-applications')).resolves.toBe(
        false,
      );
    },
  );

  it('gives Superuser platform execution access while keeping Applications read-only', async () => {
    const superuser = subject(SysBOUserRole.Superuser, 'super-1', 'Superuser1');
    await expect(authorization.can('read', superuser, 'sys-applications')).resolves.toBe(true);
    await expect(authorization.can('create', superuser, 'sys-applications')).resolves.toBe(false);
    await expect(
      authorization.platformCapabilities(superuser, PROTOCRM_PLATFORM_ID),
    ).resolves.toEqual({ platformAccess: true });
  });

  it('keeps normal Users out of platform applications until license authorization is rebuilt', async () => {
    const nonAdmin = subject(SysBOUserRole.User, 'user-1', 'User1');
    await expect(authorization.can('read', nonAdmin, 'sys-applications')).resolves.toBe(false);
    await expect(
      authorization.platformCapabilities(nonAdmin, PROTOCRM_PLATFORM_ID),
    ).resolves.toEqual({ platformAccess: false });
  });

  it.each([SysBOUserRole.Superuser, SysBOUserRole.User])(
    'keeps Company-owned Licenses list accessible to %s and scopes rows to their organization',
    async (role) => {
      const ownRoot = await context.store.sysPrincipals.create(
        {
          name: 'Own Company',
          enabled: true,
          principalType: SysBOPrincipalType.Company,
          parentId: null,
        },
        SYSTEM_AUDIT_ACTOR,
      );
      const ownPerson = await context.store.sysPrincipals.create(
        {
          name: 'Own Person',
          enabled: true,
          principalType: SysBOPrincipalType.Person,
          parentId: ownRoot.id,
          rootId: ownRoot.id,
        },
        SYSTEM_AUDIT_ACTOR,
      );
      const otherRoot = await context.store.sysPrincipals.create(
        {
          name: 'Other Company',
          enabled: true,
          principalType: SysBOPrincipalType.Company,
          parentId: null,
        },
        SYSTEM_AUDIT_ACTOR,
      );
      const user = await context.store.sysUsers.create(
        {
          name: 'Scoped User',
          email: 'scoped-user@example.test',
          role,
          enabled: true,
          emailVerified: true,
        },
        SYSTEM_AUDIT_ACTOR,
      );
      await context.store.sysPrincipals.update(
        ownPerson.id,
        { userId: user.id },
        SYSTEM_AUDIT_ACTOR,
      );
      const current = subject(role, user.id, user.name);
      const ownLicense = { ...entity('own-license'), principalId: ownRoot.id };
      const otherLicense = { ...entity('other-license'), principalId: otherRoot.id };

      await expect(authorization.can('read', current, 'sys-licenses')).resolves.toBe(true);
      await expect(authorization.can('read', current, 'sys-licenses', ownLicense)).resolves.toBe(
        true,
      );
      await expect(authorization.can('read', current, 'sys-licenses', otherLicense)).resolves.toBe(
        false,
      );
      await expect(
        authorization.filterListItems(current, 'sys-licenses', [ownLicense, otherLicense]),
      ).resolves.toEqual([ownLicense]);
      await expect(
        authorization.filterListItems(current, 'sys-principals', [ownRoot, ownPerson, otherRoot]),
      ).resolves.toEqual([ownRoot, ownPerson]);
    },
  );

  it('keeps the User Licenses collection readable but empty without an organization link', async () => {
    const user = await context.store.sysUsers.create(
      {
        name: 'Unlinked User',
        email: 'unlinked-user@example.test',
        role: SysBOUserRole.User,
        enabled: true,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const current = subject(SysBOUserRole.User, user.id, user.name);
    const license = { ...entity('company-license'), principalId: 'company-principal' };

    await expect(authorization.can('read', current, 'sys-licenses')).resolves.toBe(true);
    await expect(
      authorization.filterListItems(current, 'sys-licenses', [license]),
    ).resolves.toEqual([]);
  });

  it('keeps Company-owned Licenses unreadable to Guest', async () => {
    const guest = subject(SysBOUserRole.Guest);
    const license = entity('license-1');

    await expect(authorization.can('read', guest, 'sys-licenses')).resolves.toBe(false);
    await expect(authorization.can('read', guest, 'sys-licenses', license)).resolves.toBe(false);
    await expect(authorization.filterListItems(guest, 'sys-licenses', [license])).resolves.toEqual(
      [],
    );
  });

  it('keeps Company-owned Principals unavailable to Guest at both collection and record scope', async () => {
    const guest = subject(SysBOUserRole.Guest);
    const principal = entity('principal-1');

    await expect(authorization.can('read', guest, 'sys-principals')).resolves.toBe(false);
    await expect(authorization.can('read', guest, 'sys-principals', principal)).resolves.toBe(
      false,
    );
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

  it.each([SysBOUserRole.User, SysBOUserRole.Guest])(
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

  it('allows Superuser inspection but no mutation of protected administration entities', async () => {
    const superuser = subject(SysBOUserRole.Superuser);
    for (const key of ['sys-applications', 'sys-ext-auth-providers', 'sys-configurations']) {
      await expect(authorization.can('read', superuser, key)).resolves.toBe(true);
      await expect(authorization.can('create', superuser, key)).resolves.toBe(false);
      await expect(authorization.can('update', superuser, key, entity('record'))).resolves.toBe(
        false,
      );
      await expect(authorization.can('delete', superuser, key, entity('record'))).resolves.toBe(
        false,
      );
    }
  });

  it('keeps Superuser administration read-only while preserving own-User self-service update', async () => {
    const superuser = subject(SysBOUserRole.Superuser, 'super-id', 'Superuser');
    const related = { ...entity('record'), createdBy: 'super-id', updatedBy: 'super-id' };
    for (const key of ['sys-users', 'sys-principals', 'sys-licenses']) {
      await expect(authorization.can('update', superuser, key, related)).resolves.toBe(false);
      await expect(authorization.can('delete', superuser, key, related)).resolves.toBe(false);
    }

    await expect(
      authorization.can('update', superuser, 'sys-users', entity('super-id')),
    ).resolves.toBe(true);
    await expect(
      authorization.can('delete', superuser, 'sys-users', entity('super-id')),
    ).resolves.toBe(false);
  });

  it('allows Admin full access to external-authentication configuration', async () => {
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
    [SysBOUserRole.Guest, false, false],
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

  it.each([
    [SysBOUserRole.Admin, true, true, true, true, true],
    [SysBOUserRole.Superuser, true, true, true, true, true],
    [SysBOUserRole.User, true, true, true, false, false],
    [SysBOUserRole.Guest, true, false, false, false, false],
  ] as const)(
    'projects the canonical collection-read matrix for %s',
    async (role, users, principals, licenses, applications, externalAuth) => {
      const context = await createTestApi();
      const authorization = new AuthorizationService(context.store);

      const capabilities = await authorization.entityCollectionCapabilities(subject(role), [
        'sys-users',
        'sys-principals',
        'sys-licenses',
        'sys-applications',
        'sys-ext-auth-providers',
      ]);

      expect(
        Object.fromEntries(Object.entries(capabilities).map(([key, value]) => [key, value.read])),
      ).toEqual({
        'sys-users': users,
        'sys-principals': principals,
        'sys-licenses': licenses,
        'sys-applications': applications,
        'sys-ext-auth-providers': externalAuth,
      });
    },
  );

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
