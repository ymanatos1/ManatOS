import { Router } from 'express';

import { config } from '../config.js';
import { clearApiTrafficEntries, listApiTrafficEntries } from '../debug/api-traffic-store.js';
import { requireCsrf } from '../middleware/csrf.js';

/**
 * UI-server developer diagnostics that must not require the normal rendered-page
 * context. In particular, polling the API Traffic Viewer must never hydrate the
 * current SysUser, licenses, CTX page state, or any other business data merely
 * to inspect traffic; otherwise the observer itself creates the traffic it is
 * trying to observe.
 */
export function createDebugRoutes(): Router {
  const router = Router();

  router.get('/api-traffic', (_req, res) => {
    if (config.NODE_ENV === 'production') { res.sendStatus(404); return; }
    const afterId = typeof _req.query.after === 'string' ? _req.query.after : undefined;
    res.set('Cache-Control', 'no-store');
    res.json({ entries: listApiTrafficEntries(afterId) });
  });

  router.post('/api-traffic/clear', requireCsrf, (_req, res) => {
    if (config.NODE_ENV === 'production') { res.sendStatus(404); return; }
    clearApiTrafficEntries();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
  });

  return router;
}
