import { createRequire } from 'node:module';
import { inspect } from 'node:util';

import { ValidationAppError } from '@manatos/shared';

import { logger } from '../../../../logging/logger.js';

import type {
  StorageTargetConnectionResult,
  StorageTargetDatabaseStatus,
  StorageTargetOperations,
  StorageTargetSchemaPreparationResult,
} from '../../../target-operations.js';
import {
  desiredRdbmsSchema,
  MANATOS_RDBMS_SCHEMA_VERSION,
  type RdbmsDesiredColumn,
  type RdbmsDesiredTable,
  type RdbmsSchemaChange,
  type RdbmsSchemaInspection,
} from '../desired-schema.js';
import { MARIADB_ADAPTER_ID } from './mariadb/definition.js';
import { POSTGRESQL_ADAPTER_ID } from './postgresql/definition.js';
import { SQL_SERVER_ADAPTER_ID } from './sql-server/definition.js';

const require = createRequire(import.meta.url);

type Settings = Readonly<Record<string, string>>;

type QueryRow = Record<string, unknown>;
type QueryResult = { recordset?: QueryRow[] };

interface SqlServerRequest {
  input(name: string, value: unknown): SqlServerRequest;
  query(sql: string): Promise<QueryResult>;
}

interface SqlServerPool {
  connect(): Promise<unknown>;
  close(): Promise<unknown>;
  request(): SqlServerRequest;
}

interface SqlServerModule {
  ConnectionPool: new (config: Record<string, unknown>) => SqlServerPool;
}

interface MariaDbConnection {
  query(sql: string, values?: readonly unknown[]): Promise<QueryRow[]>;
  end(): Promise<unknown>;
}

interface MariaDbModule {
  createConnection(config: Record<string, unknown>): Promise<MariaDbConnection>;
}

interface PostgreSqlResult {
  rows?: QueryRow[];
}

interface PostgreSqlClient {
  connect(): Promise<void>;
  query(sql: string, values?: readonly unknown[]): Promise<PostgreSqlResult>;
  end(): Promise<void>;
}

interface PostgreSqlModule {
  Client: new (config: Record<string, unknown>) => PostgreSqlClient;
}

function required(settings: Settings, key: string, label: string): string {
  const value = String(settings[key] ?? '').trim();
  if (!value) throw new ValidationAppError(`${label} is required.`);
  return value;
}

function safeDatabaseName(value: string): string {
  const database = value.trim();
  if (!database) throw new ValidationAppError('Database name is required.');
  if (!/^[A-Za-z0-9_$.-]+$/.test(database)) {
    throw new ValidationAppError(
      'Database name may contain only letters, digits, underscore, dollar sign, dot and hyphen.',
    );
  }
  return database;
}

function loadOptionalPackage(name: string): unknown {
  try {
    return require(name);
  } catch {
    throw new ValidationAppError(
      name === 'mssql/msnodesqlv8'
        ? "Windows integrated SQL Server authentication requires the optional 'msnodesqlv8' driver. Install it in the API workspace, then restart the API."
        : `The '${name}' database driver is not installed. Install API dependencies before testing this storage adapter.`,
    );
  }
}

