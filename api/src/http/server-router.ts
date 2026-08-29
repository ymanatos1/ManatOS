import { Router } from 'express';

import { operationContext } from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

import { requireAdmin, requireAuthenticated } from '../auth/auth-middleware.js';

import { HealthService } from '../health/health-service.js';

import { sendCommand, sendFailure, sendQuery } from './api-response.js';

/**
 * Server-level operational endpoints.
 *
 * These endpoints are deliberately outside /api/v1 because they
 * describe or manage the running API service itself rather than
 * versioned application business resources.
 */
export function createServerRouter(store: InMemoryDataStore): Router {
  const router = Router();

  const healthService = new HealthService(store);

  /**
   * Liveness check.
   *
   * If this handler executes, the Node/Express process itself is alive.
   *
   * Dependency state can be reported as diagnostic information but does
   * not necessarily make the process itself unhealthy.
   */
  router.get(
    '/health',

    async (_req, res) => {
      const health = await healthService.checkHealth();

      sendQuery(res, health);
    },
  );

  /**
   * Readiness check.
   *
   * A process may be alive but temporarily unable to accept normal work.
   *
   * Readiness therefore checks required dependencies. For now this is
   * primarily the active datastore; additional dependencies such as
   * Redis, mail or external services can be added later.
   */
  router.get(
    '/ready',

    async (_req, res) => {
      const readiness = await healthService.checkReadiness();

      if (readiness.status !== 'ok') {
        sendFailure(
          res,
          503,
          'SERVER_NOT_READY',
          'Server is not ready to accept requests.',
          true,
          readiness,
        );

        return;
      }

      sendQuery(res, readiness);
    },
  );

  /**
   * Explicitly flush the active datastore.
   *
   * Security:
   *
   *   authenticated SysBOUser
   *   AND
   *   Admin role
   */
  router.post(
    '/flush-db',

    requireAuthenticated,
    requireAdmin,

    async (req, res) => {
      await operationContext.runRoot(
        'Flush database',

        async (scope) => {
          scope.addContext({
            userId: req.auth!.userId,

            userName: req.auth!.userName,
          });

          const result = await store.flush();

          sendCommand(res, 'Database flushed successfully.', result);
        },
      );
    },
  );

  return router;
}
