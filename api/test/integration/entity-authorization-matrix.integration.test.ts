import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  PROTOCRM_PLATFORM_ID,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  SysBOUserRole,
} from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';
import {
  bearer,
  createTestApi,
  expectFailure,
  expectQuerySuccess,
  loginAdmin,
  seedAdmin,
} from '../support/test-helpers.js';

describe('API integration - four-role entity authorization matrix', () => {
  it('keeps navigation-level access and row visibility aligned with canonical API policy', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const adminToken = await loginAdmin(context.app);
    const admin = context.store.sysUsers
      .values()
      .find((entry) => entry.role === SysBOUserRole.Admin);
    expect(admin).toBeDefined();

    const ownRoot = await context.store.sysPrincipals.create(
      {
        name: 'User Company',
        enabled: true,
        principalType: SysBOPrincipalType.Company,
        parentId: null,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const userPerson = await context.store.sysPrincipals.create(
      {
        name: 'User Person',
        enabled: true,
        principalType: SysBOPrincipalType.Person,
        parentId: ownRoot.id,
        rootId: ownRoot.id,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const superRoot = await context.store.sysPrincipals.create(
      {
        name: 'Superuser Company',
        enabled: true,
        principalType: SysBOPrincipalType.Company,
        parentId: null,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const superPerson = await context.store.sysPrincipals.create(
      {
        name: 'Superuser Person',
        enabled: true,
        principalType: SysBOPrincipalType.Person,
        parentId: superRoot.id,
        rootId: superRoot.id,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const user = await context.services.users.createUser(
      {
        name: 'MatrixUser',
        email: 'matrix-user@example.test',
        password: 'MatrixUser!123',
        role: SysBOUserRole.User,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await context.services.principals.update(
      userPerson.id,
      { userId: user.id },
      SYSTEM_AUDIT_ACTOR,
    );
    const superuser = await context.services.users.createUser(
      {
        name: 'MatrixSuperuser',
        email: 'matrix-superuser@example.test',
        password: 'MatrixSuperuser!123',
        role: SysBOUserRole.Superuser,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await context.services.principals.update(
      superPerson.id,
      { userId: superuser.id },
      SYSTEM_AUDIT_ACTOR,
    );
    const guest = await context.services.users.createUser(
      {
        name: 'MatrixGuest',
        email: 'matrix-guest@example.test',
        password: 'MatrixGuest!123',
        role: SysBOUserRole.Guest,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const userLicense = await context.store.sysLicenses.create(
      {
        name: 'User organization license',
        principalId: ownRoot.id,
        platformId: PROTOCRM_PLATFORM_ID,
        status: SysBOLicenseStatus.Active,
        quantity: 1,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const superLicense = await context.store.sysLicenses.create(
      {
        name: 'Superuser organization license',
        principalId: superRoot.id,
        platformId: PROTOCRM_PLATFORM_ID,
        status: SysBOLicenseStatus.Active,
        quantity: 1,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const login = async (identity: string, password: string) => {
      const response = await request(context.app)
        .post('/api/v1/auth/login')
        .send({ identity, password });
      expect(response.status).toBe(200);
      return String(response.body?.data?.accessToken ?? '');
    };

    const userToken = await login(user.name, 'MatrixUser!123');
    const superuserToken = await login(superuser.name, 'MatrixSuperuser!123');
    const guestToken = await login(guest.name, 'MatrixGuest!123');

    const list = async (path: string, token: string) => {
      const response = await request(context.app)
        .get(`/api/v1/${path}?page=1&pageSize=100&sort=name`)
        .set('authorization', bearer(token));
      return response;
    };

    const userUsers = await list('SysUsers', userToken);
    expect(userUsers.status).toBe(200);
    expectQuerySuccess(userUsers.body);
    expect(userUsers.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([user.id]);

    const superUsers = await list('SysUsers', superuserToken);
    expect(superUsers.status).toBe(200);
    expectQuerySuccess(superUsers.body);
    expect(superUsers.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([
      superuser.id,
    ]);

    const guestUsers = await list('SysUsers', guestToken);
    expect(guestUsers.status).toBe(200);
    expectQuerySuccess(guestUsers.body);
    expect(guestUsers.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([guest.id]);

    const userPrincipals = await list('SysPrincipals', userToken);
    expect(userPrincipals.status).toBe(200);
    expectQuerySuccess(userPrincipals.body);
    expect(
      new Set(userPrincipals.body.data.items.map((entry: { id: string }) => entry.id)),
    ).toEqual(new Set([ownRoot.id, userPerson.id]));

    const userLicenses = await list('SysLicenses', userToken);
    expect(userLicenses.status).toBe(200);
    expectQuerySuccess(userLicenses.body);
    expect(userLicenses.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([
      userLicense.id,
    ]);

    const direct = async (path: string, id: string, token: string) =>
      request(context.app).get(`/api/v1/${path}/${id}`).set('authorization', bearer(token));

    expect((await direct('SysUsers', user.id, userToken)).status).toBe(200);
    expect((await direct('SysUsers', superuser.id, userToken)).status).toBe(403);
    expect((await direct('SysPrincipals', ownRoot.id, userToken)).status).toBe(200);
    expect((await direct('SysPrincipals', superRoot.id, userToken)).status).toBe(403);
    expect((await direct('SysLicenses', userLicense.id, userToken)).status).toBe(200);
    expect((await direct('SysLicenses', superLicense.id, userToken)).status).toBe(403);

    const superPrincipals = await list('SysPrincipals', superuserToken);
    expect(superPrincipals.status).toBe(200);
    expect(
      new Set(superPrincipals.body.data.items.map((entry: { id: string }) => entry.id)),
    ).toEqual(new Set([superRoot.id, superPerson.id]));

    const superLicenses = await list('SysLicenses', superuserToken);
    expect(superLicenses.status).toBe(200);
    expect(superLicenses.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([
      superLicense.id,
    ]);

    for (const path of ['SysPrincipals', 'SysLicenses', 'SysApplications']) {
      const response = await list(path, guestToken);
      expect(response.status).toBe(403);
      expectFailure(response.body);
    }

    const userApplications = await list('SysApplications', userToken);
    expect(userApplications.status).toBe(403);
    expectFailure(userApplications.body);

    const superApplications = await list('SysApplications', superuserToken);
    expect(superApplications.status).toBe(200);
    expectQuerySuccess(superApplications.body);

    for (const path of ['SysExtAuthProviders', 'SysConfigurations']) {
      const inspected = await list(path, superuserToken);
      expect(inspected.status).toBe(200);
      expectQuerySuccess(inspected.body);
    }

    const superMutation = await request(context.app)
      .post('/api/v1/SysApplications')
      .set('authorization', bearer(superuserToken))
      .send({ name: 'Forbidden superuser mutation', enabled: true });
    expect(superMutation.status).toBe(403);
    expectFailure(superMutation.body);

    const adminUsers = await list('SysUsers', adminToken);
    expect(adminUsers.status).toBe(200);
    expect(adminUsers.body.data.items.map((entry: { id: string }) => entry.id)).toEqual(
      expect.arrayContaining([admin!.id, user.id, superuser.id, guest.id]),
    );

    const adminPrincipals = await list('SysPrincipals', adminToken);
    expect(adminPrincipals.status).toBe(200);
    expect(adminPrincipals.body.data.items).toHaveLength(4);

    const adminLicenses = await list('SysLicenses', adminToken);
    expect(adminLicenses.status).toBe(200);
    expect(adminLicenses.body.data.items).toHaveLength(2);
  }, 10_000);
});
