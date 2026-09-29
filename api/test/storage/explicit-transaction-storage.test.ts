import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { sysBOApplicationsMetadata } from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';
import { GenericSysBOService } from '../../src/services/sysbo/generic-service.js';
import { InMemoryDataStore } from '../../src/storage/in-memory-data-store.js';
import { JsonFilePersistence } from '../../src/storage/json-file-persistence.js';

describe('InMemory explicit transaction persistence recovery', () => {
  it('attempts rollback persistence after a database.json write failure and reports rollback persistence failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-explicit-tx-'));
    const persistence = new JsonFilePersistence(join(directory, 'database.json'));
    const store = new InMemoryDataStore(persistence);
    await store.initialize();
    const applications = new GenericSysBOService(
      store,
      store.sysApplications,
      sysBOApplicationsMetadata,
    );
    const created = await applications.create(
      { name: 'Before', fullName: 'Before Application', enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );

    const save = vi.spyOn(persistence, 'save').mockRejectedValue(new Error('disk unavailable'));
    const transactionId = await store.beginTransaction('session-1');

    await expect(
      store.runInExplicitTransaction(transactionId, 'session-1', () =>
        applications.update(created.id, { name: 'After' }, SYSTEM_AUDIT_ACTOR),
      ),
    ).rejects.toThrow('disk unavailable');

    // The failed business write restores live in-memory state immediately.
    expect((await applications.get(created.id))?.name).toBe('Before');

    const rollback = await store.rollbackTransaction(transactionId, 'session-1');
    expect(rollback.failures).toEqual([
      {
        description: 'Re-persist restored datastore after failed JSON write',
        message: 'disk unavailable',
      },
    ]);
    expect(save).toHaveBeenCalledTimes(2);
    expect((await applications.get(created.id))?.name).toBe('Before');
  });

  it('rolls back a successful pictures replacement by restoring JSON and deleting newly written files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-explicit-tx-pictures-'));
    const persistence = new JsonFilePersistence(join(directory, 'database.json'));
    const store = new InMemoryDataStore(persistence);
    await store.initialize();
    const applications = new GenericSysBOService(
      store,
      store.sysApplications,
      sysBOApplicationsMetadata,
    );
    const created = await applications.create(
      { name: 'Pictures', fullName: 'Pictures Application', enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );
    const transactionId = await store.beginTransaction('session-1');

    const updated = await store.runInExplicitTransaction(transactionId, 'session-1', () =>
      applications.replacePictureItems(
        created.id,
        'pictures',
        [{ contentType: 'image/png', bytes: Buffer.from('new-picture') }],
        SYSTEM_AUDIT_ACTOR,
      ),
    );
    const newPicture = updated.pictures![0]!;
    expect(
      await store.readPictureItem('sys-applications', created.id, 'pictures', newPicture),
    ).not.toBeNull();

    const rollback = await store.rollbackTransaction(transactionId, 'session-1');

    expect(rollback.failures).toEqual([]);
    expect((await applications.get(created.id))?.pictures ?? []).toEqual([]);
    expect(
      await store.readPictureItem('sys-applications', created.id, 'pictures', newPicture),
    ).toBeNull();
  });

  it('commits a pictures replacement by retaining new files and deleting superseded files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-explicit-tx-pictures-'));
    const persistence = new JsonFilePersistence(join(directory, 'database.json'));
    const store = new InMemoryDataStore(persistence);
    await store.initialize();
    const applications = new GenericSysBOService(
      store,
      store.sysApplications,
      sysBOApplicationsMetadata,
    );
    const created = await applications.create(
      { name: 'Pictures', fullName: 'Pictures Application', enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );
    const withOld = await applications.replacePictureItems(
      created.id,
      'pictures',
      [{ contentType: 'image/png', bytes: Buffer.from('old-picture') }],
      SYSTEM_AUDIT_ACTOR,
    );
    const oldPicture = withOld.pictures![0]!;

    const transactionId = await store.beginTransaction('session-1');
    const updated = await store.runInExplicitTransaction(transactionId, 'session-1', () =>
      applications.replacePictureItems(
        created.id,
        'pictures',
        [{ contentType: 'image/png', bytes: Buffer.from('new-picture') }],
        SYSTEM_AUDIT_ACTOR,
      ),
    );
    const newPicture = updated.pictures![0]!;

    const commit = await store.commitTransaction(transactionId, 'session-1');

    expect(commit.failures).toEqual([]);
    expect(
      await store.readPictureItem('sys-applications', created.id, 'pictures', oldPicture),
    ).toBeNull();
    expect(
      await store.readPictureItem('sys-applications', created.id, 'pictures', newPicture),
    ).not.toBeNull();
    expect((await applications.get(created.id))?.pictures?.[0]?.id).toBe(newPicture.id);
  });
});
