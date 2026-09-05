import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  PROTOCRM_PLATFORM_ID,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  SysBOUserPrincipalRelationship,
  SysBOUserRole,
} from '@manatos/shared';
import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';

import {
  bearer,
  createTestApi,
  expectQuerySuccess,
  loginAdmin,
  seedAdmin,
} from './test-helpers.js';

describe('SysBO authorization capability API', () => {
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

  it('resolves non-Admin platform access from linked-principal licensing in the API', async () => {
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
    const principal = await context.services.principals.create(
      {
        name: 'Platform Capability Principal',
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
    await context.services.licenses.create(
      {
        name: 'Platform capability license',
        principalId: principal.id,
        platformId: PROTOCRM_PLATFORM_ID,
        status: SysBOLicenseStatus.Active,
        quantity: 1,
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
    expectQuerySuccess(response.body);
    expect(response.body.data.capabilities).toEqual({ platformAccess: true });
  });
});
