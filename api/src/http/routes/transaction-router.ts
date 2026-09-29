import { Router, type Request } from 'express';

import { AppError } from '@manatos/shared';

import type { StorageAdapter } from '../../storage/storage-adapter.js';
import { logTransactionFinalizationFailures } from '../../logging/transaction-failure-log.js';
import { logTransactionStarted } from '../../logging/transaction-execution-log.js';
import { sendCommand } from '../response.js';

export function createTransactionRouter(
  store: Pick<StorageAdapter, 'beginTransaction' | 'commitTransaction' | 'rollbackTransaction'>,
): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const transactionId = await store.beginTransaction(owner(req));
    logTransactionStarted(transactionId);
    sendCommand(res, 'Transaction started.', { transactionId }, 201);
  });

  router.post('/:id/$commit', async (req, res) => {
    const result = await store.commitTransaction(String(req.params.id ?? ''), owner(req));
    logTransactionFinalizationFailures('commit', result);
    sendCommand(res, 'Transaction committed.', {
      transactionId: result.transactionId,
      cleanupFailures: result.failures,
    });
  });

  router.post('/:id/$rollback', async (req, res) => {
    const result = await store.rollbackTransaction(String(req.params.id ?? ''), owner(req));
    logTransactionFinalizationFailures('rollback', result);
    sendCommand(res, 'Transaction rolled back.', {
      transactionId: result.transactionId,
      rollbackFailures: result.failures,
    });
  });

  return router;
}

function owner(req: Request): string {
  if (!req.auth?.tokenId) {
    throw new AppError(
      'AUTHENTICATION_REQUIRED',
      'Transaction request has no API session.',
      'Authentication is required.',
    );
  }
  return req.auth.tokenId;
}
