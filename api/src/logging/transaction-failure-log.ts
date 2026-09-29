import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { TransactionFinalizationResult } from '../storage/transactions-support.js';
import { logger } from './logger.js';

const failureLogPath = resolve(process.cwd(), '../data/logs/transaction-failures.log');

export function logTransactionFinalizationFailures(
  phase: 'commit' | 'rollback',
  result: TransactionFinalizationResult,
): void {
  if (!result.failures.length) return;

  const entry = {
    timestamp: new Date().toISOString(),
    transactionId: result.transactionId,
    phase,
    failures: result.failures,
    history: result.history,
  };

  try {
    mkdirSync(dirname(failureLogPath), { recursive: true });
    appendFileSync(failureLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    logger.error('Unable to persist transaction finalization failure log', {
      transactionId: result.transactionId,
      phase,
      error,
    });
  }

  logger.error('Transaction finalization completed with maintenance failures', {
    transactionId: result.transactionId,
    phase,
    failureCount: result.failures.length,
    transactionFailureLog: failureLogPath,
  });
}

export function logExpiredTransaction(result: TransactionFinalizationResult): void {
  // The canonical execution log records the expiry outcome. This maintenance
  // channel is only for compensation failures requiring follow-up.
  logTransactionFinalizationFailures('rollback', result);
}
