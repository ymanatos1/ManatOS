import { Router } from 'express';

import { requireAdmin, requireAuthenticated } from '../auth/auth-middleware.js';
import type { SysBOExtAuthProviderService } from '../services/sys-ext-auth-provider-service.js';
import { sendQuery } from './api-response.js';

/** Administration/reference endpoints that supplement generic provider CRUD. */
export function createExtAuthProviderAdminRouter(extAuthProviders: SysBOExtAuthProviderService) {
  const router = Router();

  /*
   * Keep Admin middleware scoped to this supplemental endpoint. Applying it
   * router-wide would also intercept the generic SysBO router mounted after
   * this one, preventing authenticated non-Admins from querying the generic
   * $capabilities projection (which correctly returns false capabilities).
   */
  router.get('/definitions', requireAuthenticated, requireAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, { providers: extAuthProviders.providerDefinitions() });
  });

  return router;
}
