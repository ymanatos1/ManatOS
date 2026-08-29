import type { RequestHandler } from 'express';

import createError from 'http-errors';

import { SysBOUserRole } from '@manatos/shared';

import { clearApiSession, isApiSessionExpired } from '../auth/api-session.js';

/**
 * Require an authenticated browser/UI session.
 *
 * A valid signed-in UI session requires both:
 *
 * - userId;
 * - a usable API session token.
 *
 * If the UI session cookie itself has expired, Express gives us a new
 * unauthenticated session and userId is absent.
 *
 * If the API token has expired while the UI session still exists, clear
 * the bridge state and return to sign-in.
 */
export const requireSignedIn: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    res.redirect('/?auth=signin&message=signin-required');

    return;
  }

  if (!req.session.apiAccessToken || isApiSessionExpired(req)) {
    clearApiSession(req);

    res.redirect('/?auth=signin&message=session-expired');

    return;
  }

  next();
};

/**
 * UI convenience/security check for administrator-only pages.
 *
 * The API still performs the final authorization check.
 */
export const requireAdmin: RequestHandler = (_req, res, next) => {
  const user = res.locals.currentUser as import('@manatos/shared').SysBOUser | null;

  if (!user || user.role !== SysBOUserRole.Admin) {
    next(createError(403, 'Administrator access is required.'));

    return;
  }

  next();
};
