import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { PROTOCRM_PLATFORM_ID, SysBOUserRole } from '@manatos/shared';
import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';

import {
  bearer,
  createTestApi,
  expectQuerySuccess,
  loginAdmin,
  seedAdmin,
} from '../support/test-helpers.js';

describe('SysBO authorization capability API', () => {
  it.each([
    [SysBOUserRole.Admin, true, true, true, true, true],
    [SysBOUserRole.Superuser, true, true, true, true, true],
    [SysBOUserRole.User, true, true, true, false, false],
    [SysBOUserRole.Guest, true, false, false, false, false],
  ] as const)(
    'projects one canonical entity collection-capability map for %s',
    async (role, users, principals, licenses, applications, externalAuth) => {
      const context = await createTestApi();
      let token: string;

      if (role === SysBOUserRole.Admin) {
        await seedAdmin(context.services.users);
        token = await loginAdmin(context.app);
      } else {
        const user = await context.services.users.createUser(
          {
            name: `Capability${role}`,
            email: `capability-${role.toLowerCase()}@example.test`,
            password: 'VeryStrong-Test-Password-42!',
            role,
            emailVerified: true,
            enabled: true,
          },
          SYSTEM_AUDIT_ACTOR,
        );
        const login = await request(context.app)
          .post('/api/v1/auth/login')
          .send({ identity: user.name, password: 'VeryStrong-Test-Password-42!' });
        expect(login.status).toBe(200);
        token = String(login.body?.data?.accessToken ?? '');
      }

      const response = await request(context.app)
        .get('/api/v1/authorization/entities/$capabilities')
        .set('authorization', bearer(token));

      expect(response.status).toBe(200);
      expectQuerySuccess(response.body);
      const entities = response.body.data.entities as Record<string, { read: boolean }>;
      expect(entities['sys-users']?.read).toBe(users);
      expect(entities['sys-principals']?.read).toBe(principals);
      expect(entities['sys-licenses']?.read).toBe(licenses);
      expect(entities['sys-applications']?.read).toBe(applications);
      expect(entities['sys-ext-auth-providers']?.read).toBe(externalAuth);
      expect(entities['sys-configurations']?.read).toBe(
        role === SysBOUserRole.Admin || role === SysBOUserRole.Superuser,
      );

      const metadataExpectations = [
        ['SysUsers', users],
        ['SysPrincipals', principals],
        ['SysLicenses', licenses],
        ['SysApplications', applications],
        ['SysExtAuthProviders', externalAuth],
      ] as const;
      for (const [path, readable] of metadataExpectations) {
        const metadata = await request(context.app)
          .get(`/api/v1/${path}/$metadata`)
          .set('authorization', bearer(token));
        expect(metadata.status).toBe(readable ? 200 : 403);
      }
    },
  );

  it('returns collection capabilities from the authoritative API policy', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const response = await request(context.app)
      .get('/api/v1/SysPrincipals/$capabilities')
      .set('authorization', bearer(token));

    expect(response.status).toBe(200);
    expectQuerySuccess(response.body);
    expect(response.body.data).toEqual({
      sysBOKey: 'sys-principals',
      scope: 'collection',
      capabilities: {
        read: true,
        create: true,
        update: false,
        delete: false,
      },
    });
  });

  it('uses the target record when projecting Admin self-delete capability', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const me = await request(context.app)
      .get('/api/v1/auth/me')
      .set('authorization', bearer(token));
    expect(me.status).toBe(200);
    const adminId = String(me.body?.data?.id ?? '');
    expect(adminId).not.toBe('');

    const response = await request(context.app)
      .get(`/api/v1/SysUsers/${adminId}/$capabilities`)
      .set('authorization', bearer(token));

    expect(response.status).toBe(200);
    expectQuerySuccess(response.body);
    expect(response.body.data.capabilities).toEqual({
      read: true,
      create: true,
      update: true,
      delete: false,
    });
  });

  it('lets an authenticated non-Admin discover that protected provider capabilities are false', async () => {
    const context = await createTestApi();
    await context.services.users.createUser(
      {
        name: 'CapabilityUser',
        email: 'capability-user@example.test',
        password: 'VeryStrong-Test-Password-42!',
        role: SysBOUserRole.User,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ identity: 'CapabilityUser', password: 'VeryStrong-Test-Password-42!' });
    expect(login.status).toBe(200);
    const token = String(login.body?.data?.accessToken ?? '');

    const response = await request(context.app)
      .get('/api/v1/SysExtAuthProviders/$capabilities')
      .set('authorization', bearer(token));

    expect(response.status).toBe(200);
    expectQuerySuccess(response.body);
    expect(response.body.data.capabilities).toEqual({
      read: false,
      create: false,
      update: false,
      delete: false,
    });
  });

  it('requires an authenticated API session', async () => {
    const context = await createTestApi();
    const response = await request(context.app).get('/api/v1/SysPrincipals/$capabilities');
    expect(response.status).toBe(401);
  });

  it('projects Admin platform access without exposing license policy inputs', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const response = await request(context.app)
      .get(`/api/v1/platforms/${PROTOCRM_PLATFORM_ID}/$capabilities`)
      .set('authorization', bearer(token));

    expect(response.status).toBe(200);
    expectQuerySuccess(response.body);
    expect(response.body.data).toEqual({
      platformId: PROTOCRM_PLATFORM_ID,
      capabilities: { platformAccess: true },
    });
    expect(response.body.data).not.toHaveProperty('licenses');
    expect(response.body.data).not.toHaveProperty('role');
  });

  it('projects Superuser platform execution access without exposing policy inputs', async () => {
    const context = await createTestApi();
    const superuser = await context.services.users.createUser(
      {
        name: 'PlatformCapabilitySuperuser',
        email: 'platform-capability-superuser@example.test',
        password: 'VeryStrong-Test-Password-42!',
        role: SysBOUserRole.Superuser,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ identity: superuser.name, password: 'VeryStrong-Test-Password-42!' });
    expect(login.status).toBe(200);
    const token = String(login.body?.data?.accessToken ?? '');

    const response = await request(context.app)
      .get(`/api/v1/platforms/${PROTOCRM_PLATFORM_ID}/$capabilities`)
      .set('authorization', bearer(token));

    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual({
      platformId: PROTOCRM_PLATFORM_ID,
      capabilities: { platformAccess: true },
    });
  });

  it('keeps User platform access false even when licenses exist', async () => {
    const context = await createTestApi();
    const user = await context.services.users.createUser(
      {
        name: 'PlatformCapabilityUser',
        email: 'platform-capability-user@example.test',
        password: 'VeryStrong-Test-Password-42!',
        role: SysBOUserRole.User,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ identity: user.name, password: 'VeryStrong-Test-Password-42!' });
    expect(login.status).toBe(200);
    const token = String(login.body?.data?.accessToken ?? '');

    const response = await request(context.app)
      .get(`/api/v1/platforms/${PROTOCRM_PLATFORM_ID}/$capabilities`)
      .set('authorization', bearer(token));

    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual({
      platformId: PROTOCRM_PLATFORM_ID,
      capabilities: { platformAccess: false },
    });
  });
});
