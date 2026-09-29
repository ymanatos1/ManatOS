import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  apiLogLineMatchesRequest,
  apiLogLineMatchesTransaction,
  apiTrafficRepositoryRoot,
  projectTransactionDiagnostic,
} from '../../src/debug/api-traffic-log-reader.js';

describe('API Traffic local log reader', () => {
  it('anchors shared diagnostics to the repository layout instead of process cwd', () => {
    const root = resolve('/manatos-test-root');
    const sourceModule = pathToFileURL(
      resolve(root, 'ui.EJS0/src/debug/api-traffic-log-reader.ts'),
    ).href;
    const compiledModule = pathToFileURL(
      resolve(root, 'ui.EJS0/dist/debug/api-traffic-log-reader.js'),
    ).href;

    expect(apiTrafficRepositoryRoot(sourceModule)).toBe(root);
    expect(apiTrafficRepositoryRoot(compiledModule)).toBe(root);
  });

  it('matches structured JSON log lines by exact request id', () => {
    expect(
      apiLogLineMatchesRequest(
        JSON.stringify({ requestId: 'call-123', message: 'storage ready' }),
        'call-123',
      ),
    ).toBe(true);
    expect(
      apiLogLineMatchesRequest(
        JSON.stringify({ requestId: 'call-1234', message: 'different call' }),
        'call-123',
      ),
    ).toBe(false);
  });

  it('matches structured transaction diagnostics independently of request id', () => {
    expect(
      apiLogLineMatchesTransaction(
        JSON.stringify({
          requestId: 'call-2',
          transactionId: 'tx-123',
          transactionEvent: 'committed',
        }),
        'tx-123',
      ),
    ).toBe(true);
    expect(
      apiLogLineMatchesTransaction(
        JSON.stringify({ requestId: 'call-2', transactionId: 'tx-1234' }),
        'tx-123',
      ),
    ).toBe(false);
  });

  it('supports the existing pretty console request-id prefix as a fallback', () => {
    expect(
      apiLogLineMatchesRequest(
        '[2026-09-14T00:00:00.000Z] [INFO] [call-123] request complete',
        'call-123',
      ),
    ).toBe(true);
  });
  it('projects transaction events into one compact lifecycle diagnostic', () => {
    const lines = [
      JSON.stringify({
        timestamp: '2026-09-25T10:00:00.000Z',
        transactionId: 'tx-1',
        transactionEvent: 'begin',
      }),
      JSON.stringify({
        timestamp: '2026-09-25T10:00:01.000Z',
        transactionId: 'tx-1',
        transactionEvent: 'operation-completed',
        method: 'PATCH',
        path: '/api/v1/SysPrincipals/1',
        statusCode: 200,
        durationMs: 12,
      }),
      JSON.stringify({
        timestamp: '2026-09-25T10:00:01.500Z',
        transactionId: 'tx-1',
        transactionEvent: 'workspace-operation-completed',
        operationId: 'op-1',
        kind: 'update',
        entityKey: 'sys-principals',
        entityLabel: 'Principal',
        identity: '1',
        description: 'Nick Galis',
        durationMs: 8,
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
      }),
      JSON.stringify({
        timestamp: '2026-09-25T10:00:02.000Z',
        transactionId: 'tx-1',
        transactionEvent: 'committed',
        phase: 'commit',
        trigger: 'explicit',
        failures: [],
        history: [
          {
            phase: 'commit',
            description: 'Delete superseded picture',
            status: 'completed',
          },
        ],
      }),
    ];
    const diagnostic = projectTransactionDiagnostic('tx-1', lines);
    expect(diagnostic.terminal).toBe(true);
    expect(diagnostic.content).toContain('Transaction-wide trace');
    expect(diagnostic.content).toContain('Outcome: COMMITTED');
    expect(diagnostic.content).toContain('Duration: 2000 ms');
    expect(diagnostic.content).toContain('Requests');
    expect(diagnostic.content).toContain('1. PATCH /api/v1/SysPrincipals/1    OK');
    expect(diagnostic.content).toContain('Operations');
    expect(diagnostic.content).toContain('1. UPDATE Principal — Nick Galis    OK');
    expect(diagnostic.content).toContain('JSON · Description: "old" → "new"');
    expect(diagnostic.content).toContain('Picture · Photo: ∅ →');
    expect(diagnostic.content).toContain('Finalization');
    expect(diagnostic.content).toContain('Delete superseded picture    OK');
    expect(diagnostic.content).not.toContain('transactionEvent');
  });

  it('surfaces an injected development fault in the transaction diagnostic', () => {
    const diagnostic = projectTransactionDiagnostic('tx-fault', [
      JSON.stringify({
        timestamp: '2026-09-25T10:00:00.000Z',
        transactionId: 'tx-fault',
        transactionEvent: 'begin',
      }),
      JSON.stringify({
        timestamp: '2026-09-25T10:00:00.500Z',
        transactionId: 'tx-fault',
        transactionEvent: 'fault-injected',
        code: 'DEBUG_TRANSACTION_FAILURE',
        location: 'after-workspace-storage-mutations',
      }),
      JSON.stringify({
        timestamp: '2026-09-25T10:00:01.000Z',
        transactionId: 'tx-fault',
        transactionEvent: 'rolled-back',
        phase: 'rollback',
        trigger: 'explicit',
        failures: [],
        history: [
          { phase: 'rollback', description: 'Restore datastore snapshot', status: 'completed' },
        ],
      }),
    ]);
    expect(diagnostic.content).toContain('Injected fault: DEBUG_TRANSACTION_FAILURE');
    expect(diagnostic.content).toContain('Location: after-workspace-storage-mutations');
    expect(diagnostic.content).toContain('Rollback');
    expect(diagnostic.content).toContain('Restore datastore snapshot    OK');
  });

  it('keeps an incomplete transaction diagnostic non-terminal', () => {
    const diagnostic = projectTransactionDiagnostic('tx-2', [
      JSON.stringify({
        timestamp: '2026-09-25T10:00:00.000Z',
        transactionId: 'tx-2',
        transactionEvent: 'begin',
      }),
    ]);
    expect(diagnostic.terminal).toBe(false);
    expect(diagnostic.content).toContain('Outcome: IN PROGRESS');
    expect(diagnostic.content).toContain('Duration: In progress');
  });
});
