import { Router, type Request } from 'express';

import {
  ForbiddenAppError,
  NotFoundError,
  SysUserRole,
  operationContext,
  isExternalProviderKey,
  type EmailVerificationSource,
  type SysUser,
  type SysUserPrincipalRelationship,
} from '@manatos/shared';

import type { ExternalIdentityService, UserPrincipalService } from '../services/domain-services.js';

import type { SysUserService } from '../services/sys-user-service.js';

import { internalAuditActor } from '../audit/audit-service.js';

import { accessTokenStore, type SessionClientInfo } from '../auth/access-token-store.js';

import { config } from '../config.js';

import { sendCommand, sendQuery } from './api-response.js';

import type { IEmailService } from '../email/email-service.js';

/**
 * Creates API endpoints intended for trusted internal use.
 *
 * The complete router is mounted behind requireInternalApiKey.
 *
 * These endpoints are used for operations where an ordinary user Bearer
 * token does not yet exist, for example:
 *
 * - external-provider account resolution;
 * - external-provider registration;
 * - email verification;
 * - password recovery;
 * - creation of an API session after trusted UI authentication.
 *
 * The internal API key authenticates the trusted UI PROCESS.
 *
 * It does not replace the user's Bearer token for normal business/SysBO
 * operations.
 */
export function createInternalRouter(
  users: SysUserService,
  ext: ExternalIdentityService,
  links: UserPrincipalService,
  email: IEmailService,
) {
  const router = Router();

  const actor = internalAuditActor();


  /**
   * Trusted UI -> API mail commands.
   *
   * The UI owns presentation/navigation URLs, while the API owns the
   * delivery infrastructure, templates and SMTP credentials.
   */
  router.post('/email/verification', async (req, res) => {
    const user = await users.get(String(req.body?.userId ?? ''));
    if (!user) throw new NotFoundError('SysUser', String(req.body?.userId ?? ''));

    const verificationUrl = req.body?.verificationUrl
      ? String(req.body.verificationUrl)
      : undefined;

    await email.sendWelcomeAndVerificationEmail(user, verificationUrl);
    sendCommand(res, 'Verification email sent successfully.', null);
  });

  router.post('/email/password-reset', async (req, res) => {
    const user = await users.get(String(req.body?.userId ?? ''));
    if (!user) throw new NotFoundError('SysUser', String(req.body?.userId ?? ''));

    await email.sendPasswordResetEmail(user, String(req.body?.resetUrl ?? ''));
    sendCommand(res, 'Password reset email sent successfully.', null);
  });

  router.post('/email/password-changed', async (req, res) => {
    const user = await users.get(String(req.body?.userId ?? ''));
    if (!user) throw new NotFoundError('SysUser', String(req.body?.userId ?? ''));

    await email.sendPasswordChangedEmail(user);
    sendCommand(res, 'Password change notification sent successfully.', null);
  });

  /**
   * Verify local credentials.
   *
   * The normal browser/UI sign-in flow now uses:
   *
   *   POST /api/v1/auth/login
   *
   * directly.
   *
   * This internal endpoint is retained because it may still be useful to
   * trusted internal clients.
   */
  router.post(
    '/auth/verify-local',

    async (req, res) =>
      operationContext.runRoot(
        'Sign in with email/user-name and password',

        async (scope) => {
          scope.addContext({
            identity: req.body?.identity,

            /*
             * OperationScope recognizes password as sensitive and
             * masks its value in the operation trace.
             */
            password: req.body?.password,
          });

          const user = await users.verifyLocalCredentials(
            String(req.body?.identity ?? ''),
            String(req.body?.password ?? ''),
          );

          sendCommand(res, 'Credentials verified successfully.', publicUser(user));
        },
      ),
  );

  /**
   * Trusted SysUser lookup by user-name or email.
   *
   * Used before a normal authenticated API session exists, primarily for:
   *
   * - password recovery;
   * - external-provider registration duplicate checks.
   *
   * This remains internal so unauthenticated public clients do not receive
   * a general account-discovery endpoint.
   */
  router.get(
    '/auth/lookup',

    async (req, res) => {
      const identity = String(req.query.identity ?? '');

      const user = await users.lookupByIdentity(identity);

      sendQuery(res, user ? publicUser(user) : null);
    },
  );

  /**
   * Register a SysUser following successful authentication by a trusted
   * external identity provider handled by the UI.
   *
   * The caller is never allowed to choose User/Admin here.
   *
   * External-provider registrations always start as Guest.
   */
  router.post(
    '/auth/register-external',

    async (req, res) => {
      await operationContext.runRoot(
        'Register external-provider SysUser',

        async (scope) => {
          const name = String(req.body?.name ?? '');

          const email = String(req.body?.email ?? '');

          const emailVerified = Boolean(req.body?.emailVerified);

          const emailVerificationSource = emailVerified
            ? parseEmailVerificationSource(req.body?.emailVerificationSource)
            : undefined;

          scope.addContext({
            name,
            email,
            password: req.body?.password,
            emailVerified,
            emailVerificationSource,
          });

          const user = await users.createUser(
            {
              name,
              email,

              /*
               * Security invariant:
               *
               * external registration cannot request User/Admin.
               */
              role: SysUserRole.Guest,

              emailVerified,

              ...(emailVerificationSource
                ? {
                    emailVerificationSource,
                  }
                : {}),

              enabled: true,

              ...(req.body?.password
                ? {
                    password: String(req.body.password),
                  }
                : {}),

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
            },

            actor,
          );

          sendCommand(
            res,
            `External-provider user '${user.name}' registered successfully.`,
            publicUser(user),
            201,
          );
        },
      );
    },
  );

  /**
   * Create an ordinary API session after the trusted UI has already
   * authenticated the user through another approved mechanism.
   *
   * Primary example:
   *
   *   Google/Facebook
   *       -> Passport in UI
   *       -> resolved SysUser
   *       -> POST /internal/auth/session
   *       -> ordinary opaque API Bearer token
   *
   * This endpoint does not authenticate Google/Facebook itself.
   */
  router.post(
    '/auth/session',

    async (req, res) => {
      await operationContext.runRoot(
        'Create trusted UI API session',

        async (scope) => {
          const userId = String(req.body?.userId ?? '');

          scope.addContext({
            userId,
            clientName: req.body?.clientName,
          });

          const user = await users.get(userId);

          if (!user) {
            throw new NotFoundError('SysUser', userId);
          }

          /*
           * Disabled users must not receive new API sessions.
           */
          if (!user.enabled) {
            throw new ForbiddenAppError('Disabled SysUser cannot receive an API session.');
          }

          /*
           * Preserve the same verification requirement as normal
           * POST /api/v1/auth/login.
           */
          if (!user.emailVerified) {
            throw new ForbiddenAppError(
              'Email verification is required before API session creation.',
            );
          }

          const clientInfo = trustedSessionClientInfo(req);

          const token = accessTokenStore.create(user, config.API_ACCESS_TOKEN_MINUTES, clientInfo);

          sendCommand(
            res,

            `API session created successfully for user ${user.name}.`,

            {
              accessToken: token.token,

              tokenType: 'Bearer',

              sessionId: token.tokenId,

              expiresInSeconds: config.API_ACCESS_TOKEN_MINUTES * 60,

              expiresAt: new Date(token.expiresAt).toISOString(),

              user: publicUser(user),
            },
          );
        },
      );
    },
  );

  /**
   * Resolve an external authentication identity.
   *
   * Typical providers include Google, Facebook and future OAuth/OIDC
   * identity providers.
   */
  router.get(
    '/external-identities/resolve',

    async (req, res) => {
      const provider = String(req.query.provider ?? '');

      const subject = String(req.query.subject ?? '');

      const identity = await ext.find(provider, subject);

      sendQuery(res, identity);
    },
  );

  /**
   * List external authentication identities linked to a SysUser.
   *
   * This trusted endpoint is used by the server-rendered UI to present
   * read-only authentication information on Account/User pages.
   */
  router.get(
    '/SysUsers/:userId/external-identities',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');
      const identities = await ext.listForUser(userId);

      sendQuery(res, identities);
    },
  );

  /**
   * Attach an external authentication identity to a SysUser.
   */
  router.post(
    '/SysUsers/:userId/external-identities',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');

      const externalIdentity = await ext.add(
        userId,

        {
          provider: String(req.body.provider),

          providerSubject: String(req.body.providerSubject),

          ...(req.body.email
            ? {
                email: String(req.body.email),
              }
            : {}),

          ...(req.body.emailVerified !== undefined
            ? {
                emailVerified: Boolean(req.body.emailVerified),
              }
            : {}),

          ...(req.body.displayName
            ? {
                displayName: String(req.body.displayName),
              }
            : {}),
        },

        actor,
      );

      sendCommand(res, 'External identity linked successfully.', externalIdentity, 201);
    },
  );

  /**
   * Set or replace a SysUser local password.
   *
   * This internal form remains appropriate for trusted password-recovery
   * and external-account setup flows where an authenticated Bearer session
   * may not yet exist.
   */
  router.put(
    '/SysUsers/:userId/password',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');

      const user = await users.setPassword(userId, String(req.body.password ?? ''), actor);

      sendCommand(res, `Password set successfully for user '${user.name}'.`, publicUser(user));
    },
  );

  /**
   * Mark the SysUser email address as verified.
   */
  router.put(
    '/SysUsers/:userId/email-verified',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');

      const source = parseEmailVerificationSource(req.body?.source);

      const user = await users.setEmailVerified(userId, actor, source);

      sendCommand(
        res,
        `Email verified successfully for user '${user.name}' via ${source}.`,
        publicUser(user),
      );
    },
  );

  /**
   * Associate a website SysUser with a customer SysPrincipal.
   *
   * IMPORTANT:
   *
   * UserPrincipalService.link() has exactly five arguments:
   *
   *   1. userId
   *   2. principalId
   *   3. relationship
   *   4. isDefault
   *   5. actor
   *
   * Keep the TypeScript type assertion on the same expression line to
   * avoid the parser ambiguity seen in the previous generated version.
   */
  router.post(
    '/SysUsers/:userId/principals',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');

      const principalId = String(req.body.principalId ?? '');

      const relationship = req.body.relationship as SysUserPrincipalRelationship;

      const isDefault = Boolean(req.body.isDefault);

      const link = await links.link(userId, principalId, relationship, isDefault, actor);

      sendCommand(
        res,
        `User ${userId} linked to principal ${principalId} successfully.`,
        link,
        201,
      );
    },
  );

  return router;
}

