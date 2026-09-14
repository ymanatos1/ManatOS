import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SecretsEncryptionService } from '../../src/security/secrets-encryption-service.js';
import {
  DEFAULT_API_STORAGE_DEBUG_DIRECTORY,
  DEFAULT_STORAGE_CONFIGURATION_ID,
  IN_MEMORY_JSON_ADAPTER_ID,
  SQL_SERVER_ADAPTER_ID,
  SystemSettingsStore,
} from '../../src/system-settings.js';

const encryption = () =>
  new SecretsEncryptionService('test', Buffer.alloc(32, 9).toString('base64'));

describe('bootstrap System Settings storage configuration', () => {
  it('creates the JSON default and exposes concrete adapter definitions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());

    await store.initialize();

    const snapshot = store.adminStorageSnapshot();
    expect(snapshot.currentConfigurationId).toBe(DEFAULT_STORAGE_CONFIGURATION_ID);
    expect(snapshot.selectedConfigurationId).toBe(DEFAULT_STORAGE_CONFIGURATION_ID);
    expect(snapshot.runningConfigurationId).toBe(DEFAULT_STORAGE_CONFIGURATION_ID);
    expect(snapshot.debugging).toEqual({
      apiStorageContextEnabled: false,
      outputDirectory: DEFAULT_API_STORAGE_DEBUG_DIRECTORY,
    });
    expect(DEFAULT_API_STORAGE_DEBUG_DIRECTORY).toBe('../data/logs/api/');
    expect(snapshot.configurations[0]?.stage).toBe('complete');
    expect(snapshot.configurations[0]?.status).toBe('ready');
    expect(snapshot.adapters.map((adapter) => adapter.name)).toEqual([
      'In-memory / JSON file',
      'SQL Server',
      'MariaDB',
      'PostgreSQL',
      'SQLite',
    ]);
    expect(snapshot.adapters[0]?.tabs[0]?.label).toBe('Files');
    expect(snapshot.adapters.every((adapter) => Boolean(adapter.logoUrl))).toBe(true);
    const sqlServer = snapshot.adapters.find((adapter) => adapter.id === SQL_SERVER_ADAPTER_ID);
    expect(sqlServer?.runtimeAvailable).toBe(false);
    expect(sqlServer?.tabs.map((tab) => tab.label)).toEqual([
      'Connection',
      'Database',
      'Schema',
      'Data',
    ]);
    expect(sqlServer?.tabs.find((tab) => tab.id === 'database')?.requiresConnection).toBe(true);
    expect(sqlServer?.tabs.find((tab) => tab.id === 'database')?.retainWhenConfiguredBy).toEqual([
      'database',
    ]);
    expect(sqlServer?.tabs.find((tab) => tab.id === 'schema')?.requiresDatabase).toBe(true);
    expect(sqlServer?.tabs.find((tab) => tab.id === 'data')?.requiresSchema).toBe(true);
    expect(sqlServer?.targetWorkflow?.databasePreparation).toBe(true);
    expect(sqlServer?.targetWorkflow?.schemaPreparation).toBe(true);
    expect(sqlServer?.familyPath).toEqual(['Relational', 'Server RDBMS']);
    expect(
      sqlServer?.capabilities.find((capability) => capability.key === 'model.relational'),
    ).toMatchObject({ supported: true, sourceId: 'relational', sourceName: 'Relational' });
    expect(
      sqlServer?.capabilities.find(
        (capability) => capability.key === 'programmability.stored-procedures',
      ),
    ).toMatchObject({ supported: true, sourceId: 'server-rdbms', sourceName: 'Server RDBMS' });
    const connectionFields = sqlServer?.tabs.find((tab) => tab.id === 'connection')?.fields;
    expect(connectionFields?.find((field) => field.key === 'transport')?.defaultValue).toBe(
      'native-odbc',
    );
    expect(connectionFields?.find((field) => field.key === 'authentication')?.defaultValue).toBe(
      'windows',
    );
    const postgresql = snapshot.adapters.find((adapter) => adapter.id === 'rdbms-postgresql');
    expect(postgresql?.tabs.map((tab) => tab.label)).toEqual([
      'Connection',
      'Database',
      'Schema',
      'Data',
    ]);
    expect(
      postgresql?.tabs
        .find((tab) => tab.id === 'connection')
        ?.fields.find((field) => field.key === 'port')?.defaultValue,
    ).toBe('5432');
    expect(
      postgresql?.tabs
        .find((tab) => tab.id === 'database')
        ?.fields.find((field) => field.key === 'database')?.suggestedValue,
    ).toBe('ManatOS_DB');

    const sqlite = snapshot.adapters.find((adapter) => adapter.id === 'rdbms-sqlite');
    expect(sqlite?.familyPath).toEqual(['Relational', 'Embedded RDBMS']);
    expect(
      sqlite?.capabilities.find(
        (capability) => capability.key === 'programmability.stored-procedures',
      ),
    ).toMatchObject({ supported: false, sourceId: 'embedded-rdbms' });
    const json = snapshot.adapters.find((adapter) => adapter.id === IN_MEMORY_JSON_ADAPTER_ID);
    expect(json?.familyPath).toEqual(['Document / file']);
    expect(
      json?.capabilities.find((capability) => capability.key === 'model.document-records'),
    ).toMatchObject({ supported: true, sourceId: 'document-file' });
    expect(sqlite?.tabs.map((tab) => tab.label)).toEqual(['Database file', 'Schema', 'Data']);
    expect(sqlite?.tabs[0]?.fields.find((field) => field.key === 'filePath')?.defaultValue).toBe(
      '../data/ManatOS_DB.sqlite',
    );
  });

  it('persists bootstrap-owned API storage CTX debugging settings independently of adapters', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-debugging-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const saved = await store.updateStorageDebugging({
      apiStorageContextEnabled: true,
      outputDirectory: './data/logs/api-storage-test/',
    });
    expect(saved).toEqual({
      apiStorageContextEnabled: true,
      outputDirectory: './data/logs/api-storage-test/',
    });

    const reopened = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await reopened.initialize();
    expect(reopened.storageDebuggingSettings()).toEqual(saved);
    expect(reopened.adminStorageSnapshot().debugging).toEqual(saved);
  });

  it('persists an explicit storage configuration sequence and can reorder it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-order-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const second = await store.addStorageConfiguration({
      name: 'Second',
      adapterId: SQL_SERVER_ADAPTER_ID,
      settings: {},
    });
    const third = await store.addStorageConfiguration({
      name: 'Third',
      adapterId: SQL_SERVER_ADAPTER_ID,
      settings: {},
    });

    expect(store.adminStorageSnapshot().configurations.map((entry) => entry.sequence)).toEqual([
      0, 1, 2,
    ]);
    await store.moveStorageConfiguration(third.id, 'up');
    expect(store.adminStorageSnapshot().configurations.map((entry) => entry.id)).toEqual([
      DEFAULT_STORAGE_CONFIGURATION_ID,
      third.id,
      second.id,
    ]);
  });

  it('deletes only non-current storage configurations and renormalizes sequence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-delete-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const second = await store.addStorageConfiguration({
      name: 'Disposable',
      adapterId: SQL_SERVER_ADAPTER_ID,
      settings: {},
    });
    await expect(
      store.deleteStorageConfiguration(DEFAULT_STORAGE_CONFIGURATION_ID),
    ).rejects.toThrow('selected or currently running storage configuration cannot be deleted');
    const deleted = await store.deleteStorageConfiguration(second.id);
    expect(deleted.id).toBe(second.id);
    expect(store.adminStorageSnapshot().configurations.map((entry) => entry.sequence)).toEqual([0]);
  });

  it('rejects duplicate storage configuration names case-insensitively', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-name-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    await expect(
      store.addStorageConfiguration({
        name: 'default LOCAL json',
        adapterId: IN_MEMORY_JSON_ADAPTER_ID,
        settings: {
          dataFile: join(directory, 'other.json'),
          binaryRoot: join(directory, 'images'),
        },
      }),
    ).rejects.toThrow('already in use');
  });

  it('persists stage-1 storage configurations before later target stages are complete', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-staged-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const saved = await store.addStorageConfiguration({
      name: 'Incomplete SQL Server',
      adapterId: SQL_SERVER_ADAPTER_ID,
      settings: {},
    });

    expect(saved.name).toBe('Incomplete SQL Server');
    expect(saved.adapterId).toBe(SQL_SERVER_ADAPTER_ID);
    expect(saved.settings.database).toBe('');
    expect(saved.stage).toBe('');
    expect(saved.status).toBe('');
  });

  it('encrypts relational credentials and never projects secret material to the Admin UI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-secret-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const sql = await store.addStorageConfiguration({
      name: 'Local SQL Server',
      adapterId: SQL_SERVER_ADAPTER_ID,
      stage: 'complete',
      status: 'ready',
      settings: {
        server: 'localhost',
        port: '1433',
        database: 'ManatOS',
        authentication: 'sql-password',
        userName: 'sa',
        password: 'Secret!123',
        encrypt: 'true',
        trustServerCertificate: 'true',
      },
    });

    expect(sql.settings.password).toBeUndefined();
    expect(sql.configuredSecretKeys).toContain('password');

    const persisted = await readFile(path, 'utf8');
    expect(persisted).not.toContain('Secret!123');
    expect(persisted).toContain('v1:test:');

    await expect(store.selectStorageConfiguration(sql.id)).rejects.toThrow(
      'datastore runtime is not implemented yet',
    );
  });

  it('keeps the running datastore separate from the selection for the next API start', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-selection-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const next = await store.addStorageConfiguration({
      name: 'Next JSON',
      adapterId: IN_MEMORY_JSON_ADAPTER_ID,
      stage: 'complete',
      status: 'ready',
      settings: {
        dataFile: join(directory, 'next.json'),
        binaryRoot: join(directory, 'next-images'),
      },
    });
    await store.selectStorageConfiguration(next.id);

    const snapshot = store.adminStorageSnapshot();
    expect(snapshot.selectedConfigurationId).toBe(next.id);
    expect(snapshot.runningConfigurationId).toBe(DEFAULT_STORAGE_CONFIGURATION_ID);
    expect(store.currentStorageConfiguration().id).toBe(DEFAULT_STORAGE_CONFIGURATION_ID);
  });

  it('rejects activation of a configuration whose persisted readiness is not Ready', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-not-ready-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const incomplete = await store.addStorageConfiguration({
      name: 'Incomplete JSON',
      adapterId: IN_MEMORY_JSON_ADAPTER_ID,
      stage: 'configuration',
      status: 'incomplete',
      settings: {
        dataFile: join(directory, 'incomplete.json'),
        binaryRoot: join(directory, 'incomplete-images'),
      },
    });

    await expect(store.selectStorageConfiguration(incomplete.id)).rejects.toThrow(
      'saved status is Ready',
    );
  });

  it('resolves a transient target independently of the selected active datastore', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manatos-system-settings-target-'));
    const path = join(directory, 'system-settings.json');
    const store = new SystemSettingsStore(path, join(directory, 'database.json'), encryption());
    await store.initialize();

    const saved = await store.addStorageConfiguration({
      name: 'Target SQL Server',
      adapterId: SQL_SERVER_ADAPTER_ID,
      settings: {
        server: 'localhost',
        port: '1433',
        database: 'ManatOS',
        authentication: 'sql-password',
        userName: 'Admin',
        password: 'Secret!123',
        encrypt: 'true',
        trustServerCertificate: 'true',
      },
    });

    const target = store.operationalStorageConfiguration({
      configurationId: saved.id,
      settings: { database: '' },
    });
    expect(target.adapterId).toBe(SQL_SERVER_ADAPTER_ID);
    expect(target.settings.server).toBe('localhost');
    expect(target.settings.database).toBe('');
    expect(target.settings.password).toBe('Secret!123');
    expect(store.currentStorageConfiguration().id).toBe(DEFAULT_STORAGE_CONFIGURATION_ID);
  });
});
