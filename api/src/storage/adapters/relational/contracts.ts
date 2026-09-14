/**
 * Internal relational-family contracts.
 *
 * These are deliberately not exported to System Settings/UI. SQL Server,
 * MariaDB and future relational engines will compose the common relational
 * implementation through dialect/connection components rather than expose a
 * family choice to administrators.
 */
export interface RdbmsConnectionSettings {
  database: string;
}

export interface RdbmsDialect {
  readonly id: string;
  quoteIdentifier(identifier: string): string;
  parameter(index: number): string;
}

export interface RdbmsConnectionFactory<TConnection = unknown> {
  connect(settings: Readonly<Record<string, string>>): Promise<TConnection>;
  close(connection: TConnection): Promise<void>;
}
