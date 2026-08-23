import { Router } from 'express';

import { ForbiddenAppError, NotFoundError, operationContext, type SysUser } from '@manatos/shared';

import { config } from '../config.js';

import { authenticatedAuditActor } from '../audit/audit-service.js';

import type { SysUserService } from '../services/sys-user-service.js';

import { accessTokenStore } from './access-token-store.js';

import { requireAuthenticated } from './auth-middleware.js';

/**
 * Authentication API.
 *
 * Public:
 *
 *   POST /register
 *   POST /login
 *
 * Authenticated:
 *
 *   POST /logout
 *   GET  /me
 *   PUT  /password
 */
export function createAuthRouter(users: SysUserService): Router {
  const router = Router();

  /**
   * Public Guest registration.
   *
   * Role supplied by the caller is deliberately ignored because public
   * registration always creates a Guest account.
   */
  router.post(
    '/register',

    async (req, res) => {
      await operationContext.runRoot(
        'Register Guest SysUser',

        async (scope) => {
          const name = String(req.body?.name ?? '');

          const email = String(req.body?.email ?? '');

          const password = String(req.body?.password ?? '');

          scope.addContext({
            name,
            email,
            password,
          });

          const user = await users.registerGuest({
            name,
            email,
            password,
          });

          res.status(201).json({
            data: publicUser(user),
          });
        },
      );
    },
  );

  /**
   * Local authentication using either unique user-name or email.
   */
  router.post(
    '/login',

    async (req, res) => {
      await operationContext.runRoot(
        'Login SysUser',

        async (scope) => {
          const identity = String(req.body?.identity ?? '');

          const password = String(req.body?.password ?? '');

          scope.addContext({
            identity,
            password,
          });

          const user = await users.verifyLocalCredentials(identity, password);

          /*
           * Because Guest accounts may read all SysBOs in the current
           * authorization policy, an unverified registration must not
           * receive an access token.
           */
          if (!user.emailVerified) {
            throw new ForbiddenAppError('Email verification is required before API login.');
          }

          const token = accessTokenStore.create(user, config.API_ACCESS_TOKEN_MINUTES);

          res.json({
            data: {
              accessToken: token.token,

              tokenType: 'Bearer',

              expiresInSeconds: config.API_ACCESS_TOKEN_MINUTES * 60,

              expiresAt: new Date(token.expiresAt).toISOString(),

              user: publicUser(user),
            },
          });
        },
      );
    },
  );

  /**
   * Everything below this point requires a valid Bearer token.
   */
  router.use(requireAuthenticated);

  /**
   * Revoke the currently used access token immediately.
   */
  router.post(
    '/logout',

    (req, res) => {
      if (req.accessToken) {
        accessTokenStore.revoke(req.accessToken);
      }

      res.status(204).end();
    },
  );

  /**
   * Return the current account.
   */
  router.get(
    '/me',

    async (req, res) => {
      const user = await users.get(req.auth!.userId);

      if (!user) {
        throw new NotFoundError('SysUser', req.auth!.userId);
      }

      res.json({
        data: publicUser(user),
      });
    },
  );

  /**
   * Change or establish the current user's local password.
   *
   * Request:
   *
   * {
   *   "currentPassword": "...",   // required only when one exists
   *   "newPassword": "..."
   * }
   */
  router.put(
    '/password',

    async (req, res) => {
      await operationContext.runRoot(
        'Change current SysUser password',

        async (scope) => {
          const newPassword = String(req.body?.newPassword ?? '');

          const currentPassword =
            req.body?.currentPassword === undefined ? undefined : String(req.body.currentPassword);

          scope.addContext({
            userId: req.auth!.userId,

            currentPassword,

            newPassword,
          });

          const actor = authenticatedAuditActor(req.auth!.userId, req.auth!.userName);

          const user = await users.changePassword(
            req.auth!.userId,
            currentPassword,
            newPassword,
            actor,
          );

          res.json({
            data: publicUser(user),
          });
        },
      );
    },
  );

  return router;
}

/**
 * PasswordHash must never leave the API.
 */
function publicUser(user: SysUser) {
  const {
    passwordHash: _passwordHash,

    ...safe
  } = user;

  return {
    ...safe,

    hasPassword: Boolean(user.passwordHash),
  };
}
