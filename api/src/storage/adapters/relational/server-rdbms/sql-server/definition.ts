import type { StorageAdapterSourceDefinition } from '../../../../adapter-definition.js';
import {
  rdbmsDatabaseField,
  rdbmsPasswordField,
  rdbmsUserNameField,
} from '../common-definition.js';

export const SQL_SERVER_ADAPTER_ID = 'rdbms-sql-server';

export const sqlServerAdapterDefinition: StorageAdapterSourceDefinition = Object.freeze({
  id: SQL_SERVER_ADAPTER_ID,
  name: 'SQL Server',
  familyId: 'server-rdbms',
  logoUrl: '/images/storage-adapters/sql-server.svg',
  description:
    'Microsoft SQL Server relational storage. Configure and validate a target independently of the datastore currently serving ManatOS.',
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
          key: 'server',
          label: 'Server',
          description: 'SQL Server host name or network address.',
          type: 'text' as const,
          required: true,
          defaultValue: 'localhost',
          columnClass: 'col-12 col-md-6',
        }),
        Object.freeze({
          key: 'instance',
          label: 'Instance',
          description: 'Optional named SQL Server instance. Leave empty when connecting by port.',
          type: 'text' as const,
          required: false,
          columnClass: 'col-12 col-md-3',
        }),
        Object.freeze({
          key: 'port',
          label: 'Port',
          description:
            'Optional TCP port. Leave empty to let the SQL Server driver use its normal connection resolution.',
          type: 'number' as const,
          required: false,
          defaultValue: '',
          columnClass: 'col-12 col-md-3',
        }),
        Object.freeze({
          key: 'transport',
          label: 'Driver / transport',
          description:
            'SQL Server client transport. Native Windows / ODBC supports Windows integrated authentication; TDS / Tedious is cross-platform and uses SQL Server credentials.',
          type: 'select' as const,
          required: true,
          defaultValue: 'native-odbc',
          columnClass: 'col-12 col-lg-6',
          options: Object.freeze([
            Object.freeze({
              value: 'native-odbc',
              label: 'Native Windows / ODBC (msnodesqlv8)',
            }),
            Object.freeze({
              value: 'tedious',
              label: 'TDS / Tedious (cross-platform)',
            }),
          ]),
        }),
        Object.freeze({
          key: 'odbcDriver',
          label: 'ODBC driver',
          description:
            'Native Microsoft ODBC driver used for Windows integrated authentication. ODBC Driver 18 is recommended for current SQL Server versions.',
          type: 'select' as const,
          required: false,
          requiredWhen: Object.freeze({ key: 'transport', equals: 'native-odbc' }),
          defaultValue: 'ODBC Driver 18 for SQL Server',
          columnClass: 'col-12 col-lg-6',
          visibleWhen: Object.freeze({ key: 'transport', equals: 'native-odbc' }),
          options: Object.freeze([
            Object.freeze({
              value: 'ODBC Driver 18 for SQL Server',
              label: 'ODBC Driver 18 for SQL Server',
            }),
            Object.freeze({
              value: 'ODBC Driver 17 for SQL Server',
              label: 'ODBC Driver 17 for SQL Server',
            }),
            Object.freeze({
              value: 'SQL Server Native Client 11.0',
              label: 'SQL Server Native Client 11.0 (legacy)',
            }),
          ]),
        }),
        Object.freeze({
          key: 'authentication',
          label: 'Authentication',
          description: 'Authentication mechanism used by the SQL Server connection.',
          type: 'select' as const,
          required: true,
          defaultValue: 'windows',
          columnClass: 'col-12',
          options: Object.freeze([
            Object.freeze({ value: 'sql-password', label: 'SQL Server user name / password' }),
            Object.freeze({ value: 'windows', label: 'Windows integrated authentication' }),
          ]),
        }),
        Object.freeze({
          ...rdbmsUserNameField,
          columnClass: 'col-12 col-md-6',
          requiredWhen: Object.freeze({ key: 'authentication', equals: 'sql-password' }),
          visibleWhen: Object.freeze({ key: 'authentication', equals: 'sql-password' }),
        }),
        Object.freeze({
          ...rdbmsPasswordField,
          columnClass: 'col-12 col-md-6',
          requiredWhen: Object.freeze({ key: 'authentication', equals: 'sql-password' }),
          visibleWhen: Object.freeze({ key: 'authentication', equals: 'sql-password' }),
        }),
        Object.freeze({
          key: 'encrypt',
          label: 'Encryption',
          description:
            'SQL Server connection encryption. Mandatory requests TLS; Optional allows an unencrypted connection when the server permits it.',
          type: 'select' as const,
          required: false,
          defaultValue: 'true',
          columnClass: 'col-12 col-md-6',
          options: Object.freeze([
            Object.freeze({ value: 'false', label: 'Optional' }),
            Object.freeze({ value: 'true', label: 'Mandatory' }),
          ]),
        }),
        Object.freeze({
          key: 'trustServerCertificate',
          label: 'Trust server certificate',
          description:
            'Trust the SQL Server certificate without normal chain validation. Appropriate for a local development server using a self-signed certificate.',
          type: 'boolean' as const,
          presentation: 'checkbox' as const,
          required: false,
          defaultValue: 'true',
          columnClass: 'col-12 col-md-6 d-flex flex-column justify-content-end',
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
