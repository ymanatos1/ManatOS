import { beforeEach, describe, expect, it } from 'vitest';

import request from 'supertest';

import { SysUserRole } from '@manatos/shared';

import {
  bearer,
  createTestApi,
  expectCommandSuccess,
  expectFailure,
  loginAdmin,
  seedAdmin,
  TEST_ADMIN,
} from './test-helpers.js';

describe('API integration - SysUser delete authorization', () => {
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

  it('rejects an Admin deleting their own SysUser and preserves the account', async () => {
    const response = await request(context.app)
      .delete(`/api/v1/SysUsers/${adminId}`)
      .set('Authorization', bearer(adminToken));

    expect(response.status).toBe(403);
    expectFailure(response.body);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const preserved = await context.services.users.get(adminId);

    expect(preserved?.id).toBe(adminId);
  });

  it('allows an Admin to delete another SysUser', async () => {
    const otherUser = await createUser('DeleteTarget', 'delete-target@example.test');

    const response = await request(context.app)
      .delete(`/api/v1/SysUsers/${otherUser.id}`)
      .set('Authorization', bearer(adminToken));

    expect(response.status).toBe(200);
    expectCommandSuccess(response.body);
    expect(response.body.data).toEqual({ id: otherUser.id });

    await expect(context.services.users.get(otherUser.id)).resolves.toBeNull();
  });

  it('rejects a non-Admin deleting another SysUser', async () => {
    const user = await createUser(
      'NormalUser',
      'normal-user@example.test',
      SysUserRole.User,
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

  async function createUser(
    name: string,
    email: string,
    role = SysUserRole.Guest,
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
