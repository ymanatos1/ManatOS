import { Router, type Request } from 'express';
import {
  ForbiddenAppError,
  NotFoundError,
  SysBOUserRole,
  operationContext,
} from '@manatos/shared';

import { internalAuditActor } from '../../audit/audit-service.js';
import { accessTokenStore, type SessionClientInfo } from '../../auth/access-token-store.js';
import { config } from '../../config.js';
import type { SysBOUserService } from '../../services/sys-user-service.js';
import { sendCommand, sendQuery } from '../api-response.js';
import { parseEmailVerificationSource, publicUser } from './shared.js';

/** Trusted authentication/session bridge used before a normal Bearer session exists. */
export function createInternalAuthRouter(users: SysBOUserService) {
  const router = Router();
  const actor = internalAuditActor();

  router.post('/verify-local', async (req, res) =>
    operationContext.runRoot('Sign in with email/user-name and password', async (scope) => {
      scope.addContext({
        identity: req.body?.identity,
        password: req.body?.password,
      });

      const user = await users.verifyLocalCredentials(
        String(req.body?.identity ?? ''),
        String(req.body?.password ?? ''),
      );

      sendCommand(res, 'Credentials verified successfully.', publicUser(user));
    }),
  );

  router.get('/lookup', async (req, res) => {
    const user = await users.lookupByIdentity(String(req.query.identity ?? ''));
    sendQuery(res, user ? publicUser(user) : null);
  });

  router.post('/register-external', async (req, res) => {
    await operationContext.runRoot('Register external-provider SysBOUser', async (scope) => {
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
          role: SysBOUserRole.Guest,
          emailVerified,
          ...(emailVerificationSource ? { emailVerificationSource } : {}),
          enabled: true,
          ...(req.body?.password ? { password: String(req.body.password) } : {}),
          ...(req.body?.firstName ? { firstName: String(req.body.firstName) } : {}),
          ...(req.body?.lastName ? { lastName: String(req.body.lastName) } : {}),
          ...(req.body?.description ? { description: String(req.body.description) } : {}),
        },
        actor,
      );

      sendCommand(
        res,
        `External-provider user '${user.name}' registered successfully.`,
        publicUser(user),
        201,
      );
    });
  });

  router.post('/session', async (req, res) => {
    await operationContext.runRoot('Create trusted UI API session', async (scope) => {
      const userId = String(req.body?.userId ?? '');
      scope.addContext({ userId, clientName: req.body?.clientName });

      const user = await users.get(userId);
      if (!user) throw new NotFoundError('SysBOUser', userId);
      if (!user.enabled) {
        throw new ForbiddenAppError('Disabled SysBOUser cannot receive an API session.');
      }
      if (!user.emailVerified) {
        throw new ForbiddenAppError('Email verification is required before API session creation.');
      }

      const token = accessTokenStore.create(
        user,
        config.API_ACCESS_TOKEN_MINUTES,
        trustedSessionClientInfo(req),
      );

      sendCommand(res, `API session created successfully for user ${user.name}.`, {
        accessToken: token.token,
        tokenType: 'Bearer',
        sessionId: token.tokenId,
        expiresInSeconds: config.API_ACCESS_TOKEN_MINUTES * 60,
        expiresAt: new Date(token.expiresAt).toISOString(),
        user: publicUser(user),
      });
    });
  });

  return router;
}

function trustedSessionClientInfo(req: Request): SessionClientInfo {
  const clientName = req.body?.clientName ? String(req.body.clientName).trim() : undefined;
  const userAgent = req.body?.userAgent ? String(req.body.userAgent).trim() : undefined;
  const ipAddress = req.body?.ipAddress ? String(req.body.ipAddress).trim() : undefined;

  return {
    ...(clientName ? { clientName } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(ipAddress ? { ipAddress } : {}),
  };
}
