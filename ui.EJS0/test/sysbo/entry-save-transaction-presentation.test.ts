import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/sysbo/entry/write.ts'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'src/api/client.ts'), 'utf8');

describe('metadata-driven Entry Save transaction transport', () => {
  it('opens an explicit transaction whenever scalar or collection picture resources participate', () => {
    expect(source).toContain('if (hasPictureResourceChanges(req, definition))');
    expect(source).toContain("'/api/v1/transactions'");
    expect(source).toContain('transactionOptions(req, transactionId)');
  });

  it('keeps the transaction id on the server-side UI -> API transport header', () => {
    expect(client).toContain("'x-manatos-transaction-id': options.transactionId");
  });

  it('retries terminal commit/rollback calls to resolve a lost finalization response', () => {
    expect(source).toContain("phase: 'commit' | 'rollback'");
    expect(source).toContain('Finalization is idempotent for a short terminal-retention window');
    expect(source).toContain('TRANSACTION_COMMIT_UNCERTAIN');
  });

  it('does not issue rollback from the commit-failure path', () => {
    const commitBoundary = source.indexOf(
      '// COMMIT is deliberately outside the business-operation catch above.',
    );
    expect(commitBoundary).toBeGreaterThan(0);
    const afterBoundary = source.slice(commitBoundary);
    expect(afterBoundary).toContain("'commit'");
    expect(afterBoundary.slice(0, afterBoundary.indexOf('const savedId ='))).not.toContain(
      "'rollback'",
    );
  });

  it('adds rollback compensation failures to the original AppError operation trace', () => {
    expect(source).toContain('TRANSACTION_ROLLBACK_INCOMPLETE');
    expect(source).toContain(
      'error.operationTrace = [...(error.operationTrace ?? []), rollbackNode]',
    );
  });
});
