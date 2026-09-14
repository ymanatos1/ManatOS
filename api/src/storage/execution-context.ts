import { apiContextRuntime } from '../context/api-context-runtime.js';
import { storageAdapterRegistry } from './adapter-registry.js';
import { resolveStorageBehaviorStrategies } from './behavior-contract.js';

export interface StorageExecutionResources {
  readonly storage: {
    readonly adapterId: string;
    readonly familyId: string;
    readonly capabilities: ReturnType<typeof storageAdapterRegistry.get>['capabilities'];
    readonly behaviors: ReturnType<typeof resolveStorageBehaviorStrategies>;
  };
}

/**
 * Add a STORAGE level when execution belongs to an HTTP API call.
 * Background/bootstrap work still executes normally without manufacturing a
 * synthetic request context.
 */
export async function runStorageOperation<T>(
  adapterId: string,
  operation: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!apiContextRuntime.currentPath()) return await fn();

  const adapter = storageAdapterRegistry.get(adapterId);
  const resources: StorageExecutionResources = {
    storage: {
      adapterId: adapter.id,
      familyId: adapter.familyId,
      capabilities: adapter.capabilities,
      behaviors: resolveStorageBehaviorStrategies(adapter),
    },
  };

  return apiContextRuntime.runLevel(
    {
      name: `STORAGE · ${operation}`,
      diagnosticGroup: 'storage',
      resources: resources as unknown as Record<string, unknown>,
    },
    fn,
  );
}
