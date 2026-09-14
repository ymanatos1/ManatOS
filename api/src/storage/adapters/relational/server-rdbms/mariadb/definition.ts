import type { StorageAdapterSourceDefinition } from '../../../../adapter-definition.js';
import {
  rdbmsDatabaseField,
  rdbmsPasswordField,
  rdbmsUserNameField,
} from '../common-definition.js';

export const MARIADB_ADAPTER_ID = 'rdbms-mariadb';

export const mariaDbAdapterDefinition: StorageAdapterSourceDefinition = Object.freeze({
  id: MARIADB_ADAPTER_ID,
  name: 'MariaDB',
  familyId: 'server-rdbms',
  logoUrl: '/images/storage-adapters/mariadb.svg',
  description:
    'MariaDB relational storage. Configure and validate a target independently of the datastore currently serving ManatOS.',
  runtimeAvailable: false,
  targetWorkflow: Object.freeze({
    connectionTest: true,
    databaseDiscovery: true,
    databasePreparation: true,
    databaseFieldKey: 'database',
    schemaPreparation: true,
  }),
  tabs: Object.freeze([
    Object.freeze({
      id: 'connection',
      label: 'Connection',
      fields: Object.freeze([
        Object.freeze({
          key: 'host',
          label: 'Host',
          description: 'MariaDB host name or network address.',
          type: 'text' as const,
          required: true,
          defaultValue: 'localhost',
          columnClass: 'col-12 col-md-8',
        }),
        Object.freeze({
          key: 'port',
          label: 'Port',
          description: 'TCP port. The normal MariaDB default is 3306.',
          type: 'number' as const,
          required: true,
          defaultValue: '3306',
          columnClass: 'col-12 col-md-4',
        }),
        Object.freeze({ ...rdbmsUserNameField, required: true, columnClass: 'col-12 col-md-6' }),
        Object.freeze({ ...rdbmsPasswordField, required: true, columnClass: 'col-12 col-md-6' }),
        Object.freeze({
          key: 'ssl',
          label: 'Use SSL/TLS',
          description: 'Use TLS for the MariaDB connection.',
          type: 'boolean' as const,
          required: false,
          defaultValue: 'false',
          columnClass: 'col-12 col-md-6',
        }),
      ]),
    }),
    Object.freeze({
      id: 'database',
      label: 'Database',
      requiresConnection: true,
      retainWhenConfiguredBy: Object.freeze(['database']),
      fields: Object.freeze([Object.freeze({ ...rdbmsDatabaseField, columnClass: 'col-12' })]),
    }),
    Object.freeze({
      id: 'schema',
      label: 'Schema',
      requiresDatabase: true,
      retainWhenConfiguredBy: Object.freeze(['database']),
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
