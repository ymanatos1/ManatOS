import { beforeEach, describe, expect, it } from 'vitest';

import request from 'supertest';

import { createApp } from '../src/app.js';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';

import { config } from '../src/config.js';

import {
  createTestApi,
  bearer,
  expectCommandSuccess,
  expectFailure,
  expectQuerySuccess,
} from './test-helpers.js';

/**
 * Public SysUser representation returned by the API.
 *
 * passwordHash must never appear in this object.
 */
interface PublicSysUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  emailVerificationSource?: string | null;
  role: string;
  enabled: boolean;
  hasPassword: boolean;
  passwordChangedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  firstName?: string;
  lastName?: string;
  description?: string;
}

/**
 * Payload returned after successful API login.
 */
interface LoginData {
  accessToken: string;
  tokenType: 'Bearer';
  sessionId: string;
  expiresInSeconds: number;
  expiresAt: string;
  user: PublicSysUser;
}

/**
 * One session returned by GET /auth/sessions.
 */
interface UserSessionData {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  clientName?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Payload returned by GET /auth/sessions.
 */
interface SessionsData {
  sessions: UserSessionData[];
  total: number;
}

/**
 * Payload returned by POST /auth/logout.
 */
interface LogoutData {
  revoked: boolean;
  sessionId?: string;
}

/**
 * Payload returned by POST /auth/logout-all.
 */
interface LogoutAllData {
  revokedSessions: number;
}

describe('API integration - authentication and sessions', () => {
  let context: Awaited<ReturnType<typeof createTestApi>>;

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

        /**
         * A public registration request must not be able
         * to promote itself to Admin.
         */
        role: 'Admin',
      },
    );

    expect(response.status).toBe(201);

    const user = commandData<PublicSysUser>(response.body);

    expect(user).toMatchObject({
      name: 'Yiannis',

      email: 'yiannis@example.test',

      role: 'Guest',

      emailVerified: false,

      enabled: true,

      hasPassword: true,
    });

    expect(user).not.toHaveProperty('passwordHash');
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

    expect(duplicateName.body.error.code).toBe('DUPLICATE_BO_VALUE');

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

    expect(duplicateEmail.body.error.code).toBe('DUPLICATE_BO_VALUE');
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

    const registeredUser = commandData<PublicSysUser>(registration.body);

    const userId = registeredUser.id;

    const blocked = await login(
      context.app,

      'Yiannis',

      'Klania1234!',
    );

    expect(blocked.status).toBe(403);

    expectFailure(blocked.body);

    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    expect(blocked.body.errorMessage).toBe(
      'Your email address must be verified before you can sign in.',
    );

    expect(blocked.body.errorMessage).toBe(blocked.body.error.message);

    /**
     * Email delivery / verification-link mechanics are
     * a different responsibility.
     *
     * Mark the account verified through the service layer
     * so this test can continue concentrating on the public
     * login contract.
     */
    await context.services.users.setEmailVerified(userId, SYSTEM_AUDIT_ACTOR);

    /**
     * Login by unique user-name.
     */
    const byUserName = await login(
      context.app,

      'Yiannis',

      'Klania1234!',
    );

    expect(byUserName.status).toBe(200);

    const userNameLogin = commandData<LoginData>(byUserName.body);

    expect(userNameLogin.user.name).toBe('Yiannis');

    /**
     * Login by unique email.
     */
    const byEmail = await login(
      context.app,

      'yiannis@example.test',

      'Klania1234!',
    );

    expect(byEmail.status).toBe(200);

    const emailLogin = commandData<LoginData>(byEmail.body);

    expect(emailLogin.user.id).toBe(userId);
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

    const registeredUser = commandData<PublicSysUser>(registration.body);

    const userId = registeredUser.id;

    await context.services.users.setEmailVerified(userId, SYSTEM_AUDIT_ACTOR);

    /**
     * Create independent API session A.
     */
    const firstLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set('x-client-name', 'Vitest Session A')
      .send({
        identity: 'SessionUser',

        password: 'Session!1234',
      });

    expect(firstLogin.status).toBe(200);

    const firstLoginData = commandData<LoginData>(firstLogin.body);

    const tokenA = firstLoginData.accessToken;

    /**
     * Create independent API session B.
     */
    const secondLogin = await request(context.app)
      .post('/api/v1/auth/login')
      .set('x-client-name', 'Vitest Session B')
      .send({
        identity: 'SessionUser',

        password: 'Session!1234',
      });

    expect(secondLogin.status).toBe(200);

    const secondLoginData = commandData<LoginData>(secondLogin.body);

    const tokenB = secondLoginData.accessToken;

    /**
     * Separate logins must produce separate opaque tokens.
     */
    expect(tokenB).not.toBe(tokenA);

