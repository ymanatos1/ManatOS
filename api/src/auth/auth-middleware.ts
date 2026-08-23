import type { RequestHandler } from 'express';

import {
  AuthenticationRequiredError,
  ForbiddenAppError,
  InvalidAccessTokenError,
  SysUserRole,
} from '@manatos/shared';

import { accessTokenStore, type AccessTokenContext } from './access-token-store.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user/session context.
       */
      auth?: AccessTokenContext;

      /**
       * Raw Bearer token for operations such as logout.
       *
       * This exists only for the duration of the HTTP request.
       */
      accessToken?: string;
    }
  }
}

/**
 * Require a valid API Bearer session.
 */
export const requireAuthenticated: RequestHandler = (req, _res, next) => {
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

/**
 * Restrict an authenticated endpoint to specified roles.
 */
export function requireRole(...roles: SysUserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new ForbiddenAppError());

      return;
    }

    next();
  };
}

/**
 * Convenience middleware for administrator-only operations.
 */
export const requireAdmin = requireRole(SysUserRole.Admin);
