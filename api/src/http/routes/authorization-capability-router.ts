import { Router } from 'express';
import {
  AuthenticationError,
  MANATOS_COMPANY,
  effectiveEntityKeys,
  resolvePlatform,
} from '@manatos/shared';

import type { AuthorizationService } from '../../auth/authorization-service.js';
import { sendQuery } from '../response.js';

/**
 * Safe request-wide collection capability projection for shell/navigation use.
 *
 * Consumers receive resolved capability facts only. Role matrices, organization
 * traversal and entity-specific authorization policy remain inside
 * AuthorizationService. Record-sensitive capabilities still use each entity's
 * normal /:id/$capabilities route.
 */
export function createAuthorizationCapabilityRouter(authorization: AuthorizationService): Router {
  const router = Router();

  router.get('/entities/$capabilities', async (req, res) => {
    if (!req.auth) throw new AuthenticationError();

    const platform = resolvePlatform(MANATOS_COMPANY);
    const entityKeys = [...effectiveEntityKeys(MANATOS_COMPANY, platform)].sort();
    const entities = await authorization.entityCollectionCapabilities(req.auth, entityKeys);

    sendQuery(res, { entities });
  });

  /**
   * One authoritative projection for UI page-context hydration. Keeping platform
   * and entity capabilities in one API operation prevents every rendered UI
   * request from repeating two independent authorization round trips while the
   * API remains the sole owner of authorization policy.
   */
  router.get('/context/:platformId/$capabilities', async (req, res) => {
    if (!req.auth) throw new AuthenticationError();

    const platform = resolvePlatform(MANATOS_COMPANY);
    const platformId = String(req.params.platformId ?? '').trim();
    if (platformId !== platform.id) {
      res.status(404).json({ success: false, error: { message: 'Unknown platform.' } });
      return;
    }

    const entityKeys = [...effectiveEntityKeys(MANATOS_COMPANY, platform)].sort();
    const [platformCapabilities, entities] = await Promise.all([
      authorization.platformCapabilities(req.auth, platformId),
      authorization.entityCollectionCapabilities(req.auth, entityKeys),
    ]);

    sendQuery(res, { platformId, platformCapabilities, entities });
  });

  return router;
}