/**
 * Non-security-critical information describing the browser/client for an
 * API session created through the trusted UI bridge.
 *
 * These values are diagnostic only.
 *
 * They do not participate in authentication or authorization.
 */
function trustedSessionClientInfo(req: Request): SessionClientInfo {
  const clientName = req.body?.clientName ? String(req.body.clientName).trim() : undefined;

  const userAgent = req.body?.userAgent ? String(req.body.userAgent).trim() : undefined;

  const ipAddress = req.body?.ipAddress ? String(req.body.ipAddress).trim() : undefined;

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
 * Restrict persisted verification provenance to the supported stable keys.
 */
function parseEmailVerificationSource(value: unknown): EmailVerificationSource {
  const source = String(value ?? 'internal').toLowerCase();

  if (isExternalProviderKey(source)) {
    return source;
  }

  return 'internal';
}

/**
 * Creates the API-safe representation of a SysUser.
 *
 * passwordHash must never leave the trusted application layer.
 *
 * Callers receive only:
 *
 *   hasPassword: true | false
 *
 * so the UI can determine whether local password authentication exists
 * without exposing the actual hash.
 */
function publicUser(user: SysUser) {
  const { passwordHash, ...safeUser } = user;

  return {
    ...safeUser,

    hasPassword: Boolean(passwordHash),
  };
}
