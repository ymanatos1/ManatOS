import { Router } from 'express';
import { AuthenticationError } from '@manatos/shared';

import type { AuthorizationService } from '../auth/authorization-service.js';
import { sendQuery } from './api-response.js';

/**
 * Safe capability projection for platform-level UI decisions.
 *
 * The caller receives only resolved booleans. License rows, principal links,
 * role bypass rules and other authorization-policy inputs remain API-private.
 */
export function createPlatformCapabilityRouter(authorization: AuthorizationService): Router {
  const router = Router();

  router.get('/:platformId/$capabilities', async (req, res) => {
    if (!req.auth) {
      throw new AuthenticationError();
    }

    const platformId = String(req.params.platformId ?? '').trim();
    const capabilities = await authorization.platformCapabilities(req.auth, platformId);

    sendQuery(res, {
      platformId,
      capabilities,
    });
  });

  return router;
}
