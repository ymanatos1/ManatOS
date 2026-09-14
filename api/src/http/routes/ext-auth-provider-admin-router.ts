import { Router } from 'express';

import { SysBOUserRole } from '@manatos/shared';

import { requireAuthenticated, requireRole } from '../../auth/auth-middleware.js';
import type { SysBOExtAuthProviderService } from '../../services/sysbo/external-auth-provider-service.js';
import { sendQuery } from '../response.js';

/** Administration/reference endpoints that supplement generic provider CRUD. */
export function createExtAuthProviderAdminRouter(extAuthProviders: SysBOExtAuthProviderService) {
  const router = Router();

  /*
   * Keep the inspection-role middleware scoped to this supplemental endpoint.
   * Applying it router-wide would also intercept the generic SysBO router mounted
   * after this one, preventing normal authenticated roles from reaching its own
   * canonical authorization/capability projection.
   */
  router.get(
    '/definitions',
    requireAuthenticated,
    requireRole(SysBOUserRole.Admin, SysBOUserRole.Superuser),
    (_req, res) => {
      res.set('Cache-Control', 'no-store');
      sendQuery(res, { providers: extAuthProviders.providerDefinitions() });
    },
  );

  return router;
}
