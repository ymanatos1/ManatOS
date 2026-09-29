import type { ManatOSObjectMetadata } from '@manatos/shared/metadata/bo';

import { returnToCallerPersistence } from './entry-persistence.js';
import type { EntityEntrySurface } from './entity-entry-surface.js';
import type { UiOwnerEntryAddress, UiOwnerSurfaceProvider } from './surface-providers.js';

export interface OwnedEntryPersistenceOptions {
  readonly entry: EntityEntrySurface;
  readonly owner: UiOwnerSurfaceProvider;
  readonly metadata: ManatOSObjectMetadata<Record<string, unknown>>;
  readonly parent?: UiOwnerEntryAddress | null;
}

/** Local persistence strategy: Entry exports itself; its ultimate Owner accepts it. */
export const ownedEntryPersistence = (options: OwnedEntryPersistenceOptions) =>
  returnToCallerPersistence('owned-entry-return', (request) => {
    const transfer = options.entry.exportEntry();
    const result = options.owner.saveEntry(
      transfer,
      request,
      options.metadata,
      options.parent ?? null,
    );
    return {
      status: 'returned' as const,
      record: result.record,
      ...(request.collections
        ? {
            collections: Object.fromEntries(
              Object.entries(request.collections).map(([key, value]) => [key, value.current]),
            ),
          }
        : {}),
      data: result,
    };
  });
