import { Router } from 'express';

import { config } from '../../config.js';
import {
  apiTrafficSequence,
  clearApiTrafficEntries,
  listApiTrafficEntries,
  summarizeApiTrafficAfterSequence,
} from '../../debug/api-traffic-store.js';
import { readApiTrafficLogs } from '../../debug/api-traffic-log-reader.js';
import { appendClientRuntimeDiagnostic } from '../../debug/client-runtime-log.js';
import { requireCsrf } from '../../middleware/csrf.js';

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
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    const afterId = typeof _req.query.after === 'string' ? _req.query.after : undefined;
    res.set('Cache-Control', 'no-store');
    res.json({ entries: listApiTrafficEntries(afterId) });
  });

  router.get('/ui-runtime/api-request-sequence', (_req, res) => {
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ sequence: apiTrafficSequence() });
  });

  router.get('/ui-runtime/api-request-summary', (req, res) => {
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    const after = Number.parseInt(String(req.query.after ?? ''), 10);
    if (!Number.isFinite(after) || after < 0) {
      res.status(400).json({ success: false });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json(summarizeApiTrafficAfterSequence(after));
  });

  router.get('/api-traffic/:requestId/logs', async (req, res) => {
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ logs: await readApiTrafficLogs(String(req.params.requestId ?? '')) });
  });

  router.post('/ui-runtime/diagnostic', requireCsrf, (req, res) => {
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    const event = req.body?.event;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      res.status(400).json({ success: false });
      return;
    }
    appendClientRuntimeDiagnostic(event);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
  });

  // Compatibility transport for the entry-opening probe while callers migrate to
  // the generic all-surface diagnostic channel.
  router.post('/ui-runtime/entry-opening-measurement', requireCsrf, (req, res) => {
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    const measurement = req.body?.measurement;
    if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement)) {
      res.status(400).json({ success: false });
      return;
    }
    const event = { type: 'entry-opening-measurement', ...measurement };
    appendClientRuntimeDiagnostic(event);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
  });

  router.post('/api-traffic/clear', requireCsrf, (_req, res) => {
    if (config.NODE_ENV === 'production') {
      res.sendStatus(404);
      return;
    }
    clearApiTrafficEntries();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
  });

  return router;
}
