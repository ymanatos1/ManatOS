import { beforeEach, describe, expect, it } from 'vitest';

import request from 'supertest';

import { SysBOUserRole } from '@manatos/shared';

import { RelationshipIntegrityService } from '../src/services/relationship-integrity-service.js';

import {
  bearer,
  createTestApi,
  expectCommandSuccess,
  expectFailure,
  loginAdmin,
  seedAdmin,
  TEST_ADMIN,
} from './test-helpers.js';

describe('API integration - SysBOUser delete authorization', () => {
  let context: Awaited<ReturnType<typeof createTestApi>>;
  let adminToken: string;
  let adminId: string;

  beforeEach(async () => {
    context = await createTestApi();

    await seedAdmin(context.services.users);

    adminToken = await loginAdmin(context.app);

    const admin = await context.services.users.lookupByIdentity(TEST_ADMIN.name);

    if (!admin) {
      throw new Error('Seeded Admin could not be resolved.');
    }

    adminId = admin.id;
  });

  it('rejects an Admin deleting their own SysBOUser and preserves the account', async () => {
    const response = await request(context.app)
      .delete(`/api/v1/SysUsers/${adminId}`)
      .set('Authorization', bearer(adminToken));

    expect(response.status).toBe(403);
    expectFailure(response.body);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const preserved = await context.services.users.get(adminId);

    expect(preserved?.id).toBe(adminId);
  });

  it('returns a non-mutating delete preflight instead of failing when this row is not deletable', async () => {
    const response = await request(context.app)
      .get(`/api/v1/SysUsers/${adminId}/$delete-impact`)
      .set('Authorization', bearer(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      targetObjectKey: 'sys-users',
      targetId: adminId,
      authorized: false,
      canExecute: false,
      requiresConfirmation: false,
      impacts: [],
    });
  });

  it('allows an Admin to delete another SysBOUser', async () => {
    const otherUser = await createUser('DeleteTarget', 'delete-target@example.test');

    const response = await request(context.app)
      .delete(`/api/v1/SysUsers/${otherUser.id}`)
      .set('Authorization', bearer(adminToken));

    expect(response.status).toBe(200);
    expectCommandSuccess(response.body);
    expect(response.body.data).toEqual({ id: otherUser.id });

    await expect(context.services.users.get(otherUser.id)).resolves.toBeNull();
  });


  it('repairs a historical orphan External Identity from relationship metadata', () => {
    const now = new Date().toISOString();
    context.store.externalIdentities().set('orphan-identity', {
      id: 'orphan-identity',
      name: 'microsoft:orphan',
      enabled: true,
      createdAt: now,
      createdBy: 'test',
      updatedAt: now,
      updatedBy: 'test',
      userId: 'missing-user',
      provider: 'microsoft',
      providerSubject: 'orphan-subject',
      email: 'orphan@example.test',
      emailVerified: true,
    });

    const report = new RelationshipIntegrityService(context.store).repairOrphanedReferences();
    expect(report.repaired).toBe(1);
    expect(report.unresolved).toEqual([]);
    expect(context.store.externalIdentities().size).toBe(0);
  });

  it('uses relationship metadata to remove dependent external identities when a User is deleted', async () => {
    const otherUser = await createUser('FederatedTarget', 'federated-target@example.test');

    await context.services.externalIdentities.add(
      otherUser.id,
      {
        provider: 'microsoft',
        providerSubject: 'provider-subject-1',
        email: 'federated-target@example.test',
        emailVerified: true,
      },
      {userId: adminId, userName: TEST_ADMIN.name},
    );

    expect(context.store.externalIdentities().size).toBe(1);

    const preview = await request(context.app)
      .get(`/api/v1/SysUsers/${otherUser.id}/$delete-impact`)
      .set('Authorization', bearer(adminToken));

    expect(preview.status).toBe(200);
    expect(preview.body.data.impacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectKey: 'external-identities',
        relationship: 'user',
        count: 1,
        action: 'cascade',
      }),
    ]));

    const response = await request(context.app)
      .delete(`/api/v1/SysUsers/${otherUser.id}`)
      .set('Authorization', bearer(adminToken));

    expect(response.status).toBe(200);
    await expect(context.services.users.get(otherUser.id)).resolves.toBeNull();
    expect(context.store.externalIdentities().size).toBe(0);
  });

  it('rejects a non-Admin deleting another SysBOUser', async () => {
    const user = await createUser(
      'NormalUser',
      'normal-user@example.test',
      SysBOUserRole.User,
      'NormalUser!123',
    );

    const target = await createUser('ProtectedTarget', 'protected-target@example.test');

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .set('x-client-name', 'Vitest User')
      .send({
        identity: user.name,
        password: 'NormalUser!123',
      });

    expect(login.status).toBe(200);

    const userToken = login.body.data.accessToken as string;

    const response = await request(context.app)
      .delete(`/api/v1/SysUsers/${target.id}`)
      .set('Authorization', bearer(userToken));

    expect(response.status).toBe(403);
    expectFailure(response.body);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const preserved = await context.services.users.get(target.id);

    expect(preserved?.id).toBe(target.id);
  });


  it('prevents a Superuser from assigning roles through a direct SysBOUser PATCH', async () => {
    const superuser = await createUser(
      'SuperUser',
      'superuser@example.test',
      SysBOUserRole.Superuser,
      'SuperUser!123',
    );

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .set('x-client-name', 'Vitest Superuser')
      .send({
        identity: superuser.name,
        password: 'SuperUser!123',
      });

    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;

    const response = await request(context.app)
      .patch(`/api/v1/SysUsers/${superuser.id}`)
      .set('Authorization', bearer(token))
      .send({ role: SysBOUserRole.Admin });

    expect(response.status).toBe(403);
    expectFailure(response.body);

    const preserved = await context.services.users.get(superuser.id);
    expect(preserved?.role).toBe(SysBOUserRole.Superuser);
  });

  async function createUser(
    name: string,
    email: string,
    role = SysBOUserRole.Guest,
    password = 'TargetUser!123',
  ) {
    const response = await request(context.app)
      .post('/api/v1/SysUsers')
      .set('Authorization', bearer(adminToken))
      .send({
        name,
        email,
        password,
        role,
        emailVerified: true,
        enabled: true,
      });

    expect(response.status).toBe(201);
    expectCommandSuccess(response.body);

    return response.body.data as {
      id: string;
      name: string;
    };
  }
});
