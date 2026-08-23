import type { RequestHandler } from 'express';

import { AuthenticationError, ForbiddenAppError, SysUserRole } from '@manatos/shared';

import { accessTokenStore, type AccessTokenContext } from './access-token-store.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenContext;
      accessToken?: string;
    }
  }
}

/**
 * Requires a valid Bearer access token.
 */
export const requireAuthenticated: RequestHandler = (req, _res, next) => {
  const authorization = req.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    next(new AuthenticationError());

    return;
  }

  const token = authorization.substring('Bearer '.length).trim();

  const auth = accessTokenStore.validate(token);

  if (!auth) {
    next(new AuthenticationError());

    return;
  }

  req.auth = auth;

  req.accessToken = token;

  next();
};

/**
 * Restrict an operation to the specified roles.
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
