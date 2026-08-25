import type { NextFunction, Request, Response } from 'express';

import { describe, expect, it, vi } from 'vitest';

import type {} from '../src/types/express.js';

import { requireSignedIn } from '../src/middleware/auth.js';

describe('requireSignedIn UI middleware', () => {
  it('redirects an anonymous request to sign-in', () => {
    const req = requestWithSession({});
    const redirect = vi.fn();
    const next = vi.fn();

    requireSignedIn(req, responseWithRedirect(redirect), next);

    expect(redirect).toHaveBeenCalledWith('/?auth=signin&message=signin-required');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects a browser session whose API token is missing', () => {
    const req = requestWithSession({
      userId: 'user-1',
      apiSessionId: 'session-1',
      apiExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const redirect = vi.fn();
    const next = vi.fn();

    requireSignedIn(req, responseWithRedirect(redirect), next);

    expect(redirect).toHaveBeenCalledWith('/?auth=signin&message=session-expired');
    expect(req.session.userId).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects a browser session whose API token has expired', () => {
    const req = requestWithSession({
      userId: 'user-1',
      apiAccessToken: 'expired-token',
      apiSessionId: 'session-1',
      apiExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const redirect = vi.fn();
    const next = vi.fn();

    requireSignedIn(req, responseWithRedirect(redirect), next);

    expect(redirect).toHaveBeenCalledWith('/?auth=signin&message=session-expired');
    expect(req.session.userId).toBeUndefined();
    expect(req.session.apiAccessToken).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('continues for a signed-in browser session with a usable API token', () => {
    const req = requestWithSession({
      userId: 'user-1',
      apiAccessToken: 'token-1',
      apiSessionId: 'session-1',
      apiExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const redirect = vi.fn();
    const next = vi.fn();

    requireSignedIn(req, responseWithRedirect(redirect), next);

    expect(next).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });
});

function requestWithSession(session: Record<string, unknown>): Request {
  return {
    session,
  } as unknown as Request;
}

function responseWithRedirect(redirect: ReturnType<typeof vi.fn>): Response {
  return {
    redirect,
  } as unknown as Response;
}
