import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { sysApplicationsMetadata } from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';

import { GenericSysBOService } from '../src/services/generic-sysbo-service.js';

import { InMemoryDataStore } from '../src/storage/in-memory-data-store.js';
import { JsonFilePersistence } from '../src/storage/json-file-persistence.js';

/**
 * Contract tests for behavior that future datastore adapters should preserve.
 *
 * These tests deliberately focus on observable storage semantics rather than
 * implementation details of Maps or JSON.
 */
describe('storage contract', () => {
  let databasePath: string;
  let store: InMemoryDataStore;
  let applications: GenericSysBOService<import('@manatos/shared').SysApplication>;

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-storage-test-'));

    databasePath = join(directory, 'database.json');

    store = new InMemoryDataStore(new JsonFilePersistence(databasePath));

    await store.initialize();

    applications = new GenericSysBOService(store, store.sysApplications, sysApplicationsMetadata);
  });

  it('creates GUID-keyed records and server-owned audit fields', async () => {
    const created = await applications.create(applicationInput('Demo', 'demo'), SYSTEM_AUDIT_ACTOR);

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();

    expect(created.createdBy).toBe(SYSTEM_AUDIT_ACTOR.userName);

    expect(created.updatedBy).toBe(SYSTEM_AUDIT_ACTOR.userName);
  });

  it('enforces metadata-defined unique fields case-insensitively', async () => {
    await applications.create(applicationInput('Demo', 'demo'), SYSTEM_AUDIT_ACTOR);

    await expect(
      applications.create(applicationInput('demo', 'another-app-name'), SYSTEM_AUDIT_ACTOR),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_BO_VALUE',
    });

    await expect(
      applications.create(applicationInput('Another Display Name', 'DEMO'), SYSTEM_AUDIT_ACTOR),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_BO_VALUE',
    });

    const result = await applications.list(defaultListQuery());

    expect(result.total).toBe(1);
  });

  it('persists entity IDs only as JSON keys and reconstructs them on load', async () => {
    const created = await applications.create(
      applicationInput('Persistence Demo', 'persistence-demo'),
      SYSTEM_AUDIT_ACTOR,
    );

    /*
     * GenericSysBOService.create() executes inside a datastore transaction.
     * A successful transaction persists the resulting database state.
     */
    const raw = JSON.parse(await readFile(databasePath, 'utf8')) as {
      sysApplications?: Record<string, Record<string, unknown>>;
    };

    /*
     * The entity GUID must exist as the JSON object key.
     */
    expect(raw.sysApplications?.[created.id]).toBeDefined();

    /*
     * The same GUID must NOT also be duplicated inside the persisted entity.
     */
    expect(raw.sysApplications?.[created.id]?.id).toBeUndefined();

    /*
     * Create a completely new datastore instance to prove that loading the
     * JSON reconstructs entity.id from the JSON object's property name.
     */
    const reloadedStore = new InMemoryDataStore(new JsonFilePersistence(databasePath));

    await reloadedStore.initialize();

    const reloaded = await reloadedStore.sysApplications.getById(created.id);

    expect(reloaded).not.toBeNull();

    expect(reloaded?.id).toBe(created.id);

    expect(reloaded?.name).toBe('Persistence Demo');

    expect(reloaded?.appName).toBe('persistence-demo');
  });

  it('supports filtering, ordering and pagination through the repository contract', async () => {
    await applications.create(applicationInput('Accounts', 'accounts'), SYSTEM_AUDIT_ACTOR);

    await applications.create(applicationInput('Billing', 'billing'), SYSTEM_AUDIT_ACTOR);

    await applications.create(
      applicationInput('Accounts Reports', 'accounts-reports'),
      SYSTEM_AUDIT_ACTOR,
    );

    const result = await applications.list({
      page: 1,
      pageSize: 1,

      sort: 'name',
      direction: 'desc',

      filters: {
        name: 'accounts',
      },
    });

    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);

    expect(result.items[0]?.name).toBe('Accounts Reports');
  });

  it('protects technical audit fields during updates', async () => {
    const created = await applications.create(applicationInput('Demo', 'demo'), SYSTEM_AUDIT_ACTOR);

    const originalCreatedAt = created.createdAt;
    const originalCreatedBy = created.createdBy;

    /**
     * Cast deliberately simulates hostile/untyped HTTP JSON.
     *
     * TypeScript normally prevents these technical fields from being passed,
     * but the storage layer must also protect itself at runtime.
     */
    const updated = await applications.update(
      created.id,
      {
        fullName: 'Updated Demo Application',

        createdAt: '2000-01-01T00:00:00.000Z',
        createdBy: 'Attacker',

        updatedAt: '2000-01-01T00:00:00.000Z',
        updatedBy: 'Attacker',
      } as never,
      SYSTEM_AUDIT_ACTOR,
    );

    expect(updated.fullName).toBe('Updated Demo Application');

    expect(updated.createdAt).toBe(originalCreatedAt);

    expect(updated.createdBy).toBe(originalCreatedBy);

    expect(updated.updatedBy).toBe(SYSTEM_AUDIT_ACTOR.userName);

    expect(updated.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('keeps existing service/repository references valid after transaction rollback', async () => {
    const created = await applications.create(
      applicationInput('Survives Rollback', 'survives-rollback'),
      SYSTEM_AUDIT_ACTOR,
    );

    /**
     * Force a transaction failure after mutating the same datastore.
     *
     * Before the fix, executeTransaction() replaced DatabaseState and rebuilt
     * store repositories. `applications` retained its old repository reference
     * and subsequent reads/writes could observe detached state.
     */
    await expect(
      store.executeTransaction(async () => {
        await store.sysApplications.create(
          applicationInput('Rolled Back', 'rolled-back'),
          SYSTEM_AUDIT_ACTOR,
        );

        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    /** The long-lived service must still see the original record. */
    await expect(applications.get(created.id)).resolves.toMatchObject({
      id: created.id,
      name: 'Survives Rollback',
    });

    /** The failed transaction must not leak its temporary record. */
    const afterRollback = await applications.list(defaultListQuery());

    expect(afterRollback.items.some((item) => item.appName === 'rolled-back')).toBe(false);

    /** A subsequent mutation through the pre-existing service must also work. */
    const updated = await applications.update(
      created.id,
      {
        fullName: 'Updated After Rollback',
      },
      SYSTEM_AUDIT_ACTOR,
    );

    expect(updated.fullName).toBe('Updated After Rollback');
  });

  it('flushes current in-memory state to durable JSON persistence', async () => {
    /**
     * Create directly through the repository so this change exists only
     * in memory. GenericSysBOService.create() would automatically persist
     * through executeTransaction(), which would not isolate flush().
     */
    const created = await store.sysApplications.create(
      applicationInput('Flush Demo', 'flush-demo'),
      SYSTEM_AUDIT_ACTOR,
    );

    const secondStore = new InMemoryDataStore(new JsonFilePersistence(databasePath));

    await secondStore.initialize();

    expect(await secondStore.sysApplications.getById(created.id)).toBeNull();

    const flushResult = await store.flush();

    expect(flushResult.flushed).toBe(true);
    expect(flushResult.provider).toBe('InMemory');

    const reloadedStore = new InMemoryDataStore(new JsonFilePersistence(databasePath));

    await reloadedStore.initialize();

    expect(await reloadedStore.sysApplications.getById(created.id)).toMatchObject({
      id: created.id,
      name: 'Flush Demo',
      appName: 'flush-demo',
    });
  });
});

function applicationInput(name: string, appName: string) {
  return {
    name,
    appName,

    fullName: `${name} Application`,

    enabled: true,
  };
}

function defaultListQuery() {
  return {
    page: 1,
    pageSize: 20,

    direction: 'asc' as const,

    filters: {},
  };
}
