import type { TransactionFinalizationResult } from '../storage/transactions-support.js';
import { logger } from './logger.js';

/**
 * Structured transaction lifecycle diagnostics written through the normal API
 * logging pipeline. These records are deliberately not part of API responses:
 * they are server diagnostics that can later be correlated by transactionId in
 * API Traffic without making logging part of transaction correctness.
 */
export function logTransactionStarted(transactionId: string): void {
  logger.info('Storage transaction started', {
    transactionId,
    transactionEvent: 'begin',
  });
}

export function logTransactionOperationStarted(
  transactionId: string,
  method: string,
  path: string,
): void {
  logger.info('Storage transaction operation started', {
    transactionId,
    transactionEvent: 'operation-started',
    method,
    path,
  });
}

export function logTransactionOperationCompleted(
  transactionId: string,
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  const fields = {
    transactionId,
    transactionEvent: 'operation-completed',
    method,
    path,
    statusCode,
    durationMs,
  };
  if (statusCode >= 400) logger.warn('Storage transaction operation failed', fields);
  else logger.info('Storage transaction operation completed', fields);
}

export type TransactionSemanticChange = {
  field: string;
  label: string;
  before?: unknown;
  after?: unknown;
};

export type TransactionPictureChange = {
  field: string;
  label: string;
  action: 'add' | 'replace' | 'clear' | 'replace-collection';
  before?: unknown;
  after?: unknown;
};

export function logTransactionWorkspaceOperationCompleted(
  transactionId: string,
  operation: {
    operationId: string;
    kind: 'create' | 'update' | 'delete';
    entityKey: string;
    entityLabel: string;
    identity: string;
    description?: string;
    durationMs: number;
    changes: TransactionSemanticChange[];
    pictures: TransactionPictureChange[];
    collections: Array<{ key: string; itemCount: number }>;
  },
): void {
  logger.info('Storage transaction workspace operation completed', {
    transactionId,
    transactionEvent: 'workspace-operation-completed',
    ...operation,
  });
}

export function logTransactionFaultInjected(transactionId: string, location: string): void {
  logger.warn('Development transaction fault injected', {
    transactionId,
    transactionEvent: 'fault-injected',
    code: 'DEBUG_TRANSACTION_FAILURE',
    location,
  });
}

export function logTransactionFinalized(result: TransactionFinalizationResult): void {
  const expired = result.trigger === 'expiry';
  const transactionEvent = expired
    ? 'expired-rolled-back'
    : result.phase === 'commit'
      ? 'committed'
      : 'rolled-back';
  const fields = {
    transactionId: result.transactionId,
    transactionEvent,
    phase: result.phase,
    trigger: result.trigger,
    finalizationFailureCount: result.failures.length,
    failures: result.failures,
    history: result.history,
  };

  if (expired) {
    logger.warn('Storage transaction expired and was rolled back', fields);
    return;
  }
  if (result.phase === 'rollback' || result.failures.length) {
    logger.warn(
      result.phase === 'rollback'
        ? 'Storage transaction rolled back'
        : 'Storage transaction committed with cleanup failures',
      fields,
    );
    return;
  }
  logger.info('Storage transaction committed', fields);
}
