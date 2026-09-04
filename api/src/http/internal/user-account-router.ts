import { Router } from 'express';

import { internalAuditActor } from '../../audit/audit-service.js';
import type { SysBOUserService } from '../../services/sys-user-service.js';
import { sendCommand } from '../api-response.js';
import { parseEmailVerificationSource, publicUser } from './shared.js';

/** Trusted SysBOUser account mutations used by recovery/setup flows. */
export function createInternalUserAccountRouter(users: SysBOUserService) {
  const router = Router();
  const actor = internalAuditActor();

  router.put('/SysUsers/:userId/password', async (req, res) => {
    const user = await users.setPassword(
      String(req.params.userId ?? ''),
      String(req.body.password ?? ''),
      actor,
    );
    sendCommand(res, `Password set successfully for user '${user.name}'.`, publicUser(user));
  });

  router.put('/SysUsers/:userId/email-verified', async (req, res) => {
    const source = parseEmailVerificationSource(req.body?.source);
    const user = await users.setEmailVerified(String(req.params.userId ?? ''), actor, source);
    sendCommand(
      res,
      `Email verified successfully for user '${user.name}' via ${source}.`,
      publicUser(user),
    );
  });

  return router;
}
