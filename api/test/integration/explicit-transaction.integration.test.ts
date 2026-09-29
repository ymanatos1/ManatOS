import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { SysBOPrincipalType, type SysBOCreateInput, type SysBOPrincipal } from '@manatos/shared';
import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';

import { bearer, createTestApi, loginAdmin, seedAdmin } from '../support/test-helpers.js';

describe('API explicit transaction lifecycle', () => {
  let context: Awaited<ReturnType<typeof createTestApi>>;
  let token: string;
  let adminId: string;

  beforeEach(async () => {
    context = await createTestApi();
    await seedAdmin(context.services.users);
    token = await loginAdmin(context.app, 'Transaction test');
    adminId = (
      await context.services.users.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })
    ).items[0]!.id;
  });

  it('rolls back a successful JSON PATCH that participated through the transaction header', async () => {
    const begin = await request(context.app)
      .post('/api/v1/transactions')
      .set('Authorization', bearer(token));
    expect(begin.status).toBe(201);
    const transactionId = begin.body.data.transactionId as string;

    const update = await request(context.app)
      .patch(`/api/v1/SysUsers/${adminId}`)
      .set('Authorization', bearer(token))
      .set('x-manatos-transaction-id', transactionId)
      .send({ name: 'Admin Transactional' });
    expect(update.status).toBe(200);
    expect((await context.services.users.get(adminId))?.name).toBe('Admin Transactional');

    const rollback = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));
    expect(rollback.status).toBe(200);
    expect(rollback.body.data.rollbackFailures).toEqual([]);
    expect((await context.services.users.get(adminId))?.name).toBe('Admin');

    const retry = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));
    expect(retry.status).toBe(200);
    expect(retry.body.data.transactionId).toBe(transactionId);
  });

  it('commits idempotently and does not permit rollback after commit', async () => {
    const begin = await request(context.app)
      .post('/api/v1/transactions')
      .set('Authorization', bearer(token));
    const transactionId = begin.body.data.transactionId as string;

    const first = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$commit`)
      .set('Authorization', bearer(token));
    const retry = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$commit`)
      .set('Authorization', bearer(token));
    const wrongTerminal = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toEqual(first.body.data);
    expect(wrongTerminal.status).toBeGreaterThanOrEqual(400);
  });

  it('binds the transaction to the API session that opened it', async () => {
    const otherToken = await loginAdmin(context.app, 'Second transaction session');
    const begin = await request(context.app)
      .post('/api/v1/transactions')
      .set('Authorization', bearer(token));
    const transactionId = begin.body.data.transactionId as string;

    const foreign = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$commit`)
      .set('Authorization', bearer(otherToken));
    expect(foreign.status).toBeGreaterThanOrEqual(400);

    const owner = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));
    expect(owner.status).toBe(200);
  });
});

// Workspace Commit is a separate API router; keep this regression here so it can
// never silently fall outside the same explicit transaction used by normal SysBO routes.
describe('workspace explicit transaction participation', () => {
  it('rolls back a workspace Commit request enlisted through the transaction header', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app, 'Workspace transaction test');
    const admin = (
      await context.services.users.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })
    ).items[0]!;

    const begin = await request(context.app)
      .post('/api/v1/transactions')
      .set('Authorization', bearer(token));
    const transactionId = begin.body.data.transactionId as string;
    const operationId = 'update-admin';
    const commit = await request(context.app)
      .post('/api/v1/workspace/$commit')
      .set('Authorization', bearer(token))
      .set('x-manatos-transaction-id', transactionId)
      .send({
        commitPlan: {
          version: 1,
          operations: [
            {
              operationId,
              entityKey: 'sys-users',
              identity: admin.id,
              identityKind: 'persistent',
              kind: 'update',
              current: { ...admin, name: 'Workspace Transactional' },
              changedFields: ['name'],
            },
          ],
          executionOrder: [operationId],
        },
        resources: {},
      });
    expect(commit.status).toBe(200);
    expect((await context.services.users.get(admin.id))?.name).toBe('Workspace Transactional');

    const rollback = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));
    expect(rollback.status).toBe(200);
    expect((await context.services.users.get(admin.id))?.name).toBe(admin.name);
  });

  it('injects a development workspace failure after persisted mutations and rolls them back normally', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app, 'Workspace fault injection test');
    const admin = (
      await context.services.users.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })
    ).items[0]!;

    const begin = await request(context.app)
      .post('/api/v1/transactions')
      .set('Authorization', bearer(token));
    const transactionId = begin.body.data.transactionId as string;
    const operationId = 'fault-injected-update';
    const commit = await request(context.app)
      .post('/api/v1/workspace/$commit')
      .set('Authorization', bearer(token))
      .set('x-manatos-transaction-id', transactionId)
      .send({
        commitPlan: {
          version: 1,
          operations: [
            {
              operationId,
              entityKey: 'sys-users',
              identity: admin.id,
              identityKind: 'persistent',
              kind: 'update',
              current: { ...admin, name: 'Must Roll Back' },
              changedFields: ['name'],
            },
          ],
          executionOrder: [operationId],
        },
        resources: {},
        debug: { simulateTransactionFailure: true },
      });

    expect(commit.status).toBe(500);
    expect(commit.body.error.code).toBe('DEBUG_TRANSACTION_FAILURE');
    // The workspace mutation really reached persisted adapter state before the
    // injected failure, so rollback—not local pre-write failure—is being tested.
    expect((await context.services.users.get(admin.id))?.name).toBe('Must Roll Back');

    const rollback = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));
    expect(rollback.status).toBe(200);
    expect((await context.services.users.get(admin.id))?.name).toBe(admin.name);
  });

  it('restores a deleted record with its picture when the explicit transaction rolls back', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app, 'Delete picture transaction test');
    const principal = await context.services.principals.create(
      {
        name: 'Transactional picture principal',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        enabled: true,
      } as SysBOCreateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );
    await context.services.principals.writePicture(
      principal.id,
      'photo',
      'image/png',
      Buffer.from('transaction-picture'),
      SYSTEM_AUDIT_ACTOR,
    );

    const begin = await request(context.app)
      .post('/api/v1/transactions')
      .set('Authorization', bearer(token));
    const transactionId = begin.body.data.transactionId as string;
    const deleted = await request(context.app)
      .delete(`/api/v1/SysPrincipals/${principal.id}`)
      .set('Authorization', bearer(token))
      .set('x-manatos-transaction-id', transactionId);
    expect(deleted.status).toBe(200);

    const rollback = await request(context.app)
      .post(`/api/v1/transactions/${transactionId}/$rollback`)
      .set('Authorization', bearer(token));
    expect(rollback.status).toBe(200);
    const restored = await context.services.principals.get(principal.id);
    expect(restored).not.toBeNull();
    const picture = await context.services.principals.readPicture(principal.id, 'photo');
    expect(picture?.bytes.toString()).toBe('transaction-picture');
  });

  it.each([
    [
      'unsupported content type',
      { contentType: 'image/svg+xml', dataBase64: Buffer.from('picture').toString('base64') },
    ],
    ['invalid base64', { contentType: 'image/png', dataBase64: '%%%not-base64%%%' }],
    [
      'oversized payload',
      { contentType: 'image/png', dataBase64: Buffer.alloc(3_000_001, 1).toString('base64') },
    ],
  ])(
    'rejects %s pending workspace picture resources before any write',
    async (_caseName, resource) => {
      const context = await createTestApi();
      await seedAdmin(context.services.users);
      const token = await loginAdmin(context.app, 'Workspace picture validation test');
      const principal = await context.services.principals.create(
        {
          name: 'Picture validation principal',
          principalType: SysBOPrincipalType.Person,
          parentId: null,
          enabled: true,
        } as SysBOCreateInput<SysBOPrincipal>,
        SYSTEM_AUDIT_ACTOR,
      );
      const before = await context.services.principals.get(principal.id);
      const pendingRevision = 'pending:workspace-picture-validation';

      const response = await request(context.app)
        .post('/api/v1/workspace/$commit')
        .set('Authorization', bearer(token))
        .send({
          commitPlan: {
            version: 1,
            operations: [
              {
                operationId: 'update-picture',
                entityKey: 'sys-principals',
                identity: principal.id,
                identityKind: 'persistent',
                kind: 'update',
                current: {
                  ...principal,
                  name: 'MUST NOT BE WRITTEN',
                  photo: {
                    pending: true,
                    revision: pendingRevision,
                    contentType: resource.contentType,
                  },
                },
                changedFields: ['name', 'photo'],
              },
            ],
            executionOrder: ['update-picture'],
          },
          resources: { [`picture:${pendingRevision}`]: resource },
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const after = await context.services.principals.get(principal.id);
      expect(after?.name).toBe(before?.name);
      expect(after?.photo ?? null).toEqual(before?.photo ?? null);
    },
  );

  it('commits a valid pending scalar picture resource through the workspace executor', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app, 'Workspace picture commit test');
    const principal = await context.services.principals.create(
      {
        name: 'Workspace picture principal',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        enabled: true,
      } as SysBOCreateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );
    const pendingRevision = 'pending:workspace-picture-valid';
    const bytes = Buffer.from('valid-workspace-picture');

    const response = await request(context.app)
      .post('/api/v1/workspace/$commit')
      .set('Authorization', bearer(token))
      .send({
        commitPlan: {
          version: 1,
          operations: [
            {
              operationId: 'update-picture',
              entityKey: 'sys-principals',
              identity: principal.id,
              identityKind: 'persistent',
              kind: 'update',
              current: {
                ...principal,
                photo: { pending: true, revision: pendingRevision, contentType: 'image/png' },
              },
              changedFields: ['photo'],
            },
          ],
          executionOrder: ['update-picture'],
        },
        resources: {
          [`picture:${pendingRevision}`]: {
            contentType: 'image/png',
            dataBase64: bytes.toString('base64'),
          },
        },
      });

    expect(response.status).toBe(200);
    const stored = await context.services.principals.readPicture(principal.id, 'photo');
    expect(stored?.picture.contentType).toBe('image/png');
    expect(stored?.bytes.equals(bytes)).toBe(true);
  });

  it('rejects an execution order that runs an operation before its declared dependency', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app, 'Workspace dependency test');
    const admin = (
      await context.services.users.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })
    ).items[0]!;

    const response = await request(context.app)
      .post('/api/v1/workspace/$commit')
      .set('Authorization', bearer(token))
      .send({
        commitPlan: {
          version: 1,
          operations: [
            {
              operationId: 'first',
              entityKey: 'sys-users',
              identity: admin.id,
              identityKind: 'persistent',
              kind: 'update',
              current: { ...admin, name: 'First' },
              changedFields: ['name'],
              dependsOn: ['second'],
            },
            {
              operationId: 'second',
              entityKey: 'sys-users',
              identity: admin.id,
              identityKind: 'persistent',
              kind: 'update',
              current: { ...admin, name: 'Second' },
              changedFields: ['name'],
            },
          ],
          executionOrder: ['first', 'second'],
        },
        resources: {},
      });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await context.services.users.get(admin.id))?.name).toBe(admin.name);
  });
});
