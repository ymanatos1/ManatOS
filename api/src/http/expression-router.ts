import { Router } from 'express';
import {
  ExpressionEvaluationError,
  ValidationAppError,
  expressionFunctions,
} from '@manatos/shared';

import { AuthorizationService } from '../auth/authorization-service.js';
import { DataStoreEntityResolver } from '../services/entity-resolver.js';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import { requireAuthenticated } from '../auth/auth-middleware.js';
import { sendQuery } from './api-response.js';

/**
 * API-owned expression capabilities. The browser remains owner of the complete
 * expression and delegates only capability-backed function calls it cannot
 * evaluate locally (currently EntityResolver functions such as TraverseEntity).
 */
export function createExpressionRouter(
  store: InMemoryDataStore,
  authorization: AuthorizationService,
) {
  const router = Router();

  router.post('/evaluate-function', requireAuthenticated, async (req, res) => {
    const functionName = String(req.body?.functionName ?? '');
    const definition = expressionFunctions[functionName];
    if (!definition) throw new ValidationAppError(`Unknown expression function ${functionName}.`);
    if (definition.capability !== 'entityResolver' || !definition.evaluateAsync) {
      throw new ValidationAppError(
        `${functionName} is not a remotely delegated EntityResolver function.`,
      );
    }

    const args = Array.isArray(req.body?.args) ? req.body.args : [];
    const subject = req.auth!;
    const entityResolver = new DataStoreEntityResolver(store, authorization, subject);

    try {
      const value = await definition.evaluateAsync(args, {
        now: () => new Date(),
        owner: 'api-capability-provider',
        entityResolver,
      });
      res.set('Cache-Control', 'no-store');
      sendQuery(res, { value });
    } catch (error) {
      if (error instanceof ExpressionEvaluationError) throw new ValidationAppError(error.message);
      throw error;
    }
  });

  return router;
}
