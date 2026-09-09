import type { CommandRuntime } from '../commands/command-runtime.js';
import type { EntityListDefinition, EntityListSnapshot } from '../list/entity-list-contracts.js';
import { EntityListRuntime } from '../list/entity-list-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';
import type { SurfaceResult } from '../surface/result-contracts.js';

/**
 * Host-neutral content runtime for an Entry Selector surface.
 *
 * The selector does not implement a second list state machine. Search, filters,
 * sort, paging and selection are delegated to the exact EntityListRuntime used
 * by a normal list surface; this wrapper owns only selector completion/cancel.
 */
export class EntrySelectorRuntime<T extends Readonly<Record<string, unknown>>> {
  readonly list: EntityListRuntime<T>;
  readonly #idField: string;

  constructor(
    readonly surface: SurfaceContext,
    readonly commands: CommandRuntime,
    definition: EntityListDefinition<T>,
  ) {
    if (surface.host !== 'popup' || surface.kind !== 'selector') {
      throw new Error(`EntrySelectorRuntime requires a popup selector surface: ${surface.id}`);
    }
    if (definition.selectionMode === 'none') {
      throw new Error('EntrySelectorRuntime requires single or multiple EntityList selection.');
    }
    this.#idField = definition.idField;
    this.list = new EntityListRuntime(definition);
  }

  get snapshot(): EntityListSnapshot<T> {
    return this.list.snapshot;
  }

  async load(): Promise<EntityListSnapshot<T>> {
    return this.list.load();
  }

  /** Complete the child surface with one canonical host-neutral SurfaceResult. */
  async select(): Promise<SurfaceResult> {
    const records = this.list.selectedEntries();
    if (!records.length) throw new Error('Entry selector cannot complete without a selection.');

    const multiple = this.surface.invocation.selectionMode === 'multiple';
    const value = multiple
      ? records.map((record) => record[this.#idField])
      : records[0]?.[this.#idField];
    const result = await this.commands.execute({
      name: 'surface.close',
      surfaceId: this.surface.id,
      payload: {
        result: {
          outcome: 'selected',
          value,
          ...(multiple ? { metadata: { records } } : { record: records[0] }),
        },
      },
    });
    if (!result.surfaceResult) throw new Error('Entry selector did not produce a SurfaceResult.');
    return result.surfaceResult;
  }

  async cancel(): Promise<SurfaceResult> {
    const result = await this.commands.execute({
      name: 'surface.close',
      surfaceId: this.surface.id,
      payload: { result: { outcome: 'cancelled' } },
    });
    if (!result.surfaceResult) throw new Error('Entry selector did not produce a SurfaceResult.');
    return result.surfaceResult;
  }
}
