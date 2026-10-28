import { describe, expect, it } from 'vitest';
import {
  UiStorageWorkflowController,
  type UiStorageWorkflowTransport,
} from '../src/administration/storage-workflow.js';
import type { UiStorageConfiguration, UiStorageSnapshot } from '../src/administration/storage.js';

const snapshot: UiStorageSnapshot = {
  currentConfigurationId: '',
  selectedConfigurationId: '',
  runningConfigurationId: '',
  configurations: [],
  debugging: { apiStorageContextEnabled: false, outputDirectory: '' },
  adapters: [
    {
      id: 'rdbms-test',
      name: 'Relational',
      description: '',
      familyPath: [],
      runtimeAvailable: false,
      capabilities: [],
      targetWorkflow: {
        connectionTest: true,
        databaseDiscovery: true,
        databasePreparation: true,
        databaseFieldKey: 'database',
        schemaPreparation: true,
      },
      tabs: [
        {
          id: 'connection',
          label: 'Connection',
          fields: [
            { key: 'host', label: 'Host', description: '', type: 'text', required: true },
            {
              key: 'password',
              label: 'Password',
              description: '',
              type: 'password',
              required: true,
              secret: true,
            },
          ],
        },
        {
          id: 'database',
          label: 'Database',
          requiresConnection: true,
          fields: [
            { key: 'database', label: 'Database', description: '', type: 'text', required: true },
          ],
        },
        { id: 'schema', label: 'Schema', requiresDatabase: true, fields: [] },
      ],
    },
  ],
};

type Operation = { readonly operation: string; readonly settings: Record<string, string> };
const dummySaved = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Example',
  adapterId: 'rdbms-test',
  sequence: 1,
  stage: 'configuration',
  status: 'incomplete',
  settings: {},
  configuredSecretKeys: [],
} satisfies UiStorageConfiguration;

function fixture() {
  const calls: Operation[] = [];
  const responses = new Map<string, unknown>();
  const transport: UiStorageWorkflowTransport = {
    async storageTargetOperation<T>(
      operation: string,
      payload: Record<string, unknown>,
    ): Promise<T> {
      calls.push({ operation, settings: payload.settings as Record<string, string> });
      return responses.get(operation) as T;
    },
    async addStorageConfiguration() {
      return dummySaved;
    },
    async updateStorageConfiguration() {
      return dummySaved;
    },
  };
  const workflow = new UiStorageWorkflowController(snapshot, null, false, transport);
  workflow.rename('Example');
  workflow.edit(snapshot.adapters[0]!.tabs[0]!.fields[0]!, 'localhost');
  workflow.edit(snapshot.adapters[0]!.tabs[0]!.fields[1]!, 'replacement-secret');
  return { workflow, calls, responses };
}

describe('Storage workflow stage and database selection', () => {
  it('never treats a successful HTTP response with ok:false as verified', async () => {
    const { workflow, responses } = fixture();
    responses.set('test-connection', { ok: false });
    await workflow.operation('test-connection');
    expect(workflow.connectionState).toBe('error');
    expect(workflow.canOperate('databases')).toBe(false);
    expect(workflow.workflow.status).not.toBe('ready');
  });

  it('discovers, selects, inspects, and invalidates database evidence without disclosing secrets', async () => {
    const { workflow, responses, calls } = fixture();
    responses.set('test-connection', { ok: true });
    await workflow.operation('test-connection');
    expect(workflow.connectionState).toBe('verified');
    expect(workflow.draft.settings).not.toHaveProperty('password');
    responses.set('databases', { databases: ['Alpha', 'Beta'] });
    await workflow.operation('databases');
    workflow.selectDatabaseMode('existing');
    workflow.selectDiscoveredDatabase('Unknown');
    expect(workflow.draft.settings.database).toBe('');
    workflow.selectDiscoveredDatabase('Alpha');
    expect(workflow.draft.settings.database).toBe('Alpha');
    expect(workflow.databaseState).toBe('idle');
    expect(workflow.canOperate('database/inspect')).toBe(true);
    responses.set('database/inspect', { database: 'Alpha', exists: true });
    await workflow.operation('database/inspect');
    expect(workflow.databaseState).toBe('ready');
    workflow.selectDiscoveredDatabase('Beta');
    expect(workflow.databaseState).toBe('idle');
    expect(workflow.databases).toEqual(['Alpha', 'Beta']);
    expect(calls.every((entry) => entry.settings.password === 'replacement-secret')).toBe(true);
  });

  it('never inspects unnamed targets and never prepares an existing target from the UI mode', async () => {
    const { workflow, calls, responses } = fixture();
    responses.set('test-connection', { ok: true });
    await workflow.operation('test-connection');
    expect(workflow.canOperate('database/inspect')).toBe(false);
    await workflow.operation('database/prepare');
    expect(calls.map((item) => item.operation)).toEqual(['test-connection']);
    workflow.selectDatabaseMode('new');
    workflow.edit(workflow.databaseField!, 'NewCatalog');
    expect(workflow.canOperate('database/prepare')).toBe(true);
  });
});

