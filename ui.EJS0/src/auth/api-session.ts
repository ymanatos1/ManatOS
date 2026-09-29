import type { Request } from 'express';

import { AppError } from '@manatos/shared';

import type { ApiRequestOptions } from '../api/client.js';

/**
 * Error code used specifically for loss/expiration of the API session
 * associated with the current browser UI session.
 */
export const UI_API_SESSION_EXPIRED = 'UI_API_SESSION_EXPIRED';

/**
 * Build normal authenticated API-request options from the current
 * server-side Express UI session.
 *
 * The Bearer token never needs to be exposed to browser JavaScript.
 */
export function apiSessionOptions(req: Request): ApiRequestOptions {
  const token = req.session.apiAccessToken;

  if (!token || isApiSessionExpired(req)) {
    throw apiSessionExpiredError();
  }

  return {
    accessToken: token,
  };
}

/**
 * Fast local expiry check.
 *
 * This is an optimization/user-experience check only.
 *
 * The API remains authoritative because a token can also have been:
 *
 * - revoked;
 * - removed by logout-all;
 * - removed after API restart;
 * - invalidated for another reason.
 */
export function isApiSessionExpired(req: Request): boolean {
  const expiresAt = req.session.apiExpiresAt;

  if (!expiresAt) {
    return false;
  }

  const timestamp = Date.parse(expiresAt);

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp <= Date.now();
}

/**
 * Remove all authentication state belonging to the UI/API session bridge.
 *
 * Other ordinary session state does not have to be destroyed here.
 */
export function clearApiSession(req: Request): void {
  delete req.session.userId;

  delete req.session.currentUserSnapshot;

  delete req.session.authenticationMethod;

  delete req.session.apiAccessToken;

  delete req.session.apiSessionId;

  delete req.session.apiExpiresAt;

  /**
   * SysBO Rows selection is intentionally scoped to the authenticated
   * ManatOS session and must not leak into the next user session.
   */
  delete req.session.uiPageSize;

  /**
   * Application workspace selection belongs to the authenticated user
   * context and should not survive logout/session expiration.
   */
  delete req.session.activeApplicationId;
}

/**
 * Recognize the bridge-specific session-expiration error.
 */
export function isApiSessionExpiredError(error: unknown): boolean {
  return error instanceof AppError && error.code === UI_API_SESSION_EXPIRED;
}

/**
 * Construct the standard UI session-expiration error.
 */
export function apiSessionExpiredError() {
  return new AppError(
    UI_API_SESSION_EXPIRED,

    'The server-side UI session no longer has a valid API access token.',

    'Your session has expired. Please sign in again.',

    false,
  );
}
