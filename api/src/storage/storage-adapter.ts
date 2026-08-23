/**
 * Result returned when the active storage adapter is explicitly flushed.
 */
export interface StorageFlushResult {
  provider: string;

  persistence: string;

  flushed: boolean;

  timestamp: string;

  details?: string;
}

/**
 * Common capabilities expected from a storage adapter.
 *
 * This interface can expand as SQL/PostgreSQL/etc. adapters are added.
 */
export interface StorageAdapter {
  /**
   * Explicitly flush any pending in-memory/storage state to the
   * adapter's durable persistence mechanism where applicable.
   *
   * For a traditional transactional database this may be a no-op
   * because writes are already durable.
   */
  flush(): Promise<StorageFlushResult>;
}