    /**
     * Session A sees both active sessions and recognizes itself
     * as the current one.
     */
    const sessionsA = await request(context.app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', bearer(tokenA));

    expect(sessionsA.status).toBe(200);

    const sessionsData = queryData<SessionsData>(sessionsA.body);

    expect(sessionsData.total).toBe(2);

    expect(sessionsData.sessions.filter((session) => session.current)).toHaveLength(1);

    expect(sessionsData.sessions.map((session) => session.clientName)).toEqual(
      expect.arrayContaining(['Vitest Session A', 'Vitest Session B']),
    );

    /**
     * Logout session A only.
     */
    const logoutA = await request(context.app)
      .post('/api/v1/auth/logout')
      .set('Authorization', bearer(tokenA));

    expect(logoutA.status).toBe(200);

    const logoutAData = commandData<LogoutData>(logoutA.body);

    expect(logoutAData.revoked).toBe(true);

    /**
     * Token A must now be invalid.
     */
    const revokedA = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(tokenA));

    expect(revokedA.status).toBe(401);

    expectFailure(revokedA.body);

    expect(revokedA.body.error.code).toBe('INVALID_ACCESS_TOKEN');

    /**
     * Revoking session A must not invalidate independent
     * session B.
     */
    const stillValidB = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(tokenB));

    expect(stillValidB.status).toBe(200);

    const currentUser = queryData<PublicSysUser>(stillValidB.body);

    expect(currentUser.id).toBe(userId);

    /**
     * Revoke all remaining sessions for this user through B.
     */
    const logoutAll = await request(context.app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', bearer(tokenB));

    expect(logoutAll.status).toBe(200);

    const logoutAllData = commandData<LogoutAllData>(logoutAll.body);

    expect(logoutAllData.revokedSessions).toBeGreaterThanOrEqual(1);

    /**
     * Session B must now be invalid as well.
     */
    const revokedB = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(tokenB));

    expect(revokedB.status).toBe(401);

    expectFailure(revokedB.body);
  });

  it('allows an authenticated user to change the local password', async () => {
    const registration = await registerGuest(context.app, {
      name: 'PasswordUser',
      email: 'password@example.test',
      password: 'Initial!1234',
    });

    const registeredUser = commandData<PublicSysUser>(registration.body);

    const userId = registeredUser.id;

    await context.services.users.setEmailVerified(userId, SYSTEM_AUDIT_ACTOR);

    /**
     * Authenticate with the original password.
     */
    const signedIn = await login(context.app, 'PasswordUser', 'Initial!1234');

    const signedInData = commandData<LoginData>(signedIn.body);

    const token = signedInData.accessToken;

    /**
     * Change password through the authenticated API command.
     */
    const changed = await request(context.app)
      .put('/api/v1/auth/password')
      .set('Authorization', bearer(token))
      .send({
        currentPassword: 'Initial!1234',
        newPassword: 'Changed!1234',
      });

    expect(changed.status).toBe(200);

    const changedUser = commandData<PublicSysUser>(changed.body);

    expect(changedUser).not.toHaveProperty('passwordHash');

    expect(changedUser.hasPassword).toBe(true);

    /**
     * Original password must stop working.
     */
    const oldPassword = await login(
      context.app,

      'PasswordUser',

      'Initial!1234',
    );

    expect(oldPassword.status).toBe(401);

    expectFailure(oldPassword.body);

    /**
     * New password must work.
     */
    const newPassword = await login(
      context.app,

      'PasswordUser',

      'Changed!1234',
    );

    expect(newPassword.status).toBe(200);

    const newLoginData = commandData<LoginData>(newPassword.body);

    expect(newLoginData.user.id).toBe(userId);
  });

  it('allows trusted local credential verification before email verification without creating a login session', async () => {
    const registration = await registerGuest(context.app, {
      name: 'LinkCandidate',
      email: 'link.candidate@example.test',
      password: 'LinkCandidate!123',
    });

    expect(registration.status).toBe(201);

    const registeredUser = commandData<PublicSysUser>(registration.body);
    expect(registeredUser.emailVerified).toBe(false);

    const verification = await request(context.app)
      .post('/api/v1/internal/auth/verify-local')
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        identity: 'LinkCandidate',
        password: 'LinkCandidate!123',
      });

    expect(verification.status).toBe(200);
    expectCommandSuccess(verification.body);

    const verifiedUser = commandData<PublicSysUser>(verification.body);
    expect(verifiedUser.id).toBe(registeredUser.id);
    expect(verifiedUser.emailVerified).toBe(false);
  });

  it('creates an API session for a trusted externally authenticated verified Guest', async () => {
    /**
     * Create a Guest through the trusted external-registration endpoint.
     *
     * This intentionally has:
     *
     * - verified email;
     * - no local password;
     * - Guest role.
     */
    const registration = await request(context.app)
      .post('/api/v1/internal/auth/register-external')
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        name: 'ExternalGuest',

        email: 'external.guest@example.test',

        emailVerified: true,
        emailVerificationSource: 'github',

        firstName: 'External',
      });

    expect(registration.status).toBe(201);

    const registeredUser = commandData<PublicSysUser>(registration.body);

    expect(registeredUser).toMatchObject({
      name: 'ExternalGuest',

      email: 'external.guest@example.test',

      role: 'Guest',

      emailVerified: true,
      emailVerificationSource: 'github',

      enabled: true,

      hasPassword: false,
    });

    const userId = registeredUser.id;

    /**
     * The trusted UI now asks the API to create the ordinary
     * Bearer session corresponding to that already-authenticated user.
     */
    const session = await request(context.app)
      .post('/api/v1/internal/auth/session')
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        userId,

        clientName: 'Vitest Web UI / Google',

        userAgent: 'Vitest',

        ipAddress: '127.0.0.1',
      });

    expect(session.status).toBe(200);

    const sessionData = commandData<LoginData>(session.body);

    expect(sessionData.accessToken).toBeTypeOf('string');

    expect(sessionData.sessionId).toBeTypeOf('string');

    expect(sessionData.expiresAt).toBeTypeOf('string');

    expect(sessionData.user.id).toBe(userId);

    expect(sessionData.user.hasPassword).toBe(false);

    /**
     * The resulting token must behave exactly like an ordinary
     * API login token.
     */
    const me = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(sessionData.accessToken));

    expect(me.status).toBe(200);

    const currentUser = queryData<PublicSysUser>(me.body);

    expect(currentUser.id).toBe(userId);
  });

  it('refuses trusted API-session creation until the user email is verified', async () => {
    /**
     * Public registration creates:
     *
     *   role = Guest
     *   emailVerified = false
     */
    const registration = await registerGuest(
      context.app,

      {
        name: 'UnverifiedBridgeUser',

        email: 'unverified.bridge@example.test',

        password: 'Bridge!1234',
      },
    );

    expect(registration.status).toBe(201);

    const registeredUser = commandData<PublicSysUser>(registration.body);

    expect(registeredUser.emailVerified).toBe(false);

    /**
     * Even the trusted UI process is not allowed to bypass the
     * verified-email requirement when creating an API session.
     */
    const session = await request(context.app)
      .post('/api/v1/internal/auth/session')
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        userId: registeredUser.id,

        clientName: 'Vitest Web UI',
      });

    expect(session.status).toBe(403);

    expectFailure(session.body);

    expect(session.body.error.code).toBe('FORBIDDEN');
  });

  it('allows one SysUser to own identities from multiple external providers', async () => {
    const registration = await request(context.app)
      .post('/api/v1/internal/auth/register-external')
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        name: 'MultiProviderUser',
        email: 'multi.provider@example.test',
        emailVerified: true,
        emailVerificationSource: 'github',
      });

    expect(registration.status).toBe(201);
    const user = commandData<PublicSysUser>(registration.body);

    for (const [provider, providerSubject] of [
      ['github', 'github-subject-1'],
      ['google', 'google-subject-1'],
    ] as const) {
      const link = await request(context.app)
        .post(`/api/v1/internal/SysUsers/${user.id}/external-identities`)
        .set('x-internal-api-key', config.INTERNAL_API_KEY)
        .send({
          provider,
          providerSubject,
          email: user.email,
          emailVerified: true,
        });

      expect(link.status).toBe(201);
    }

    const identities = await request(context.app)
      .get(`/api/v1/internal/SysUsers/${user.id}/external-identities`)
      .set('x-internal-api-key', config.INTERNAL_API_KEY);

    expect(identities.status).toBe(200);
    expect(queryData<Array<{ provider: string; userId: string }>>(identities.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'github', userId: user.id }),
        expect.objectContaining({ provider: 'google', userId: user.id }),
      ]),
    );
  });

  it('preserves the original email verification provenance when another provider verifies later', async () => {
    const registration = await request(context.app)
      .post('/api/v1/internal/auth/register-external')
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        name: 'VerificationProvenanceUser',
        email: 'verification.provenance@example.test',
        emailVerified: true,
        emailVerificationSource: 'github',
      });

    expect(registration.status).toBe(201);
    const user = commandData<PublicSysUser>(registration.body);
    const originalVerifiedAt = user.emailVerifiedAt;

    const verification = await request(context.app)
      .put(`/api/v1/internal/SysUsers/${user.id}/email-verified`)
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({ source: 'google' });

    expect(verification.status).toBe(200);
    const unchanged = commandData<PublicSysUser>(verification.body);

    expect(unchanged.emailVerificationSource).toBe('github');
    expect(unchanged.emailVerifiedAt).toBe(originalVerifiedAt);
  });
});

/**
 * Register one Guest through the real public HTTP endpoint.
 */
async function registerGuest(
  app: ReturnType<typeof createApp>,

  body: Record<string, unknown>,
) {
  return request(app).post('/api/v1/auth/register').send(body);
}

/**
 * Authenticate through the real public API.
 */
async function login(
  app: ReturnType<typeof createApp>,

  identity: string,

  password: string,
) {
  return request(app).post('/api/v1/auth/login').send({
    identity,
    password,
  });
}

/**
 * Assert the global command-response envelope and return its
 * data using the concrete payload type expected by this test.
 *
 * This is intentionally local to the test file.
 *
 * The common expectCommandSuccess() helper remains correctly generic
 * and therefore exposes data as unknown.
 */
function commandData<T>(body: unknown): T {
  expectCommandSuccess(body);

  return body.data as T;
}

/**
 * Assert the global GET/query-response envelope and return its
 * concrete payload.
 */
function queryData<T>(body: unknown): T {
  expectQuerySuccess(body);

  return body.data as T;
}