describe('Storage workflow authoritative target evidence', () => {
  it('does not claim a prepared database ready until it appears in the refreshed catalogue', async () => {
    const { workflow, responses, calls } = fixture();
    responses.set('test-connection', { ok: true });
    await workflow.operation('test-connection');
    workflow.edit(workflow.databaseField!, 'NewCatalog');
    responses.set('database/prepare', { database: 'NewCatalog', exists: true });
    responses.set('databases', { databases: ['Other'] });
    await workflow.operation('database/prepare');
    expect(workflow.databaseState).toBe('error');
    expect(workflow.workflow.status).not.toBe('ready');
    responses.set('databases', { databases: ['NewCatalog'] });
    await workflow.operation('database/prepare');
    expect(workflow.databaseState).toBe('ready');
    expect(workflow.databaseMode).toBe('existing');
    expect(calls.map((call) => call.operation)).toEqual([
      'test-connection',
      'database/prepare',
      'databases',
      'database/prepare',
      'databases',
    ]);
  });
});

describe('Storage workflow rejects unverified or malformed targets', () => {
  it('rejects an inspection for a different database even when exists is true', async () => {
    const { workflow, responses } = fixture();
    responses.set('test-connection', { ok: true });
    await workflow.operation('test-connection');
    responses.set('databases', { databases: ['Alpha', 'Beta'] });
    await workflow.operation('databases');
    workflow.selectDatabaseMode('existing');
    workflow.selectDiscoveredDatabase('Alpha');
    responses.set('database/inspect', { exists: true, database: 'Beta' });
    await workflow.operation('database/inspect');
    expect(workflow.databaseState).toBe('error');
    expect(workflow.canCheckSchema).toBe(false);
  });

  it('rejects schema evidence for the wrong selected database', async () => {
    const { workflow, responses } = fixture();
    responses.set('test-connection', { ok: true });
    await workflow.operation('test-connection');
    responses.set('databases', { databases: ['Alpha'] });
    await workflow.operation('databases');
    workflow.selectDatabaseMode('existing');
    workflow.selectDiscoveredDatabase('Alpha');
    responses.set('database/inspect', { exists: true, database: 'Alpha' });
    await workflow.operation('database/inspect');
    responses.set('schema/inspect', { ready: true, database: 'Different' });
    await workflow.operation('schema/inspect');
    expect(workflow.schemaState).not.toBe('ready');
    expect(workflow.workflow.status).not.toBe('ready');
  });

  it('allows saving incomplete configurations without manufacturing target readiness', async () => {
    const { workflow } = fixture();
    const result = { ...dummySaved, status: 'incomplete', stage: 'connection' };
    const writes: Record<string, unknown>[] = [];
    const transport: UiStorageWorkflowTransport = {
      async storageTargetOperation() {
        throw new Error('Not expected');
      },
      async addStorageConfiguration(body) {
        writes.push(body);
        return result;
      },
      async updateStorageConfiguration() {
        return result;
      },
    };
    const incomplete = new UiStorageWorkflowController(snapshot, null, false, transport);
    incomplete.rename('Draft');
    await incomplete.save();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.status).toBe('incomplete');
    expect(incomplete.connectionState).toBe('idle');
    expect(incomplete.hasUnsavedChanges()).toBe(false);
    workflow.dispose();
  });
});
