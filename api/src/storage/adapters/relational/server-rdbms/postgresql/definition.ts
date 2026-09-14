import type { StorageAdapterSourceDefinition } from '../../../../adapter-definition.js';
import {
  rdbmsDatabaseField,
  rdbmsPasswordField,
  rdbmsUserNameField,
} from '../common-definition.js';

export const POSTGRESQL_ADAPTER_ID = 'rdbms-postgresql';

export const postgresqlAdapterDefinition: StorageAdapterSourceDefinition = Object.freeze({
  id: POSTGRESQL_ADAPTER_ID,
  name: 'PostgreSQL',
  familyId: 'server-rdbms',
  logoUrl: '/images/storage-adapters/postgresql.svg',
  description:
    'PostgreSQL relational storage. Configure and validate a target independently of the datastore currently serving ManatOS.',
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
          description: 'PostgreSQL host name or network address.',
          type: 'text' as const,
          required: true,
          defaultValue: 'localhost',
          columnClass: 'col-12 col-md-8',
        }),
        Object.freeze({
          key: 'port',
          label: 'Port',
          description: 'TCP port. The normal PostgreSQL default is 5432.',
          type: 'number' as const,
          required: true,
          defaultValue: '5432',
          columnClass: 'col-12 col-md-4',
        }),
        Object.freeze({
          ...rdbmsUserNameField,
          required: true,
          defaultValue: 'postgres',
          columnClass: 'col-12 col-md-6',
        }),
        Object.freeze({ ...rdbmsPasswordField, required: true, columnClass: 'col-12 col-md-6' }),
        Object.freeze({
          key: 'sslMode',
          label: 'SSL mode',
          description: 'PostgreSQL TLS behavior for this connection.',
          type: 'select' as const,
          required: true,
          defaultValue: 'prefer',
          columnClass: 'col-12 col-md-6',
          options: Object.freeze([
            Object.freeze({ value: 'disable', label: 'Disable' }),
            Object.freeze({ value: 'prefer', label: 'Prefer' }),
            Object.freeze({ value: 'require', label: 'Require' }),
            Object.freeze({ value: 'verify-full', label: 'Verify full certificate' }),
          ]),
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
