import { Router } from 'express';

import { operationContext, type SysUser, type SysUserPrincipalRelationship } from '@manatos/shared';

import type { ExternalIdentityService, UserPrincipalService } from '../services/domain-services.js';

import type { SysUserService } from '../services/sys-user-service.js';

import { internalAuditActor } from '../audit/audit-service.js';

/**
 * Creates API endpoints intended for trusted internal use.
 *
 * These endpoints support authentication-related operations that
 * should not be exposed through the normal generic SysBO CRUD API.
 */
export function createInternalRouter(
  users: SysUserService,
  ext: ExternalIdentityService,
  links: UserPrincipalService,
) {
  const router = Router();

  const actor = internalAuditActor();

  /**
   * Verify local credentials.
   *
   * The identity supplied by the caller may be either:
   *
   * - user-name
   * - email address
   *
   * The service performs the actual password verification.
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

          res.json({
            data: publicUser(user),
          });
        },
      ),
  );

  /**
   * Resolve an external authentication identity.
   *
   * Typical providers may include Google, Facebook and future
   * OAuth/OIDC identity providers.
   */
  router.get(
    '/external-identities/resolve',

    async (req, res) => {
      const provider = String(req.query.provider ?? '');

      const subject = String(req.query.subject ?? '');

      const identity = await ext.find(provider, subject);

      res.json({
        data: identity,
      });
    },
  );

  /**
   * Attach an external authentication identity to a SysUser.
   */
  router.post(
    '/SysUsers/:userId/external-identities',

    async (req, res) => {
      const externalIdentity = await ext.add(
        req.params.userId,

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

      res.status(201).json({
        data: externalIdentity,
      });
    },
  );

  /**
   * Set or replace a SysUser local password.
   *
   * This allows an externally registered user to later establish
   * local email/user-name + password authentication as well.
   */
  router.put(
    '/SysUsers/:userId/password',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');
      const user = await users.setPassword(userId, String(req.body.password ?? ''), actor);

      res.json({
        data: publicUser(user),
      });
    },
  );

  /**
   * Mark the SysUser email address as verified.
   */
  router.put(
    '/SysUsers/:userId/email-verified',

    async (req, res) => {
      const userId = String(req.params.userId ?? '');
      const user = await users.setEmailVerified(userId, actor);

      res.json({
        data: publicUser(user),
      });
    },
  );

  /**
   * Associate a website SysUser with a customer SysPrincipal.
   */
  router.post(
    '/SysUsers/:userId/principals',

    async (req, res) => {
      const link = await links.link(
        req.params.userId,

        String(req.body.principalId),

        req.body.relationship as SysUserPrincipalRelationship,

        Boolean(req.body.isDefault),

        actor,
      );

      res.status(201).json({
        data: link,
      });
    },
  );

  return router;
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
 * so that the UI can determine whether local password authentication
 * has been configured without exposing the actual password hash.
 */
function publicUser(user: SysUser) {
  const { passwordHash: _ignored, ...safeUser } = user;

  return {
    ...safeUser,

    hasPassword: Boolean(user.passwordHash),
  };
}
