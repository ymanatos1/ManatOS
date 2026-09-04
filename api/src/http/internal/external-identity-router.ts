import { Router } from 'express';

import { internalAuditActor } from '../../audit/audit-service.js';
import type { ExternalIdentityService } from '../../services/index.js';
import { sendCommand, sendQuery } from '../api-response.js';

/** Trusted external-identity resolution and SysBOUser linkage operations. */
export function createInternalExternalIdentityRouter(ext: ExternalIdentityService) {
  const router = Router();
  const actor = internalAuditActor();

  router.get('/external-identities/resolve', async (req, res) => {
    const identity = await ext.find(
      String(req.query.provider ?? ''),
      String(req.query.subject ?? ''),
    );
    sendQuery(res, identity);
  });

  router.get('/SysUsers/:userId/external-identities', async (req, res) => {
    const identities = await ext.listForUser(String(req.params.userId ?? ''));
    sendQuery(res, identities);
  });

  router.post('/SysUsers/:userId/external-identities', async (req, res) => {
    const userId = String(req.params.userId ?? '');
    const externalIdentity = await ext.add(
      userId,
      {
        provider: String(req.body.provider),
        providerSubject: String(req.body.providerSubject),
        ...(req.body.email ? { email: String(req.body.email) } : {}),
        ...(req.body.emailVerified !== undefined
          ? { emailVerified: Boolean(req.body.emailVerified) }
          : {}),
        ...(req.body.displayName ? { displayName: String(req.body.displayName) } : {}),
      },
      actor,
    );

    sendCommand(res, 'External identity linked successfully.', externalIdentity, 201);
  });

  return router;
}