function driverErrorMessage(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();

  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const message = value.trim();
    if (
      !message ||
      message === '[object Object]' ||
      message === 'ConnectionError' ||
      message.includes('[object Object]')
    )
      return;
    messages.push(message);
  };

  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 6 || seen.has(value)) return;
    if (typeof value === 'string') {
      add(value);
      return;
    }
    if (typeof value !== 'object') return;
    seen.add(value);

    // Driver errors frequently keep their useful diagnostics on non-enumerable
    // own properties. Read both the known error fields and every own property
    // rather than relying on JSON.stringify(), which can reduce a native ODBC
    // ConnectionError to merely { name: 'ConnectionError' }.
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'description', 'details']) {
      try {
        visit(record[key], depth + 1);
      } catch {
        // Ignore hostile/native accessors and continue collecting diagnostics.
      }
    }

    for (const key of ['code', 'sqlState', 'state', 'number']) {
      try {
        const raw = record[key];
        if (typeof raw === 'string' || typeof raw === 'number') {
          const text = String(raw).trim();
          if (text) messages.push(`${key}: ${text}`);
        }
      } catch {
        // Ignore native accessor failures.
      }
    }

    const preferred = new Set([
      'originalError',
      'cause',
      'error',
      'parent',
      'info',
      'nativeError',
      'driverError',
      'errors',
      'precedingErrors',
      'odbcErrors',
    ]);
    for (const key of preferred) {
      try {
        const nested = record[key];
        if (Array.isArray(nested)) nested.forEach((item) => visit(item, depth + 1));
        else visit(nested, depth + 1);
      } catch {
        // Ignore native accessor failures.
      }
    }

    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'stack' || key === 'name' || preferred.has(key)) continue;
      try {
        visit(record[key], depth + 1);
      } catch {
        // Ignore native accessor failures.
      }
    }

    try {
      const rendered = String(value);
      if (rendered && rendered !== '[object Object]' && rendered !== 'ConnectionError')
        add(rendered);
    } catch {
      // Ignore native toString failures.
    }
  };

  visit(error);
  const unique = [...new Set(messages)];
  if (unique.length) return unique.join(' · ');

  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '').trim()
      : '';
  return name
    ? `${name}: the database driver did not expose a more specific diagnostic.`
    : 'The database driver returned an unrecognized error.';
}

