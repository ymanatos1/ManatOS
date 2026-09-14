import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ValidationAppError } from '@manatos/shared';

import type {
  StorageTargetConnectionResult,
  StorageTargetDatabaseStatus,
  StorageTargetOperations,
  StorageTargetSchemaPreparationResult,
} from '../../../../target-operations.js';
import {
  desiredRdbmsSchema,
  MANATOS_RDBMS_SCHEMA_VERSION,
  type RdbmsDesiredColumn,
  type RdbmsSchemaChange,
  type RdbmsSchemaInspection,
} from '../../desired-schema.js';

type Settings = Readonly<Record<string, string>>;

function databasePath(settings: Settings): string {
  const value = String(settings.filePath ?? '').trim();
  if (!value) throw new ValidationAppError('SQLite database file is required.');
  return resolve(value);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqliteType(column: RdbmsDesiredColumn): string {
  switch (column.fieldType) {
    case 'boolean':
    case 'number':
      return 'NUMERIC';
    case 'date':
    case 'datetime':
    case 'guid':
    case 'reference':
    case 'string':
    case 'email':
    case 'telephone':
    case 'enum':
    default:
      return 'TEXT';
  }
}

function createTableSql(table: (typeof desiredRdbmsSchema)[number]): string {
  const columns = table.columns.map((column) => {
    const primary = column.name === 'id' ? ' PRIMARY KEY' : '';
    const nullable = column.required ? ' NOT NULL' : '';
    return `${quoteIdentifier(column.name)} ${sqliteType(column)}${nullable}${primary}`;
  });
  return `CREATE TABLE ${quoteIdentifier(table.name)} (${columns.join(', ')})`;
}

function addColumnSql(table: string, column: RdbmsDesiredColumn): string {
  const nullable = column.required ? ' NOT NULL' : '';
  return `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column.name)} ${sqliteType(column)}${nullable}`;
}

function inspection(filePath: string, changes: RdbmsSchemaChange[]): RdbmsSchemaInspection {
  const ready = changes.length === 0;
  return {
    ready,
    database: filePath,
    desiredVersion: MANATOS_RDBMS_SCHEMA_VERSION,
    changes,
    message: ready
      ? `SQLite database '${filePath}' is ready for the current ManatOS relational schema.`
      : `${changes.length} schema change${changes.length === 1 ? '' : 's'} required before '${filePath}' is ready.`,
  };
}

async function openDatabase<T>(settings: Settings, action: (db: DatabaseSync, path: string) => T) {
  const path = databasePath(settings);
  await mkdir(dirname(path), { recursive: true });
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys = ON');
    return action(db, path);
  } catch (error) {
    if (error instanceof ValidationAppError) throw error;
    throw new ValidationAppError(
      `SQLite operation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    db?.close();
  }
}

class SqliteTargetOperations implements StorageTargetOperations {
  async testConnection(settings: Settings): Promise<StorageTargetConnectionResult> {
    return openDatabase(settings, (db, path) => {
      const version = db.prepare('SELECT sqlite_version() AS version').get() as
        { version?: unknown } | undefined;
      const engineVersion = String(version?.version ?? '').trim();
      return {
        ok: true,
        targetLabel: path,
        ...(engineVersion ? { engineVersion } : {}),
      };
    });
  }

  async listDatabases(settings: Settings): Promise<string[]> {
    return [databasePath(settings)];
  }

  async inspectDatabase(settings: Settings): Promise<StorageTargetDatabaseStatus> {
    const path = databasePath(settings);
    return { exists: true, database: path };
  }

  async prepareDatabase(settings: Settings): Promise<StorageTargetDatabaseStatus> {
    return openDatabase(settings, (_db, path) => ({ exists: true, database: path }));
  }

  async inspectSchema(settings: Settings): Promise<RdbmsSchemaInspection> {
    return openDatabase(settings, (db, path) => {
      const tableRows = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name?: unknown }>;
      const tables = new Set(tableRows.map((row) => String(row.name ?? '')));
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
        const columns = new Set(
          (
            db.prepare(`PRAGMA table_info(${quoteIdentifier(table.name)})`).all() as Array<{
              name?: unknown;
            }>
          ).map((row) => String(row.name ?? '')),
        );
        for (const column of table.columns) {
          if (!columns.has(column.name)) {
            changes.push({
              kind: 'add-column',
              table: table.name,
              column: column.name,
              description: `Add column ${table.name}.${column.name}.`,
            });
          }
        }
      }
      return inspection(path, changes);
    });
  }

  async prepareSchema(settings: Settings): Promise<StorageTargetSchemaPreparationResult> {
    const before = await this.inspectSchema(settings);
    if (before.ready) return { ...before, applied: 0 };
    await openDatabase(settings, (db) => {
      db.exec('BEGIN');
      try {
        const createTables = new Set(
          before.changes
            .filter((change) => change.kind === 'create-table')
            .map((change) => change.table),
        );
        for (const table of desiredRdbmsSchema) {
          if (createTables.has(table.name)) db.exec(createTableSql(table));
        }
        for (const change of before.changes) {
          if (change.kind !== 'add-column' || !change.column) continue;
          const table = desiredRdbmsSchema.find((entry) => entry.name === change.table);
          const column = table?.columns.find((entry) => entry.name === change.column);
          if (column) db.exec(addColumnSql(change.table, column));
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
    const after = await this.inspectSchema(settings);
    return { ...after, applied: before.changes.length };
  }
}

export const sqliteTargetOperations = new SqliteTargetOperations();
