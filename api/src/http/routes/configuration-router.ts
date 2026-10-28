import { Router } from 'express';

import { SysBOUserRole, ValidationAppError } from '@manatos/shared';

import { requireAdmin, requireAuthenticated, requireRole } from '../../auth/auth-middleware.js';
import { authenticatedAuditActor } from '../../audit/audit-service.js';
import type { SysBOConfigurationService } from '../../services/sysbo/configuration-service.js';
import { readImageVariant } from '../../services/sysbo/image-variants.js';
import { sendCommand, sendQuery } from '../response.js';

/** Application configuration: Superuser inspection; Admin mutation. */
export function createConfigurationRouter(configurations: SysBOConfigurationService) {
  const router = Router();

  router.use(requireAuthenticated);

  router.get('/', requireRole(SysBOUserRole.Admin, SysBOUserRole.Superuser), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const variant = readImageVariant(req.query.variant);
    if (req.query.variant !== undefined && variant === null)
      throw new ValidationAppError('Invalid image variant.', 'Use none, thumbnail or original.');
    // Configurations deliberately use a specialized, role-redacted collection
    // response. They contain no canonical reference or picture fields.
    sendQuery(res, {
      items: await configurations.safeList(),
      ...(req.query.includeReferences === 'true' ? { references: {} } : {}),
      ...(variant !== null ? { imageVariants: {} } : {}),
    });
  });

  router.patch('/:id/value', requireAdmin, async (req, res) => {
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