function driverDiagnostic(error: unknown): string {
  let rendered = '';
  try {
    rendered = inspect(error, {
      depth: 8,
      showHidden: true,
      getters: false,
      breakLength: 160,
      maxArrayLength: 50,
      maxStringLength: 4_000,
    });
  } catch {
    rendered = String(error ?? 'Unknown driver error');
  }
  return rendered
    .replace(/(password|pwd)\s*[:=]\s*(['"]?)[^,;\s}\]]+/gi, '$1=<redacted>')
    .replace(/(Password|Pwd)=([^;]*)/gi, '$1=<redacted>');
}

function sqlServerConnectionSummary(settings: Settings, database: string) {
  const rawPort = String(settings.port ?? '').trim();
  return {
    server: String(settings.server ?? '').trim(),
    instance: String(settings.instance ?? '').trim() || undefined,
    port: rawPort || undefined,
    database,
    transport: settings.transport || 'native-odbc',
    authentication: settings.authentication || 'windows',
    odbcDriver:
      (settings.transport || 'native-odbc') === 'native-odbc'
        ? String(settings.odbcDriver || 'ODBC Driver 18 for SQL Server')
        : undefined,
    encryption: settings.encrypt === 'false' ? 'optional' : 'mandatory',
    trustServerCertificate: settings.trustServerCertificate === 'true',
  };
}

function schemaInspection(database: string, changes: RdbmsSchemaChange[]): RdbmsSchemaInspection {
  const ready = changes.length === 0;
  return {
    ready,
    database,
    desiredVersion: MANATOS_RDBMS_SCHEMA_VERSION,
    changes,
    message: ready
      ? `Database '${database}' is ready for the current ManatOS relational schema.`
      : `${changes.length} schema change${changes.length === 1 ? '' : 's'} required before '${database}' is ready.`,
  };
}

function sqlServerType(column: RdbmsDesiredColumn): string {
  switch (column.fieldType) {
    case 'guid':
    case 'reference':
      return 'nvarchar(36)';
    case 'boolean':
      return 'bit';
    case 'number':
      return 'decimal(38,10)';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime2(3)';
    case 'string':
    case 'email':
    case 'telephone':
    case 'enum':
      return column.maxLength && column.maxLength <= 4000
        ? `nvarchar(${Math.max(1, column.maxLength)})`
        : 'nvarchar(max)';
    default:
      return 'nvarchar(max)';
  }
}

function mariaDbType(column: RdbmsDesiredColumn): string {
  switch (column.fieldType) {
    case 'guid':
    case 'reference':
      return 'varchar(36)';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'decimal(38,10)';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime(3)';
    case 'string':
    case 'email':
    case 'telephone':
    case 'enum':
      return column.maxLength && column.maxLength <= 16383
        ? `varchar(${Math.max(1, column.maxLength)})`
        : 'longtext';
    default:
      return 'longtext';
  }
}

function sqlServerCreateTable(table: RdbmsDesiredTable): string {
  const columns = table.columns.map((column) => {
    const nullable = column.required ? 'NOT NULL' : 'NULL';
    const primary = column.name === 'id' ? ' PRIMARY KEY' : '';
    return `[${column.name.replaceAll(']', ']]')}] ${sqlServerType(column)} ${nullable}${primary}`;
  });
  return `CREATE TABLE [${table.name.replaceAll(']', ']]')}] (${columns.join(', ')})`;
}

function sqlServerAddColumn(table: string, column: RdbmsDesiredColumn): string {
  const nullable = column.required ? 'NOT NULL' : 'NULL';
  return `ALTER TABLE [${table.replaceAll(']', ']]')}] ADD [${column.name.replaceAll(']', ']]')}] ${sqlServerType(column)} ${nullable}`;
}

function mariaDbCreateTable(table: RdbmsDesiredTable): string {
  const columns = table.columns.map((column) => {
    const nullable = column.required ? 'NOT NULL' : 'NULL';
    const primary = column.name === 'id' ? ' PRIMARY KEY' : '';
    return `\`${column.name.replaceAll('`', '``')}\` ${mariaDbType(column)} ${nullable}${primary}`;
  });
  return `CREATE TABLE \`${table.name.replaceAll('`', '``')}\` (${columns.join(', ')})`;
}

function mariaDbAddColumn(table: string, column: RdbmsDesiredColumn): string {
  const nullable = column.required ? 'NOT NULL' : 'NULL';
  return `ALTER TABLE \`${table.replaceAll('`', '``')}\` ADD COLUMN \`${column.name.replaceAll('`', '``')}\` ${mariaDbType(column)} ${nullable}`;
}

function postgresqlType(column: RdbmsDesiredColumn): string {
  switch (column.fieldType) {
    case 'guid':
    case 'reference':
      return 'varchar(36)';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'numeric(38,10)';
    case 'date':
      return 'date';
    case 'datetime':
      return 'timestamp(3) with time zone';
    case 'string':
    case 'email':
    case 'telephone':
    case 'enum':
      return column.maxLength ? `varchar(${Math.max(1, column.maxLength)})` : 'text';
    default:
      return 'text';
  }
}

function quotePostgresqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function postgresqlCreateTable(table: RdbmsDesiredTable): string {
  const columns = table.columns.map((column) => {
    const nullable = column.required ? 'NOT NULL' : 'NULL';
    const primary = column.name === 'id' ? ' PRIMARY KEY' : '';
    return `${quotePostgresqlIdentifier(column.name)} ${postgresqlType(column)} ${nullable}${primary}`;
  });
  return `CREATE TABLE ${quotePostgresqlIdentifier(table.name)} (${columns.join(', ')})`;
}

function postgresqlAddColumn(table: string, column: RdbmsDesiredColumn): string {
  const nullable = column.required ? 'NOT NULL' : 'NULL';
  return `ALTER TABLE ${quotePostgresqlIdentifier(table)} ADD COLUMN ${quotePostgresqlIdentifier(column.name)} ${postgresqlType(column)} ${nullable}`;
}

function postgresqlConfig(settings: Settings, database = 'postgres'): Record<string, unknown> {
  const host = required(settings, 'host', 'Host');
  const port = Number(required(settings, 'port', 'Port'));
  if (!Number.isFinite(port)) throw new ValidationAppError('Port must be a number.');
  const sslMode = String(settings.sslMode || 'prefer');
  const ssl =
    sslMode === 'disable'
      ? false
      : sslMode === 'verify-full'
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false };
  return {
    host,
    port,
    database,
    user: required(settings, 'userName', 'User name'),
    password: required(settings, 'password', 'Password'),
    ssl,
    connectionTimeoutMillis: 7_500,
    query_timeout: 10_000,
  };
}

function sqlServerConfig(settings: Settings, database = 'master'): Record<string, unknown> {
  const transport = settings.transport || 'native-odbc';
  const authentication = settings.authentication || 'windows';
  const server = required(settings, 'server', 'Server');
  const instance = String(settings.instance ?? '').trim();
  const rawPort = String(settings.port ?? '').trim();
  const port = rawPort ? Number(rawPort) : null;
  if (port !== null && !Number.isFinite(port))
    throw new ValidationAppError('Port must be a number.');

  if (transport === 'tedious' && authentication === 'windows') {
    throw new ValidationAppError(
      'Windows integrated authentication requires the Native Windows / ODBC transport. Select that transport or use SQL Server user name / password authentication.',
    );
  }

  if (transport === 'native-odbc') {
    const odbcDriver = required(settings, 'odbcDriver', 'ODBC driver');
    const serverTarget = instance
      ? `${server}\\${instance}`
      : port !== null
        ? `${server},${port}`
        : server;
    const encrypt = settings.encrypt === 'false' ? 'No' : 'Yes';
    const trust = settings.trustServerCertificate === 'true' ? 'Yes' : 'No';
    const credentials =
      authentication === 'windows'
        ? 'Trusted_Connection=Yes;'
        : `UID=${required(settings, 'userName', 'User name')};PWD=${required(settings, 'password', 'Password')};`;

    return {
      server,
      database,
      connectionString: `Driver={${odbcDriver}};Server={${serverTarget}};Database={${database}};${credentials}Encrypt=${encrypt};TrustServerCertificate=${trust};`,
      options: {
        trustedConnection: authentication === 'windows',
        encrypt: settings.encrypt !== 'false',
        trustServerCertificate: settings.trustServerCertificate === 'true',
        ...(instance ? { instanceName: instance } : {}),
      },
      pool: { max: 2, min: 0, idleTimeoutMillis: 5_000 },
      connectionTimeout: 7_500,
      requestTimeout: 10_000,
    };
  }

  return {
    server,
    ...(instance || port === null ? {} : { port }),
    database,
    user: required(settings, 'userName', 'User name'),
    password: required(settings, 'password', 'Password'),
    options: {
      encrypt: settings.encrypt !== 'false',
      trustServerCertificate: settings.trustServerCertificate === 'true',
      ...(instance ? { instanceName: instance } : {}),
    },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5_000 },
    connectionTimeout: 7_500,
    requestTimeout: 10_000,
  };
}

class SqlServerTargetOperations implements StorageTargetOperations {
  async withPool<T>(
    settings: Settings,
    database: string,
    operation: (pool: SqlServerPool) => Promise<T>,
  ) {
    const transport = settings.transport || 'native-odbc';
    const driverPackage = transport === 'native-odbc' ? 'mssql/msnodesqlv8' : 'mssql';
    const sql = loadOptionalPackage(driverPackage) as SqlServerModule;
    const connectionSummary = sqlServerConnectionSummary(settings, database);
    logger.info('SQL Server target connection attempt', connectionSummary);
    const pool = new sql.ConnectionPool(sqlServerConfig(settings, database));
    try {
      await pool.connect();
      logger.info('SQL Server target connection established', connectionSummary);
      return await operation(pool);
    } catch (error) {
      if (error instanceof ValidationAppError) throw error;
      const message = driverErrorMessage(error);
      logger.error('SQL Server target operation failed', {
        ...connectionSummary,
        message,
        driverDiagnostic: driverDiagnostic(error),
      });
      throw new ValidationAppError(`SQL Server operation failed: ${message}`);
    } finally {
      await pool.close().catch(() => undefined);
    }
  }

  async testConnection(settings: Settings): Promise<StorageTargetConnectionResult> {
    return this.withPool(settings, 'master', async (pool) => {
      const result = await pool
        .request()
        .query(
          "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS version, CAST(SERVERPROPERTY('ServerName') AS nvarchar(256)) AS serverName",
        );
      const row = result.recordset?.[0] ?? {};
      const server = String(settings.server || 'SQL Server');
      const instance = String(settings.instance || '').trim();
      const port = String(settings.port || '').trim();
      return {
        ok: true as const,
        targetLabel: instance ? `${server}\\${instance}` : port ? `${server}:${port}` : server,
        serverLabel: String(row.serverName || server),
        ...(row.version ? { engineVersion: String(row.version) } : {}),
      };
    });
  }

  async listDatabases(settings: Settings): Promise<string[]> {
    return this.withPool(settings, 'master', async (pool) => {
      const result = await pool
        .request()
        .query("SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name");
      return (result.recordset ?? []).map((row) => String(row.name));
    });
  }

  async inspectDatabase(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetDatabaseStatus> {
    const name = safeDatabaseName(database);
    return this.withPool(settings, 'master', async (pool) => {
      const request = pool.request();
      request.input('name', name);
      const result = await request.query('SELECT 1 AS found FROM sys.databases WHERE name = @name');
      return { exists: Boolean(result.recordset?.length), database: name };
    });
  }

  async prepareDatabase(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetDatabaseStatus> {
    const name = safeDatabaseName(database);
    const status = await this.inspectDatabase(settings, name);
    if (status.exists) return status;
    return this.withPool(settings, 'master', async (pool) => {
      const escaped = name.replaceAll(']', ']]');
      await pool.request().query(`CREATE DATABASE [${escaped}]`);
      return { exists: true, database: name };
    });
  }

  async inspectSchema(settings: Settings, database: string): Promise<RdbmsSchemaInspection> {
    const name = safeDatabaseName(database);
    const databaseStatus = await this.inspectDatabase(settings, name);
    if (!databaseStatus.exists) {
      return schemaInspection(name, [
        {
          kind: 'create-table',
          table: '(database)',
          description: `Create database '${name}' first.`,
        },
      ]);
    }
    return this.withPool(settings, name, async (pool) => {
      const tableResult = await pool
        .request()
        .query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
      const tables = new Set((tableResult.recordset ?? []).map((row) => String(row.TABLE_NAME)));
      const columnResult = await pool
        .request()
        .query('SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS');
      const columns = new Set(
        (columnResult.recordset ?? []).map(
          (row) => `${String(row.TABLE_NAME)}.${String(row.COLUMN_NAME)}`,
        ),
      );
      const changes: RdbmsSchemaChange[] = [];
      for (const table of desiredRdbmsSchema) {
        if (!tables.has(table.name)) {
          changes.push({
            kind: 'create-table',
            table: table.name,
            description: `Create table ${table.name} for ${table.objectKey}.`,
          });
          continue;
        }
        for (const column of table.columns) {
          if (!columns.has(`${table.name}.${column.name}`)) {
            changes.push({
              kind: 'add-column',
              table: table.name,
              column: column.name,
              description: `Add column ${table.name}.${column.name}.`,
            });
          }
        }
      }
      return schemaInspection(name, changes);
    });
  }

  async prepareSchema(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetSchemaPreparationResult> {
    const name = safeDatabaseName(database);
    await this.prepareDatabase(settings, name);
    const before = await this.inspectSchema(settings, name);
    if (before.ready) return { ...before, applied: 0 };
    await this.withPool(settings, name, async (pool) => {
      const tableNames = new Set(
        before.changes
          .filter((change) => change.kind === 'create-table')
          .map((change) => change.table),
      );
      for (const table of desiredRdbmsSchema) {
        if (tableNames.has(table.name)) await pool.request().query(sqlServerCreateTable(table));
      }
      for (const change of before.changes) {
        if (change.kind !== 'add-column' || !change.column) continue;
        const table = desiredRdbmsSchema.find((entry) => entry.name === change.table);
        const column = table?.columns.find((entry) => entry.name === change.column);
        if (column) await pool.request().query(sqlServerAddColumn(change.table, column));
      }
    });
    const after = await this.inspectSchema(settings, name);
    return { ...after, applied: before.changes.length };
  }
}

function mariaDbConfig(settings: Settings, database?: string): Record<string, unknown> {
  const port = Number(settings.port || 3306);
  if (!Number.isFinite(port)) throw new ValidationAppError('Port must be a number.');
  return {
    host: required(settings, 'host', 'Host'),
    port,
    user: required(settings, 'userName', 'User name'),
    password: required(settings, 'password', 'Password'),
    ...(database ? { database } : {}),
    connectTimeout: 7_500,
    acquireTimeout: 10_000,
    ssl: settings.ssl === 'true' ? true : undefined,
  };
}

class MariaDbTargetOperations implements StorageTargetOperations {
  async withConnection<T>(
    settings: Settings,
    operation: (connection: MariaDbConnection) => Promise<T>,
    database?: string,
  ) {
    const mariadb = loadOptionalPackage('mariadb') as MariaDbModule;
    let connection: MariaDbConnection;
    try {
      connection = await mariadb.createConnection(mariaDbConfig(settings, database));
    } catch (error) {
      if (error instanceof ValidationAppError) throw error;
      throw new ValidationAppError(`MariaDB connection failed: ${driverErrorMessage(error)}`);
    }
    try {
      return await operation(connection);
    } catch (error) {
      if (error instanceof ValidationAppError) throw error;
      throw new ValidationAppError(`MariaDB operation failed: ${driverErrorMessage(error)}`);
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  async testConnection(settings: Settings): Promise<StorageTargetConnectionResult> {
    return this.withConnection(settings, async (connection) => {
      const rows = await connection.query('SELECT VERSION() AS version, @@hostname AS host');
      const row = rows?.[0] ?? {};
      const host = String(settings.host || 'MariaDB');
      const port = String(settings.port || '3306');
      return {
        ok: true as const,
        targetLabel: `${host}:${port}`,
        ...(row.host ? { serverLabel: String(row.host) } : {}),
        ...(row.version ? { engineVersion: String(row.version) } : {}),
      };
    });
  }

  async listDatabases(settings: Settings): Promise<string[]> {
    return this.withConnection(settings, async (connection) => {
      const rows = await connection.query('SHOW DATABASES');
      return (rows ?? [])
        .map((row: Record<string, unknown>) => String(Object.values(row)[0] ?? ''))
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b));
    });
  }

  async inspectDatabase(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetDatabaseStatus> {
    const name = safeDatabaseName(database);
    return this.withConnection(settings, async (connection) => {
      const rows = await connection.query(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [name],
      );
      return { exists: Boolean(rows?.length), database: name };
    });
  }

  async prepareDatabase(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetDatabaseStatus> {
    const name = safeDatabaseName(database);
    const status = await this.inspectDatabase(settings, name);
    if (status.exists) return status;
    return this.withConnection(settings, async (connection) => {
      const escaped = name.replaceAll('`', '``');
      await connection.query(`CREATE DATABASE \`${escaped}\``);
      return { exists: true, database: name };
    });
  }

  async inspectSchema(settings: Settings, database: string): Promise<RdbmsSchemaInspection> {
    const name = safeDatabaseName(database);
    const databaseStatus = await this.inspectDatabase(settings, name);
    if (!databaseStatus.exists) {
      return schemaInspection(name, [
        {
          kind: 'create-table',
          table: '(database)',
          description: `Create database '${name}' first.`,
        },
      ]);
    }
    return this.withConnection(
      settings,
      async (connection) => {
        const tablesRows = await connection.query(
          'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
          [name],
        );
        const tables = new Set((tablesRows ?? []).map((row) => String(row.TABLE_NAME)));
        const columnRows = await connection.query(
          'SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ?',
          [name],
        );
        const columns = new Set(
          (columnRows ?? []).map((row) => `${String(row.TABLE_NAME)}.${String(row.COLUMN_NAME)}`),
        );
        const changes: RdbmsSchemaChange[] = [];
        for (const table of desiredRdbmsSchema) {
          if (!tables.has(table.name)) {
            changes.push({
              kind: 'create-table',
              table: table.name,
              description: `Create table ${table.name} for ${table.objectKey}.`,
            });
            continue;
          }
          for (const column of table.columns) {
            if (!columns.has(`${table.name}.${column.name}`)) {
              changes.push({
                kind: 'add-column',
                table: table.name,
                column: column.name,
                description: `Add column ${table.name}.${column.name}.`,
              });
            }
          }
        }
        return schemaInspection(name, changes);
      },
      name,
    );
  }

  async prepareSchema(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetSchemaPreparationResult> {
    const name = safeDatabaseName(database);
    await this.prepareDatabase(settings, name);
    const before = await this.inspectSchema(settings, name);
    if (before.ready) return { ...before, applied: 0 };
    await this.withConnection(
      settings,
      async (connection) => {
        const tableNames = new Set(
          before.changes
            .filter((change) => change.kind === 'create-table')
            .map((change) => change.table),
        );
        for (const table of desiredRdbmsSchema) {
          if (tableNames.has(table.name)) await connection.query(mariaDbCreateTable(table));
        }
        for (const change of before.changes) {
          if (change.kind !== 'add-column' || !change.column) continue;
          const table = desiredRdbmsSchema.find((entry) => entry.name === change.table);
          const column = table?.columns.find((entry) => entry.name === change.column);
          if (column) await connection.query(mariaDbAddColumn(change.table, column));
        }
      },
      name,
    );
    const after = await this.inspectSchema(settings, name);
    return { ...after, applied: before.changes.length };
  }
}

class PostgreSqlTargetOperations implements StorageTargetOperations {
  async withConnection<T>(
    settings: Settings,
    operation: (connection: PostgreSqlClient) => Promise<T>,
    database = 'postgres',
  ): Promise<T> {
    const pg = loadOptionalPackage('pg') as PostgreSqlModule;
    const connection = new pg.Client(postgresqlConfig(settings, database));
    try {
      await connection.connect();
      return await operation(connection);
    } catch (error) {
      if (error instanceof ValidationAppError) throw error;
      throw new ValidationAppError(`PostgreSQL operation failed: ${driverErrorMessage(error)}`);
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  async testConnection(settings: Settings): Promise<StorageTargetConnectionResult> {
    return this.withConnection(settings, async (connection) => {
      const result = await connection.query(
        'SELECT version() AS version, current_database() AS database',
      );
      const row = result.rows?.[0] ?? {};
      const version = String(row.version || '').trim();
      return {
        ok: true as const,
        targetLabel: `${String(settings.host || 'PostgreSQL')}:${String(settings.port || '5432')}`,
        ...(version ? { engineVersion: version.replace(/^PostgreSQL\s+/i, '').split(' ')[0] } : {}),
      };
    });
  }

  async listDatabases(settings: Settings): Promise<string[]> {
    return this.withConnection(settings, async (connection) => {
      const result = await connection.query(
        'SELECT datname FROM pg_database WHERE datallowconn = true AND NOT datistemplate ORDER BY datname',
      );
      return (result.rows ?? []).map((row) => String(row.datname));
    });
  }

  async inspectDatabase(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetDatabaseStatus> {
    const name = safeDatabaseName(database);
    return this.withConnection(settings, async (connection) => {
      const result = await connection.query(
        'SELECT 1 AS found FROM pg_database WHERE datname = $1',
        [name],
      );
      return { exists: Boolean(result.rows?.length), database: name };
    });
  }

  async prepareDatabase(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetDatabaseStatus> {
    const name = safeDatabaseName(database);
    const status = await this.inspectDatabase(settings, name);
    if (status.exists) return status;
    return this.withConnection(settings, async (connection) => {
      await connection.query(`CREATE DATABASE ${quotePostgresqlIdentifier(name)}`);
      return { exists: true, database: name };
    });
  }

  async inspectSchema(settings: Settings, database: string): Promise<RdbmsSchemaInspection> {
    const name = safeDatabaseName(database);
    const databaseStatus = await this.inspectDatabase(settings, name);
    if (!databaseStatus.exists) {
      return schemaInspection(name, [
        {
          kind: 'create-table',
          table: '(database)',
          description: `Create database '${name}' first.`,
        },
      ]);
    }
    return this.withConnection(
      settings,
      async (connection) => {
        const tableResult = await connection.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        );
        const tables = new Set((tableResult.rows ?? []).map((row) => String(row.table_name)));
        const columnResult = await connection.query(
          "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
        );
        const columns = new Set(
          (columnResult.rows ?? []).map(
            (row) => `${String(row.table_name)}.${String(row.column_name)}`,
          ),
        );
        const changes: RdbmsSchemaChange[] = [];
        for (const table of desiredRdbmsSchema) {
          if (!tables.has(table.name)) {
            changes.push({
              kind: 'create-table',
              table: table.name,
              description: `Create table ${table.name} for ${table.objectKey}.`,
            });
            continue;
          }
          for (const column of table.columns) {
            if (!columns.has(`${table.name}.${column.name}`)) {
              changes.push({
                kind: 'add-column',
                table: table.name,
                column: column.name,
                description: `Add column ${table.name}.${column.name}.`,
              });
            }
          }
        }
        return schemaInspection(name, changes);
      },
      name,
    );
  }

  async prepareSchema(
    settings: Settings,
    database: string,
  ): Promise<StorageTargetSchemaPreparationResult> {
    const name = safeDatabaseName(database);
    await this.prepareDatabase(settings, name);
    const before = await this.inspectSchema(settings, name);
    if (before.ready) return { ...before, applied: 0 };
    await this.withConnection(
      settings,
      async (connection) => {
        const tableNames = new Set(
          before.changes
            .filter((change) => change.kind === 'create-table')
            .map((change) => change.table),
        );
        for (const table of desiredRdbmsSchema) {
          if (tableNames.has(table.name)) await connection.query(postgresqlCreateTable(table));
        }
        for (const change of before.changes) {
          if (change.kind !== 'add-column' || !change.column) continue;
          const table = desiredRdbmsSchema.find((entry) => entry.name === change.table);
          const column = table?.columns.find((entry) => entry.name === change.column);
          if (column) await connection.query(postgresqlAddColumn(change.table, column));
        }
      },
      name,
    );
    const after = await this.inspectSchema(settings, name);
    return { ...after, applied: before.changes.length };
  }
}

const sqlServer = new SqlServerTargetOperations();
const mariaDb = new MariaDbTargetOperations();
const postgresql = new PostgreSqlTargetOperations();

export function serverRdbmsTargetOperations(adapterId: string): StorageTargetOperations | null {
  switch (adapterId) {
    case SQL_SERVER_ADAPTER_ID:
      return sqlServer;
    case MARIADB_ADAPTER_ID:
      return mariaDb;
    case POSTGRESQL_ADAPTER_ID:
      return postgresql;
    default:
      return null;
  }
}
