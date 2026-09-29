import type { RequestHandler } from 'express';

import { AuthenticationError } from '@manatos/shared';

import {
  logTransactionOperationCompleted,
  logTransactionOperationStarted,
} from '../../logging/transaction-execution-log.js';

type ExplicitTransactionParticipant = {
  acquireExplicitTransactionOperation(transactionId: string, ownerId: string): void;
  releaseExplicitTransactionOperation(transactionId: string, ownerId: string): void;
  runInExplicitTransaction<R>(transactionId: string, ownerId: string, operation: () => R): R;
};

/**
 * Enlist an authenticated API request in an already-open explicit storage
 * transaction when the internal transaction header is present.
 *
 * The lease prevents idle expiry while the request is active.  The execution
 * context makes nested storage/service operations join the named transaction.
 */
export const explicitTransactionMiddleware =
  (participant: ExplicitTransactionParticipant): RequestHandler =>
  (req, res, next) => {
    const transactionId = req.header('x-manatos-transaction-id')?.trim();
    if (!transactionId) {
      next();
      return;
    }

    const ownerId = req.auth?.tokenId;
    if (!ownerId) {
      next(new AuthenticationError());
      return;
    }

    let acquired = false;
    try {
      participant.acquireExplicitTransactionOperation(transactionId, ownerId);
      acquired = true;

      const startedAt = performance.now();
      logTransactionOperationStarted(transactionId, req.method, req.originalUrl);

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        logTransactionOperationCompleted(
          transactionId,
          req.method,
          req.originalUrl,
          res.statusCode,
          Math.round((performance.now() - startedAt) * 100) / 100,
        );
        participant.releaseExplicitTransactionOperation(transactionId, ownerId);
      };

      res.once('finish', release);
      res.once('close', release);
      participant.runInExplicitTransaction(transactionId, ownerId, () => next());
    } catch (error) {
      if (acquired) participant.releaseExplicitTransactionOperation(transactionId, ownerId);
      next(error);
    }
  };
