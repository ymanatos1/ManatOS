import { Router } from 'express';

import { createMcrmRoutes } from './mcrm/routes.js';

/**
 * Compose platform-owned UI routes behind one generic application boundary.
 * Future platform route modules are registered here without leaking their
 * feature handlers into the generic page or SysBO routers.
 */
export function createPlatformRoutes() {
  const router = Router();
  router.use(createMcrmRoutes());
  return router;
}
