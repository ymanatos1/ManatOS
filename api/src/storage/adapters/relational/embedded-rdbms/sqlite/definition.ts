import type { StorageAdapterSourceDefinition } from '../../../../adapter-definition.js';

export const SQLITE_ADAPTER_ID = 'rdbms-sqlite';

export const sqliteAdapterDefinition: StorageAdapterSourceDefinition = Object.freeze({
  id: SQLITE_ADAPTER_ID,
  name: 'SQLite',
  familyId: 'embedded-rdbms',
  logoUrl: '/images/storage-adapters/sqlite.svg',
  description:
    'SQLite embedded relational storage. The database is one local file; no database server, host, port or credentials are required.',
  runtimeAvailable: false,
  targetWorkflow: Object.freeze({
    connectionTest: true,
    schemaPreparation: true,
  }),
  tabs: Object.freeze([
    Object.freeze({
      id: 'connection',
      label: 'Database file',
      fields: Object.freeze([
        Object.freeze({
          key: 'filePath',
          label: 'SQLite database file',
          description:
            'Path of the SQLite database file. Testing the target opens the file and creates it when it does not yet exist.',
          type: 'path' as const,
          required: true,
          defaultValue: '../data/ManatOS_DB.sqlite',
          columnClass: 'col-12',
        }),
      ]),
    }),
    Object.freeze({
      id: 'schema',
      label: 'Schema',
      requiresConnection: true,
      retainWhenConfiguredBy: Object.freeze(['filePath']),
      fields: Object.freeze([]),
    }),
    Object.freeze({
      id: 'data',
      label: 'Data',
      requiresSchema: true,
      fields: Object.freeze([]),
    }),
  ]),
});
