import { Router } from 'express';

import { requireAdmin, requireAuthenticated } from '../auth/auth-middleware.js';
import { authenticatedAuditActor } from '../audit/audit-service.js';
import type { SysBOConfigurationService } from '../services/sys-configuration-service.js';
import { sendCommand, sendQuery } from './api-response.js';

/** Admin-only application configuration HTTP surface. */
export function createConfigurationRouter(configurations: SysBOConfigurationService) {
  const router = Router();

  router.use(requireAuthenticated, requireAdmin);

  router.get('/', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, { items: await configurations.safeList() });
  });

  router.patch('/:id/value', async (req, res) => {
    const subject = req.auth!;
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const item = await configurations.setValue(
      String(req.params.id ?? ''),
      req.body?.value == null ? null : String(req.body.value),
      actor,
    );
    sendCommand(res, 'Configuration updated successfully.', { item });
  });

  return router;
}
