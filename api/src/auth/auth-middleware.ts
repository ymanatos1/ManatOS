import type { RequestHandler } from 'express';

import {
  AuthenticationRequiredError,
  ForbiddenAppError,
  InvalidAccessTokenError,
  SysBOUserRole,
} from '@manatos/shared';

import { operationMiddleware } from '../http/middleware/operation-middleware.js';

import { accessTokenStore } from './access-token-store.js';

/**
 * Require a valid API Bearer session.
 */
const requireAuthenticatedCore: RequestHandler = (req, _res, next) => {
  const authorization = req.header('authorization');

  /*
   * No credentials were supplied.
   */
  if (!authorization) {
    next(new AuthenticationRequiredError());

    return;
  }

  /*
   * An Authorization header exists, but it is not a valid Bearer header.
   */
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    next(new InvalidAccessTokenError());

    return;
  }

  const token = match[1]?.trim();

  if (!token) {
    next(new InvalidAccessTokenError());

    return;
  }

  const auth = accessTokenStore.validate(token);

  if (!auth) {
    next(new InvalidAccessTokenError());

    return;
  }

  req.auth = auth;

  req.accessToken = token;

  next();
};

export const requireAuthenticated = operationMiddleware(
  'Authenticate API session',
  requireAuthenticatedCore,
  'Authenticating request',
);

/**
 * Restrict an authenticated endpoint to specified roles.
 */
export function requireRole(...roles: SysBOUserRole[]): RequestHandler {
  const middleware: RequestHandler = (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new ForbiddenAppError());

      return;
    }

    next();
  };

  return operationMiddleware('Authorize API role', middleware, 'Authorizing request');
}

/**
 * Convenience middleware for administrator-only operations.
 */
export const requireAdmin = requireRole(SysBOUserRole.Admin);
