import type { Request } from 'express';

/**
 * IMPORTANT:
 *
 * Explicitly load the UI's express-session type augmentation.
 *
 * Without this import, the test TypeScript context may see only the
 * standard Express Request type and therefore report:
 *
 *   Property 'session' does not exist on type 'Request'
 *
 * This is a type-only import, so it produces no runtime JavaScript.
 */
import type {} from '../src/types/express.js';

import { describe, expect, it } from 'vitest';

import {
  apiSessionOptions,
  clearApiSession,
  isApiSessionExpired,
} from '../src/auth/api-session.js';

describe('UI API-session bridge', () => {
  it('returns Bearer request options for a valid server-side API session', () => {
    const req = testRequest({
      userId: 'user-1',

      apiAccessToken: 'token-1',

      apiSessionId: 'session-1',

      apiExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(apiSessionOptions(req)).toEqual({
      accessToken: 'token-1',
    });
  });

  it('detects a locally known expired API token', () => {
    const req = testRequest({
      userId: 'user-1',

      apiAccessToken: 'expired-token',

      apiSessionId: 'session-1',

      apiExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(isApiSessionExpired(req)).toBe(true);

    expect(() => apiSessionOptions(req)).toThrowError(/session/i);
  });

  it('clears authentication and active-application bridge state', () => {
    const req = testRequest({
      userId: 'user-1',

      authenticationMethod: 'local',

      apiAccessToken: 'token-1',

      apiSessionId: 'session-1',

      apiExpiresAt: new Date(Date.now() + 60_000).toISOString(),

      activeApplicationId: 'application-1',

      /**
       * Deliberately unrelated session state.
       *
       * clearApiSession() must preserve this value.
       */
      csrfToken: 'csrf-value',
    });

    clearApiSession(req);

    /**
     * User identity has been removed.
     */
    expect(req.session.userId).toBeUndefined();

    /**
     * Authentication method has been removed.
     */
    expect(req.session.authenticationMethod).toBeUndefined();

    /**
     * API Bearer token has been removed.
     */
    expect(req.session.apiAccessToken).toBeUndefined();

    /**
     * API session identifier has been removed.
     */
    expect(req.session.apiSessionId).toBeUndefined();

    /**
     * API token expiration information has been removed.
     */
    expect(req.session.apiExpiresAt).toBeUndefined();

    /**
     * Application selection belongs to the authenticated workspace,
     * so it is removed as well.
     */
    expect(req.session.activeApplicationId).toBeUndefined();

    /**
     * Non-authentication session state survives.
     */
    expect(req.session.csrfToken).toBe('csrf-value');
  });
});

/**
 * Minimal request shape required by the API-session helper tests.
 *
 * We intentionally model only the session properties used by:
 *
 * - apiSessionOptions()
 * - isApiSessionExpired()
 * - clearApiSession()
 *
 * There is no reason to construct a real express-session Session object
 * with regenerate(), destroy(), save(), etc. for these unit tests.
 */
type TestSessionRequest = {
  session: {
    userId?: string;

    authenticationMethod?: string;

    apiAccessToken?: string;

    apiSessionId?: string;

    apiExpiresAt?: string;

    activeApplicationId?: string;

    csrfToken?: string;

    [key: string]: unknown;
  };
};

function testRequest(session: TestSessionRequest['session']): Request {
  const request: TestSessionRequest = {
    session,
  };

  return request as unknown as Request;
}
