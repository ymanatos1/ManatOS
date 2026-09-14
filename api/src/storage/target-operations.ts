import type { RdbmsSchemaInspection } from './adapters/relational/desired-schema.js';

export interface StorageTargetConnectionResult {
  ok: true;
  /** Configured endpoint the Admin actually tested (host/server + optional port/instance). */
  targetLabel: string;
  /** Optional engine-reported host/server identity; diagnostic only. */
  serverLabel?: string;
  engineVersion?: string;
}

export interface StorageTargetDatabaseStatus {
  exists: boolean;
  database: string;
}

export interface StorageTargetSchemaPreparationResult extends RdbmsSchemaInspection {
  applied: number;
}

/**
 * Administrative operations against a prospective storage target.
 *
 * These sessions are deliberately independent from the active business store:
 * an Admin can inspect/provision SQL Server or MariaDB while ManatOS itself is
 * still running on JSON (or on some other future provider).
 */
export interface StorageTargetOperations {
  testConnection(
    settings: Readonly<Record<string, string>>,
  ): Promise<StorageTargetConnectionResult>;
  listDatabases(settings: Readonly<Record<string, string>>): Promise<string[]>;
  inspectDatabase(
    settings: Readonly<Record<string, string>>,
    database: string,
  ): Promise<StorageTargetDatabaseStatus>;
  prepareDatabase(
    settings: Readonly<Record<string, string>>,
    database: string,
  ): Promise<StorageTargetDatabaseStatus>;
  inspectSchema(
    settings: Readonly<Record<string, string>>,
    database: string,
  ): Promise<RdbmsSchemaInspection>;
  prepareSchema(
    settings: Readonly<Record<string, string>>,
    database: string,
  ): Promise<StorageTargetSchemaPreparationResult>;
}
