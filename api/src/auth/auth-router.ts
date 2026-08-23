import { Router, type Request } from 'express';

import { ForbiddenAppError, NotFoundError, operationContext, type SysUser } from '@manatos/shared';

import { config } from '../config.js';

import { authenticatedAuditActor } from '../audit/audit-service.js';

import type { SysUserService } from '../services/sys-user-service.js';

import { accessTokenStore, type SessionClientInfo } from './access-token-store.js';

import { requireAuthenticated } from './auth-middleware.js';

/**
 * Authentication/session API.
 *
 * Public:
 *
 *   POST /register
 *   POST /login
 *
 * Authenticated:
 *
 *   GET  /me
 *   PUT  /password
 *   GET  /sessions
 *   POST /logout
 *   POST /logout-all
 */
export function createAuthRouter(users: SysUserService): Router {
  const router = Router();

  /**
   * Public Guest registration.
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

            ...(req.body?.firstName
              ? {
                  firstName: String(req.body.firstName),
                }
              : {}),

            ...(req.body?.lastName
              ? {
                  lastName: String(req.body.lastName),
                }
              : {}),

            ...(req.body?.description
              ? {
                  description: String(req.body.description),
                }
              : {}),
          });

          res.status(201).json({
            success: true,

            data: publicUser(user),
          });
        },
      );
    },
  );

  /**
   * Create a new API session using user-name/email + password.
   *
   * Multiple concurrent sessions are deliberately supported.
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
           * Accounts must verify their email before receiving an API
           * session token.
           */
          if (!user.emailVerified) {
            throw new ForbiddenAppError('Email verification is required before API login.');
          }

          const clientInfo = sessionClientInfo(req);

          const token = accessTokenStore.create(user, config.API_ACCESS_TOKEN_MINUTES, clientInfo);

          res.json({
            success: true,

            data: {
              accessToken: token.token,

              tokenType: 'Bearer',

              sessionId: token.tokenId,

              expiresInSeconds: config.API_ACCESS_TOKEN_MINUTES * 60,

              expiresAt: new Date(token.expiresAt).toISOString(),

              user: publicUser(user),
            },
          });
        },
      );
    },
  );

  /*
   * Everything below here requires an active session.
   */
  router.use(requireAuthenticated);

  /**
   * Return the current authenticated account.
   */
  router.get(
    '/me',

    async (req, res) => {
      const user = await users.get(req.auth!.userId);

      if (!user) {
        throw new NotFoundError('SysUser', req.auth!.userId);
      }

      res.json({
        success: true,

        data: publicUser(user),
      });
    },
  );

  /**
   * List all currently active API sessions belonging to this user.
   */
  router.get(
    '/sessions',

    (req, res) => {
      const sessions = accessTokenStore.listUserSessions(req.auth!.userId, req.auth!.tokenId);

      res.json({
        success: true,

        data: {
          total: sessions.length,

          sessions,
        },
      });
    },
  );

  /**
   * Revoke exactly the current API session.
   */
  router.post(
    '/logout',

    (req, res) => {
      const sessionId = req.auth!.tokenId;

      const revoked = accessTokenStore.revoke(req.accessToken!);

      res.status(200).json({
        success: true,

        data: {
          message: 'Logged out successfully.',

          sessionId,

          revoked,
        },
      });
    },
  );

  /**
   * Revoke every active API session belonging to the current user.
   *
   * This includes the current session.
   */
  router.post(
    '/logout-all',

    (req, res) => {
      const revokedSessions = accessTokenStore.revokeAllForUser(req.auth!.userId);

      res.status(200).json({
        success: true,

        data: {
          message: 'All sessions logged out successfully.',

          revokedSessions,
        },
      });
    },
  );

  /**
   * Change or establish the current user's local password.
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
            success: true,

            data: publicUser(user),
          });
        },
      );
    },
  );

  return router;
}

/**
 * Collect non-security-critical information about the client session.
 *
 * req.ip is deliberately preferred over directly trusting
 * X-Forwarded-For.
 *
 * When deploying behind a known reverse proxy, Express trust-proxy
 * configuration should be configured correctly so req.ip represents
 * the real client.
 */
function sessionClientInfo(req: Request): SessionClientInfo {
  const clientName = req.header('x-client-name')?.trim();

  const userAgent = req.header('user-agent')?.trim();

  const ipAddress = req.ip;

  return {
    ...(clientName
      ? {
          clientName,
        }
      : {}),

    ...(userAgent
      ? {
          userAgent,
        }
      : {}),

    ...(ipAddress
      ? {
          ipAddress,
        }
      : {}),
  };
}

/**
 * Never expose passwordHash.
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
