import { describe, expect, it, vi } from 'vitest';

import { AuthApiFailure, AuthWorkflows, type AuthApiPort } from '../../src/node/auth/workflows.js';

/**
 * Browser tabs/windows of the same browser profile send the same HttpOnly
 * cookie. The server must therefore resolve them to ONE Auth session, without
 * requiring a UI-side database or storing access tokens in browser JavaScript.
 *
 * These are server-side contract tests. Cross-tab notification/BroadcastChannel
 * behavior belongs to the eventual NG1 browser Auth client, not this module.
 */
describe('shared.UI browser Auth workflows', () => {
  function setup() {
    const user = { id: 'user-1', name: 'Test user' };
    const login = vi.fn(async () => ({
      accessToken: 'server-only-api-token',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      user,
    }));
    const currentUser = vi.fn(async () => user);
    const logout = vi.fn(async () => {});
    const api: AuthApiPort = { login, currentUser, logout };
    return { workflows: new AuthWorkflows(api), login, currentUser, logout, user };
  }

  it('restores the same session in several tabs/windows and after a refresh', async () => {
    const { workflows, user } = setup();
    const anonymous = workflows.sessions.createAnonymous();
    const signedIn = await workflows.signIn(anonymous.cookieValue, 'tester', 'password');
    const cookieSharedByBrowser = signedIn.issued.cookieValue;

    expect(workflows.sessions.read(anonymous.cookieValue)).toBeNull();
    for (const windowName of ['first tab', 'second tab', 'separate window', 'refreshed tab']) {
      // Every browser surface sends the same server-issued session cookie.
      expect(await workflows.restore(cookieSharedByBrowser), windowName).toEqual({
        status: 'authenticated',
        user,
      });
    }
    expect(workflows.sessions.read(cookieSharedByBrowser)?.apiAccessToken).toBe(
      'server-only-api-token',
    );
  });

  it('signing out in one window revokes the session for every other window', async () => {
    const { workflows, logout } = setup();
    const signedIn = await workflows.signIn(null, 'tester', 'password');
    const cookie = signedIn.issued.cookieValue;

    await workflows.signOut(cookie);
    expect(await workflows.restore(cookie)).toEqual({ status: 'anonymous' });
    expect(logout).toHaveBeenCalledWith('server-only-api-token');
  });

  it('does not create a Sign In session on anonymous restoration', async () => {
    const { workflows, login } = setup();
    expect(await workflows.restore(null)).toEqual({ status: 'anonymous' });
    expect(login).not.toHaveBeenCalled();
  });

  it('revokes expired API access and preserves sessions across transient API errors', async () => {
    const { workflows, currentUser } = setup();
    const first = await workflows.signIn(null, 'tester', 'password');
    const cookie = first.issued.cookieValue;

    currentUser.mockRejectedValueOnce(new AuthApiFailure(503, 'API_UNAVAILABLE', 'Unavailable'));
    await expect(workflows.restore(cookie)).rejects.toMatchObject({ status: 503 });
    expect(workflows.sessions.read(cookie)).not.toBeNull();

    currentUser.mockRejectedValueOnce(new AuthApiFailure(403, 'FORBIDDEN', 'Forbidden'));
    await expect(workflows.restore(cookie)).rejects.toMatchObject({ status: 403 });
    expect(workflows.sessions.read(cookie)).not.toBeNull();

    currentUser.mockRejectedValueOnce(new AuthApiFailure(401, 'INVALID_ACCESS_TOKEN', 'Expired'));
    expect(await workflows.restore(cookie)).toEqual({ status: 'anonymous' });
    expect(workflows.sessions.read(cookie)).toBeNull();
  });

  it('retains Retry-After details when the API rejects an Auth request', () => {
    const error = new AuthApiFailure(
      429,
      'AUTH_RATE_LIMITED',
      'Too many authentication attempts.',
      90,
    );
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 90 });
  });
});
