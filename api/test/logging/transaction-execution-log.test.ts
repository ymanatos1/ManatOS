import { beforeEach, describe, expect, it, vi } from 'vitest';

const { info, warn } = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/logging/logger.js', () => ({
  logger: { info, warn, error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

import {
  logTransactionFinalized,
  logTransactionOperationCompleted,
  logTransactionWorkspaceOperationCompleted,
  logTransactionStarted,
} from '../../src/logging/transaction-execution-log.js';

describe('transaction execution logging', () => {
  beforeEach(() => {
    info.mockClear();
    warn.mockClear();
  });

  it('records normal begin and committed lifecycle events with transaction correlation', () => {
    logTransactionStarted('tx-1');
    logTransactionFinalized({
      transactionId: 'tx-1',
      phase: 'commit',
      trigger: 'explicit',
      failures: [],
      history: [
        {
          timestamp: '2026-09-25T00:00:00.000Z',
          phase: 'begin',
          description: 'Transaction opened',
          status: 'completed',
        },
      ],
    });

    expect(info).toHaveBeenNthCalledWith(1, 'Storage transaction started', {
      transactionId: 'tx-1',
      transactionEvent: 'begin',
    });
    expect(info).toHaveBeenNthCalledWith(
      2,
      'Storage transaction committed',
      expect.objectContaining({
        transactionId: 'tx-1',
        transactionEvent: 'committed',
        phase: 'commit',
        finalizationFailureCount: 0,
      }),
    );
  });

  it('records rollback and failed participating operations as warnings', () => {
    logTransactionOperationCompleted(
      'tx-2',
      'PUT',
      '/api/v1/SysApplications/1/$pictures/Pictures',
      500,
      12.5,
    );
    logTransactionFinalized({
      transactionId: 'tx-2',
      phase: 'rollback',
      trigger: 'explicit',
      failures: [{ description: 'Delete new picture', message: 'disk busy' }],
      history: [],
    });

    expect(warn).toHaveBeenNthCalledWith(
      1,
      'Storage transaction operation failed',
      expect.objectContaining({ transactionId: 'tx-2', statusCode: 500 }),
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      'Storage transaction rolled back',
      expect.objectContaining({
        transactionId: 'tx-2',
        transactionEvent: 'rolled-back',
        finalizationFailureCount: 1,
      }),
    );
  });

  it('records an expired transaction once as the canonical terminal execution outcome', () => {
    logTransactionFinalized({
      transactionId: 'tx-expired',
      phase: 'rollback',
      trigger: 'expiry',
      failures: [],
      history: [],
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Storage transaction expired and was rolled back',
      expect.objectContaining({
        transactionId: 'tx-expired',
        transactionEvent: 'expired-rolled-back',
        trigger: 'expiry',
      }),
    );
  });
  it('records structured workspace operation detail without binary payloads', () => {
    logTransactionWorkspaceOperationCompleted('tx-workspace', {
      operationId: 'op-1',
      kind: 'update',
      entityKey: 'sys-principals',
      entityLabel: 'Principal',
      identity: 'principal-1',
      description: 'Nick Galis',
      durationMs: 4.2,
      changes: [{ field: 'description', label: 'Description', before: 'old', after: 'new' }],
      pictures: [
        {
          field: 'photo',
          label: 'Photo',
          action: 'add',
          before: null,
          after: { pending: true, contentType: 'image/jpeg', size: 1200 },
        },
      ],
      collections: [],
    });

    expect(info).toHaveBeenCalledWith(
      'Storage transaction workspace operation completed',
      expect.objectContaining({
        transactionId: 'tx-workspace',
        transactionEvent: 'workspace-operation-completed',
        operationId: 'op-1',
        kind: 'update',
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('dataBase64');
  });
});
