import type { Request, RequestHandler, Response } from 'express';

import createError from 'http-errors';

import { SysBOUserRole } from '@manatos/shared';

import { clearApiSession, isApiSessionExpired } from '../auth/api-session.js';
import { config } from '../config.js';
import { addApiTrafficEntry } from '../debug/api-traffic-store.js';

const isInPlaceSave = (req: Request) => req.get('X-Requested-With') === 'ManatOS-InPlace-Save';

const rejectExpiredInPlaceSession = (req: Request, res: Response) => {
  clearApiSession(req);
  if (config.NODE_ENV !== 'production') {
    addApiTrafficEntry({
      requestId: 'ui-session-bridge',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      method: req.method,
      path: `${req.originalUrl} [blocked before API: session expired]`,
      status: 401,
      ok: false,
      error: 'UI/API bridge session expired before the business API request could be issued.',
    });
  }
  res.status(401).json({
    success: false,
    error: {
      code: 'UI_API_SESSION_EXPIRED',
      message: 'Your session has expired. Please sign in again.',
    },
  });
};

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
    if (isInPlaceSave(req)) {
      rejectExpiredInPlaceSession(req, res);
      return;
    }
    res.redirect('/?auth=signin&message=signin-required');

    return;
  }

  if (!req.session.apiAccessToken || isApiSessionExpired(req)) {
    if (isInPlaceSave(req)) {
      rejectExpiredInPlaceSession(req, res);
      return;
    }
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
