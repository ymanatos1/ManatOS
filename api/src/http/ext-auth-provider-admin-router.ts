import { Router } from 'express';

import { requireAdmin, requireAuthenticated } from '../auth/auth-middleware.js';
import type { SysBOExtAuthProviderService } from '../services/sys-ext-auth-provider-service.js';
import { sendQuery } from './api-response.js';

/** Administration/reference endpoints that supplement generic provider CRUD. */
export function createExtAuthProviderAdminRouter(extAuthProviders: SysBOExtAuthProviderService) {
  const router = Router();

  router.use(requireAuthenticated, requireAdmin);

  router.get('/definitions', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, { providers: extAuthProviders.providerDefinitions() });
  });

  return router;
}
