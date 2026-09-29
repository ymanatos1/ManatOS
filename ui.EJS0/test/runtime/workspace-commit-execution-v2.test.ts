import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('workspace CommitPlan execution boundary', () => {
  it('sends the exact reviewed plan to one API transaction executor', () => {
    const hierarchyWrite = read('ui.EJS0/src/routes/sysbo/hierarchy/write.ts');
    const apiExecutor = read('api/src/http/routes/workspace-commit-router.ts');
    const apiApp = read('api/src/app.ts');

    expect(hierarchyWrite).toContain("'/api/v1/workspace/$commit'");
    expect(hierarchyWrite).toContain('simulateTransactionFailure');
    expect(hierarchyWrite).toContain('debug: simulateTransactionFailure');
    expect(apiExecutor).toContain('for (const operationId of plan.executionOrder)');
    expect(apiExecutor).toContain('await store.executeTransaction(async () =>');
    expect(apiExecutor).toContain('idMap[`${reference.entityKey}:${reference.identity}`]');
    expect(apiExecutor).toContain('values[reference.key] = resolved');
    expect(apiExecutor).toContain('createExecutors.get(operation.entityKey)');
    expect(apiExecutor).toContain('collectionAdapters.get(operation.entityKey)');
    expect(apiExecutor).toContain('Object.assign(values, collectionAdapter(collections))');
    expect(apiApp).toContain('workspaceCommitCollectionAdapters');
    expect(apiApp).toContain("new Set(['emailAddresses', 'telephoneNumbers', 'addresses'])");
    expect(apiApp).toContain('relatedChanges: Object.fromEntries');
    expect(apiExecutor).not.toContain(
      'SysUser creation requires the credential-aware user command',
    );
  });
});
