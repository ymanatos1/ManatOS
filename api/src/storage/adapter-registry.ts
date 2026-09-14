import { ValidationAppError } from '@manatos/shared';

import type {
  StorageAdapterDefinition,
  StorageAdapterSourceDefinition,
} from './adapter-definition.js';
import { resolveStorageCapabilities, storageFamilyPath } from './capabilities.js';
import { resolveStorageBehaviorStrategies } from './behavior-contract.js';
import { inMemoryJsonAdapterDefinition } from './adapters/in-memory-json/definition.js';
import { sqliteAdapterDefinition } from './adapters/relational/embedded-rdbms/sqlite/definition.js';
import { mariaDbAdapterDefinition } from './adapters/relational/server-rdbms/mariadb/definition.js';
import { postgresqlAdapterDefinition } from './adapters/relational/server-rdbms/postgresql/definition.js';
import { sqlServerAdapterDefinition } from './adapters/relational/server-rdbms/sql-server/definition.js';

const sources: readonly StorageAdapterSourceDefinition[] = Object.freeze([
  inMemoryJsonAdapterDefinition,
  sqlServerAdapterDefinition,
  mariaDbAdapterDefinition,
  postgresqlAdapterDefinition,
  sqliteAdapterDefinition,
]);

const definitions: readonly StorageAdapterDefinition[] = Object.freeze(
  sources.map((source) => {
    const { capabilityOverrides, ...definition } = source;
    return Object.freeze({
      ...definition,
      familyPath: storageFamilyPath(source.familyId),
      capabilities: resolveStorageCapabilities(
        source.familyId,
        source.id,
        source.name,
        capabilityOverrides,
      ),
    });
  }),
);

/** Registry resolves concrete adapters from canonical family/runtime metadata. */
export class StorageAdapterRegistry {
  all(): readonly StorageAdapterDefinition[] {
    return definitions;
  }

  get(adapterId: string): StorageAdapterDefinition {
    const definition = definitions.find((entry) => entry.id === adapterId);
    if (!definition) throw new ValidationAppError(`Unknown storage adapter '${adapterId}'.`);
    return definition;
  }

  /** Effective invariant-behavior implementation strategy for one adapter. */
  behaviorStrategies(adapterId: string) {
    return resolveStorageBehaviorStrategies(this.get(adapterId));
  }
}

export const storageAdapterRegistry = new StorageAdapterRegistry();
