import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import request from 'supertest';

import { createApp } from '../src/app.js';

import {
  SYSTEM_AUDIT_ACTOR,
} from '../src/audit/audit-service.js';

import {
  createTestApi,
  bearer,
  expectCommandSuccess,
  expectFailure,
  expectQuerySuccess,
} from './test-helpers.js';

describe('API integration - authentication and sessions', () => {
  let context: Awaited<
    ReturnType<typeof createTestApi>
  >;

  beforeEach(async () => {
    context = await createTestApi();
  });

  it('registers only Guest accounts and never exposes passwordHash', async () => {
    const response = await registerGuest(
      context.app,
      {
        name: 'Yiannis',
        email: 'yiannis@example.test',
        password: 'Klania1234!',
        role: 'Admin',
      },
    );

    expect(response.status).toBe(201);
    expectCommandSuccess(response.body);

    expect(response.body.data).toMatchObject({
      name: 'Yiannis',
      email: 'yiannis@example.test',
      role: 'Guest',
      emailVerified: false,
      enabled: true,
      hasPassword: true,
    });

    expect(response.body.data).not.toHaveProperty(
      'passwordHash',
    );
  });

  it('rejects duplicate user-name and email values case-insensitively', async () => {
    const original = await registerGuest(
      context.app,
      {
        name: 'Yiannis',
        email: 'yiannis@example.test',
        password: 'Klania1234!',
      },
    );

    expect(original.status).toBe(201);

    const duplicateName = await registerGuest(
      context.app,
      {
        name: 'YIANNIS',
        email: 'different@example.test',
        password: 'Klania1234!',
      },
    );

    expect(duplicateName.status).toBe(409);
    expectFailure(duplicateName.body);

    expect(duplicateName.body.error.code).toBe(
      'DUPLICATE_BO_VALUE',
    );

    const duplicateEmail = await registerGuest(
      context.app,
      {
        name: 'DifferentUser',
        email: 'YIANNIS@EXAMPLE.TEST',
        password: 'Klania1234!',
      },
    );

    expect(duplicateEmail.status).toBe(409);
    expectFailure(duplicateEmail.body);

    expect(duplicateEmail.body.error.code).toBe(
      'DUPLICATE_BO_VALUE',
    );
  });

  it('requires email verification before login and accepts either user-name or email afterwards', async () => {
    const registration = await registerGuest(
      context.app,
      {
        name: 'Yiannis',
        email: 'yiannis@example.test',
        password: 'Klania1234!',
      },
    );

    const userId =
      registration.body.data.id as string;

    const blocked = await login(
      context.app,
      'Yiannis',
      'Klania1234!',
    );

    expect(blocked.status).toBe(403);
    expectFailure(blocked.body);

    /**
     * Email delivery/verification-link mechanics are a separate concern.
     * Mark the account verified through the service to continue testing the
     * public login contract itself.
     */
    await context.services.users.setEmailVerified(
      userId,
      SYSTEM_AUDIT_ACTOR,
    );

    const byUserName = await login(
      context.app,
      'Yiannis',
      'Klania1234!',
    );

    expect(byUserName.status).toBe(200);
    expectCommandSuccess(byUserName.body);

    expect(byUserName.body.data.user.name).toBe(
      'Yiannis',
    );

    const byEmail = await login(
      context.app,
      'yiannis@example.test',
      'Klania1234!',
    );

    expect(byEmail.status).toBe(200);
    expectCommandSuccess(byEmail.body);

    expect(byEmail.body.data.user.id).toBe(
      userId,
    );
  });

  it('tracks concurrent sessions, revokes one session, then revokes all remaining sessions', async () => {
    const registration = await registerGuest(
      context.app,
      {
        name: 'SessionUser',
        email: 'sessions@example.test',
        password: 'Session!1234',
      },
    );

    const userId =
      registration.body.data.id as string;

    await context.services.users.setEmailVerified(
      userId,
      SYSTEM_AUDIT_ACTOR,
    );

    const firstLogin = await request(
      context.app,
    )
      .post('/api/v1/auth/login')
      .set(
        'x-client-name',
        'Vitest Session A',
      )
      .send({
        identity: 'SessionUser',
        password: 'Session!1234',
      });

    expect(firstLogin.status).toBe(200);
    expectCommandSuccess(firstLogin.body);

    const tokenA =
      firstLogin.body.data.accessToken as string;

    const secondLogin = await request(
      context.app,
    )
      .post('/api/v1/auth/login')
      .set(
        'x-client-name',
        'Vitest Session B',
      )
      .send({
        identity: 'SessionUser',
        password: 'Session!1234',
      });

    expect(secondLogin.status).toBe(200);
    expectCommandSuccess(secondLogin.body);

    const tokenB =
      secondLogin.body.data.accessToken as string;

    expect(tokenB).not.toBe(tokenA);

    const sessionsA = await request(
      context.app,
    )
      .get('/api/v1/auth/sessions')
      .set(
        'Authorization',
        bearer(tokenA),
      );

    expect(sessionsA.status).toBe(200);
    expectQuerySuccess(sessionsA.body);

    expect(sessionsA.body.data.total).toBe(2);

    expect(
      sessionsA.body.data.sessions.filter(
        (session: { current: boolean }) =>
          session.current,
      ),
    ).toHaveLength(1);

    expect(
      sessionsA.body.data.sessions.map(
        (session: {
          clientName?: string;
        }) => session.clientName,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Vitest Session A',
        'Vitest Session B',
      ]),
    );

    const logoutA = await request(
      context.app,
    )
      .post('/api/v1/auth/logout')
      .set(
        'Authorization',
        bearer(tokenA),
      );

    expect(logoutA.status).toBe(200);
    expectCommandSuccess(logoutA.body);

    expect(logoutA.body.data.revoked).toBe(true);

    const revokedA = await request(
      context.app,
    )
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        bearer(tokenA),
      );

    expect(revokedA.status).toBe(401);
    expectFailure(revokedA.body);

    expect(revokedA.body.error.code).toBe(
      'INVALID_ACCESS_TOKEN',
    );

    /**
     * Revoking session A must not invalidate independent session B.
     */
    const stillValidB = await request(
      context.app,
    )
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        bearer(tokenB),
      );

    expect(stillValidB.status).toBe(200);
    expectQuerySuccess(stillValidB.body);

    const logoutAll = await request(
      context.app,
    )
      .post('/api/v1/auth/logout-all')
      .set(
        'Authorization',
        bearer(tokenB),
      );

    expect(logoutAll.status).toBe(200);
    expectCommandSuccess(logoutAll.body);

    expect(
      logoutAll.body.data.revokedSessions,
    ).toBeGreaterThanOrEqual(1);

    const revokedB = await request(
      context.app,
    )
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        bearer(tokenB),
      );

    expect(revokedB.status).toBe(401);
    expectFailure(revokedB.body);
  });

  it('allows an authenticated user to change the local password', async () => {
    const registration = await registerGuest(
      context.app,
      {
        name: 'PasswordUser',
        email: 'password@example.test',
        password: 'Initial!1234',
      },
    );

    const userId =
      registration.body.data.id as string;

    await context.services.users.setEmailVerified(
      userId,
      SYSTEM_AUDIT_ACTOR,
    );

    const signedIn = await login(
      context.app,
      'PasswordUser',
      'Initial!1234',
    );

    const token =
      signedIn.body.data.accessToken as string;

    const changed = await request(
      context.app,
    )
      .put('/api/v1/auth/password')
      .set(
        'Authorization',
        bearer(token),
      )
      .send({
        currentPassword: 'Initial!1234',
        newPassword: 'Changed!1234',
      });

    expect(changed.status).toBe(200);
    expectCommandSuccess(changed.body);

    expect(changed.body.data).not.toHaveProperty(
      'passwordHash',
    );

    const oldPassword = await login(
      context.app,
      'PasswordUser',
      'Initial!1234',
    );

    expect(oldPassword.status).toBe(401);
    expectFailure(oldPassword.body);

    const newPassword = await login(
      context.app,
      'PasswordUser',
      'Changed!1234',
    );

    expect(newPassword.status).toBe(200);
    expectCommandSuccess(newPassword.body);
  });
});

async function registerGuest(
  app: ReturnType<typeof createApp>,
  body: Record<string, unknown>,
) {
  return request(app)
    .post('/api/v1/auth/register')
    .send(body);
}

async function login(
  app: ReturnType<typeof createApp>,
  identity: string,
  password: string,
) {
  return request(app)
    .post('/api/v1/auth/login')
    .send({
      identity,
      password,
    });
}
