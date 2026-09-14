import type { StorageTargetOperations } from '../../target-operations.js';
import { SQLITE_ADAPTER_ID } from './embedded-rdbms/sqlite/definition.js';
import { sqliteTargetOperations } from './embedded-rdbms/sqlite/target-operations.js';
import { serverRdbmsTargetOperations } from './server-rdbms/target-operations.js';

/** Resolve target operations across the relational family hierarchy. */
export function relationalTargetOperations(adapterId: string): StorageTargetOperations | null {
  if (adapterId === SQLITE_ADAPTER_ID) return sqliteTargetOperations;
  return serverRdbmsTargetOperations(adapterId);
}
