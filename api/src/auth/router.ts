import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';

import {
  AppError,
  AuthenticationError,
  AUTH_RATE_LIMITS,
  InMemoryRateLimiter,
  NotFoundError,
  type RateLimitDecision,
  type SysBOUser,
} from '@manatos/shared';

import { operationContext, verifyAuthClientIp } from '@manatos/shared/node';

import { config } from '../config.js';

import { authenticatedAuditActor } from '../audit/audit-service.js';

import type { SysBOUserService } from '../services/sysbo/user-service.js';

import { accessTokenStore, type SessionClientInfo } from './access-token-store.js';

import { requireAuthenticated } from './auth-middleware.js';

import { sendCommand, sendQuery } from '../http/response.js';

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
export function createAuthRouter(users: SysBOUserService): Router {
  const router = Router();

  /**
   * One limiter for this API router.
   *
   * Counters survive individual requests but not API restarts.
   * The public API enforces its own security policy independently
   * of any UI server, so callers cannot bypass it.
   */
  const authLimits = new InMemoryRateLimiter();

  /**
   * Use Express's client IP, not an arbitrary forwarded header.
   *
   * A trusted reverse proxy must be configured explicitly at the
   * server boundary if one is introduced.
   */
  const clientIp = (req: Request): string => {
    try {
      /**
       * Direct API calls:
       *   Use Express's connection IP.
       *
       * Calls from the trusted NG1 server:
       *   Verify the signed client-IP claim before using it.
       *
       * We deliberately ignore arbitrary X-Forwarded-For headers.
       * The application's reverse-proxy trust configuration, if any,
       * is a separate deployment concern.
       */
      return (
        verifyAuthClientIp(
          config.AUTH_DELEGATION_SECRET,
          {
            ip: req.get('x-manatos-auth-client-ip'),
            time: req.get('x-manatos-auth-client-time'),
            signature: req.get('x-manatos-auth-client-signature'),
          },
          req.method,
          req.originalUrl.split('?')[0] ?? req.originalUrl,
          req.body,
        ) ??
        req.ip ??
        req.socket.remoteAddress ??
        'unknown'
      );
    } catch {
      throw new AppError(
        'FORBIDDEN',
        'Invalid trusted client IP delegation.',
        'Request forbidden.',
      );
    }
  };

  /** All login requests from one client IP share this counter. */
  const ipKey = (req: Request) => `api:login:ip:${clientIp(req)}`;

  /**
   * Incorrect-password attempts are tracked per identity AND IP.
   * Store a digest of the normalized identity, not the raw email/name.
   */
  const failureKey = (req: Request, identity: string) => {
    const digest = createHash('sha256').update(identity.trim().toLowerCase()).digest('hex');

    return `api:login:failed:${clientIp(req)}:${digest}`;
  };

  /**
   * Use the existing central API error handler.
   *
   * We only set Retry-After here; the existing AppError middleware
   * still produces the API's standard error response document.
   */
  function rejectLimit(res: Response, decision: RateLimitDecision): never {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));

    throw new AppError(
      'AUTH_RATE_LIMITED',
      'Authentication attempt rate limit exceeded.',
      'Too many authentication attempts. Please try again later.',
      true,
    );
  }

  /**
   * Public Guest registration.
   */
  router.post(
    '/register',

    /**
     * Registration is public.
     *
     * Count every registration request before account creation.
     * This reduces automated account creation even when submissions
     * contain invalid or already-used identities.
     */
    (req, res, next) => {
      const decision = authLimits.record(
        `api:register:ip:${clientIp(req)}`,
        AUTH_RATE_LIMITS.registration,
      );

      if (!decision.allowed) rejectLimit(res, decision);

      next();
    },

    async (req, res) => {
      await operationContext.runRoot(
        'Register Guest SysBOUser',

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

          sendCommand(res, 'Registration completed successfully.', publicUser(user), 201);
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

    /**
     * First protection: total login requests per IP.
     *
     * Count before credential verification. This prevents unlimited
     * password spraying against different user names.
     *
     * Successful login requests also count toward this limit.
     */
    (req, res, next) => {
      const decision = authLimits.record(ipKey(req), AUTH_RATE_LIMITS.loginByIp);

      if (!decision.allowed) rejectLimit(res, decision);

      next();
    },

    async (req, res) => {
      await operationContext.runRoot(
        'Login SysBOUser',

        async (scope) => {
          const identity = String(req.body?.identity ?? '');

          const password = String(req.body?.password ?? '');

          scope.addContext({
            identity,
            password,
          });

          /**
           * Second protection: incorrect passwords per identity/IP.
           *
           * Check before expensive Argon2 password verification.
           * Only real AuthenticationError failures are counted.
           *
           * Database/API errors must not incorrectly increase a user's
           * failure count.
           */
          const key = failureKey(req, identity);

          /**
           * Reserve before awaiting Argon2 password verification.
           *
           * Without a reservation, several concurrent login requests could
           * all pass the five-failure check before any had completed.
           *
           * Only incorrect credentials become recorded failures.
           * Operational exceptions release the reservation.
           */
          const reservation = authLimits.reserve(key, AUTH_RATE_LIMITS.loginFailures);

          if (!reservation.decision.allowed) {
            rejectLimit(res, reservation.decision);
          }

          let user: SysBOUser;

          try {
            user = await users.verifyLocalCredentials(identity, password);
            reservation.finish('release');
          } catch (error) {
            reservation.finish(error instanceof AuthenticationError ? 'failure' : 'release');
            throw error;
          }

          /**
           * Valid credentials clear previous incorrect attempts.
           *
           * Email verification requirements are checked afterward
           * by the existing handler and remain unchanged.
           */
          authLimits.clear(key);

          /*
           * Accounts must verify their email before receiving an API
           * session token.
           */
          if (!user.emailVerified) {
            throw new AppError(
              'EMAIL_NOT_VERIFIED',
              'Email verification is required before API login.',
              'Your email address must be verified before you can sign in.',
              false,
            );
          }

          const clientInfo = sessionClientInfo(req);

          const token = accessTokenStore.create(user, config.API_ACCESS_TOKEN_MINUTES, clientInfo);

          sendCommand(res, `User ${user.name} signed in successfully.`, {
            accessToken: token.token,
            tokenType: 'Bearer',
            sessionId: token.tokenId,
            expiresInSeconds: config.API_ACCESS_TOKEN_MINUTES * 60,
            expiresAt: new Date(token.expiresAt).toISOString(),
            user: publicUser(user),
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
        throw new NotFoundError('SysBOUser', req.auth!.userId);
      }

      sendQuery(res, publicUser(user));
    },
  );

  /**
   * List all currently active API sessions belonging to this user.
   */
  router.get(
    '/sessions',

    (req, res) => {
      const sessions = accessTokenStore.listUserSessions(req.auth!.userId, req.auth!.tokenId);

      sendQuery(res, {
        total: sessions.length,
        sessions,
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

      sendCommand(res, 'Logged out successfully.', {
        sessionId,
        revoked,
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

      sendCommand(res, 'All sessions logged out successfully.', {
        revokedSessions,
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
        'Change current SysBOUser password',

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

          sendCommand(res, 'Password changed successfully.', publicUser(user));
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
function publicUser(user: SysBOUser) {
  const {
    passwordHash,

    ...safe
  } = user;

  return {
    ...safe,

    hasPassword: Boolean(passwordHash),
  };
}
