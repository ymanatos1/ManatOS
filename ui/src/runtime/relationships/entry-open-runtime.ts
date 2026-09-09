import type { CommandRuntime } from '../commands/command-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';
import type { SurfaceResult } from '../surface/result-contracts.js';
import {
  EntityEntryRuntime,
  type EntityEntryRuntimeOptions,
} from '../state/entity-entry-runtime.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';
import type { EntryInitialization } from '../state/entry-state-runtime.js';

export interface EntryOpenRuntimeOptions extends Omit<
  EntityEntryRuntimeOptions,
  'surface' | 'surfaces'
> {
  readonly surface: SurfaceContext;
  readonly surfaces: SurfaceRuntime;
  readonly commands: CommandRuntime;
}

export interface EntryOpenSaveResult {
  readonly record: Readonly<Record<string, unknown>>;
  readonly value?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Save-and-continue is a legitimate entry operation. In that case the popup
   * remains open but still returns the same host-neutral SurfaceResult shape to
   * its caller. Save-and-close uses the canonical surface.close command.
   */
  readonly close?: boolean;
}

/**
 * Host-neutral semantic wrapper for an entry opened in a popup.
 *
 * This class intentionally owns no field, calculation, validation or aggregate
 * entry state of its own. All entry behavior is the accepted EntityEntryRuntime;
 * this wrapper only adds child-surface completion semantics for popup callers.
 */
export class EntryOpenRuntime {
  readonly entry: EntityEntryRuntime;

  constructor(readonly options: EntryOpenRuntimeOptions) {
    const { surface } = options;
    if (surface.host !== 'popup' || surface.kind !== 'entry') {
      throw new Error(`EntryOpenRuntime requires a popup entry surface: ${surface.id}`);
    }
    if (!['create', 'edit', 'view'].includes(surface.mode)) {
      throw new Error(`EntryOpenRuntime does not support entry mode ${surface.mode}.`);
    }

    this.entry = new EntityEntryRuntime(options);
  }

  initialize(initialization: EntryInitialization = {}): void {
    this.entry.initialize(initialization);
  }

  /**
   * Complete a successful persistence operation and return one generic result.
   * The caller-provided record is the canonical server result, not a DOM/model
   * reconstruction performed by the popup host.
   */
  async completeSave(completion: EntryOpenSaveResult): Promise<SurfaceResult> {
    if (this.options.surface.mode === 'view') {
      throw new Error('A view-only V2 entry popup cannot save.');
    }

    this.entry.aggregate.completeSave();
    const result = this.#result('saved', {
      ...(completion.value !== undefined ? { value: completion.value } : {}),
      record: completion.record,
      ...(completion.metadata ? { metadata: completion.metadata } : {}),
    });

    if (completion.close === false) return result;
    return this.#close(result);
  }

  async completeDelete(
    value?: unknown,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<SurfaceResult> {
    if (this.options.surface.mode === 'create' || this.options.surface.mode === 'view') {
      throw new Error(`A ${this.options.surface.mode} V2 entry popup cannot delete.`);
    }

    this.entry.aggregate.completeDelete();
    return this.#close(
      this.#result('deleted', {
        ...(value !== undefined ? { value } : {}),
        ...(metadata ? { metadata } : {}),
      }),
    );
  }

  async cancel(): Promise<SurfaceResult> {
    return this.#close(this.#result('cancelled'));
  }

  async close(): Promise<SurfaceResult> {
    return this.#close(this.#result('closed'));
  }

  dispose(): void {
    this.entry.dispose();
  }

  #result(
    outcome: SurfaceResult['outcome'],
    detail: Omit<SurfaceResult, 'surfaceId' | 'outcome'> = {},
  ): SurfaceResult {
    return Object.freeze({
      outcome,
      surfaceId: this.options.surface.id,
      ...detail,
    });
  }

  async #close(result: SurfaceResult): Promise<SurfaceResult> {
    const command = await this.options.commands.execute({
      name: 'surface.close',
      surfaceId: this.options.surface.id,
      payload: {
        result: {
          outcome: result.outcome,
          ...(result.value !== undefined ? { value: result.value } : {}),
          ...(result.record ? { record: result.record } : {}),
          ...(result.metadata ? { metadata: result.metadata } : {}),
        },
      },
    });
    if (!command.surfaceResult) throw new Error('Entry popup did not produce a SurfaceResult.');
    return command.surfaceResult;
  }
}
