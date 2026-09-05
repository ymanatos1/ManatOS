import { Router } from 'express';
import type { SysBOUserPrincipalRelationship } from '@manatos/shared';

import { internalAuditActor } from '../../audit/audit-service.js';
import type { UserPrincipalService } from '../../services/index.js';
import { sendCommand } from '../api-response.js';

/** Trusted SysBOUser <-> SysBOPrincipal association commands. */
export function createInternalUserPrincipalRouter(links: UserPrincipalService) {
  const router = Router();
  const actor = internalAuditActor();

  router.post('/SysUsers/:userId/principals', async (req, res) => {
    const userId = String(req.params.userId ?? '');
    const principalId = String(req.body.principalId ?? '');
    const relationship = req.body.relationship as SysBOUserPrincipalRelationship;
    const isDefault = Boolean(req.body.isDefault);

    const link = await links.link(userId, principalId, relationship, isDefault, actor);
    sendCommand(res, `User ${userId} linked to principal ${principalId} successfully.`, link, 201);
  });

  return router;
}
