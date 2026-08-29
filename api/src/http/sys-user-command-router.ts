import { Router } from 'express';

import { AppError, NotFoundError, operationContext, type SysBOUser } from '@manatos/shared';

import { authenticatedAuditActor } from '../audit/audit-service.js';
import { requireAdmin } from '../auth/auth-middleware.js';
import { config } from '../config.js';
import type { SysBOUserService } from '../services/sys-user-service.js';

import { sendCommand } from './api-response.js';

/**
 * Explicit SysBOUser commands which should not be expressed as generic CRUD.
 *
 * Email verification is a security state transition, not a normal editable
 * property. Keeping it here gives us:
 *
 * - an explicit authorization boundary;
 * - proper audit attribution to the Admin who performed the action;
 * - a runtime feature switch;
 * - a stable place for future account-management commands.
 *
 * The parent /api/v1/SysUsers mount already requires authentication.
 */
export function createSysBOUserCommandRouter(users: SysBOUserService): Router {
  const router = Router();

  /**
   * Mark another SysBOUser's email address as verified.
   *
   * Security:
   *
   *   authenticated API session
   *   + Admin role
   *   + ADMIN_EMAIL_VERIFICATION_ENABLED=true
   *
   * The operation is intentionally idempotent. Re-verifying an already
   * verified user succeeds without creating an unnecessary update.
   */
  router.post(
    '/:id/verify-email',

    requireAdmin,

    async (req, res) => {
      await operationContext.runRoot(
        'Admin verify SysBOUser email',

        async (scope) => {
          const userId = String(req.params.id ?? '');

          scope.addContext({
            userId,
            requestedBy: req.auth!.userName,
          });

          if (!config.ADMIN_EMAIL_VERIFICATION_ENABLED) {
            throw new AppError(
              'ADMIN_EMAIL_VERIFICATION_DISABLED',
              'Administrator email verification is disabled by configuration.',
              'Administrator email verification is disabled.',
              false,
            );
          }

          const existing = await users.get(userId);

          if (!existing) {
            throw new NotFoundError('SysBOUser', userId);
          }

          if (existing.emailVerified) {
            sendCommand(
              res,
              `Email for user '${existing.name}' is already verified.`,
              publicUser(existing),
            );

            return;
          }

          const actor = authenticatedAuditActor(req.auth!.userId, req.auth!.userName);

          const updated = await users.setEmailVerified(userId, actor);

          sendCommand(
            res,
            `Email for user '${updated.name}' verified successfully.`,
            publicUser(updated),
          );
        },
      );
    },
  );

  return router;
}

/**
 * API-safe SysBOUser representation.
 */
function publicUser(user: SysBOUser) {
  const { passwordHash, ...safe } = user;

  return {
    ...safe,
    hasPassword: Boolean(passwordHash),
  };
}
