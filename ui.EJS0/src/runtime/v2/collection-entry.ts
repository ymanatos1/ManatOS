import type { SysBOFieldMetadata } from '@manatos/shared/metadata/bo';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';

import type { UiEntrySaveResult } from './entry-action.js';
import { returnToCallerPersistence } from './entry-persistence.js';
import { EntityEntrySurface } from './entity-entry-surface.js';
import type { UiCtxObject } from './ui-context.js';
import type { UiRuntime } from './ui-runtime.js';

export interface EmbeddedCollectionEntryOptions {
  readonly childId: string;
  readonly collectionKey: string;
  readonly entityKey: string;
  readonly uiMetadata: SysBOUIMetadata;
  readonly fieldMetadata: Readonly<Record<string, SysBOFieldMetadata>>;
  readonly mode: 'create' | 'edit';
  readonly rowIndex?: number;
  readonly initialRecord: Readonly<Record<string, unknown>>;
  readonly requestedView?: string | null;
}

/**
 * One local embedded member editor beneath an owning entity entry.
 *
 * The child owns its own UiLevel/CTX and field draft, but Save returns the
 * resulting record to the parent's canonical collection draft. It never owns
 * repository persistence. Cancel/close therefore discards only the child draft.
 */
export class EmbeddedCollectionEntrySession {
  #closed = false;

  private constructor(
    readonly runtime: UiRuntime,
    readonly owner: EntityEntrySurface,
    readonly options: EmbeddedCollectionEntryOptions,
    readonly surface: EntityEntrySurface,
  ) {}

  static open(
    runtime: UiRuntime,
    owner: EntityEntrySurface,
    options: EmbeddedCollectionEntryOptions,
  ): EmbeddedCollectionEntrySession {
    if (owner.lifecycle === 'created' || owner.lifecycle === 'disposed') {
      throw new Error('Embedded collection entries require a prepared live owner.');
    }
    if (owner.level.children.size > 0) {
      throw new Error(`Entity entry '${owner.entityKey}' already owns a nested UI level.`);
    }
    if (options.mode === 'edit') {
      const index = options.rowIndex;
      if (
        index === undefined ||
        index < 0 ||
        index >= owner.collection(options.collectionKey).current().length
      ) {
        throw new Error(
          `Collection '${options.collectionKey}' requires a valid row index for edit.`,
        );
      }
    }

    // This is the deliberate kernel-level composition exception to UiRuntime.open():
    // the embedded member editor is not a separately mounted browser surface. Its
    // owner already has the canonical metadata/data and synchronously prepares the
    // child CTX, so there is no host adapter or asynchronous presentation boundary
    // to resolve. All externally/browser-mounted surfaces must use UiRuntime.open().
    const childValue: UiCtxObject = {
      control: { presentation: {} },
      data: { entry: {}, fields: {}, collections: {} },
      state: { lifecycle: 'created', active: false },
    };
    owner.context.replace('level', childValue, { source: 'collection-entry:open' });
    const childContext = owner.context.child('level');
    if (!childContext) throw new Error('Embedded collection entry CTX could not be created.');

    const childLevel = runtime.adoptChild(
      owner.level,
      options.childId,
      {
        surface: 'entity-entry',
        host: 'embedded',
        entity: options.entityKey,
        mode: options.mode,
        ...(options.requestedView ? { view: options.requestedView } : {}),
        parameters: { ownerCollection: options.collectionKey },
        behavior: { closePolicy: { dirty: 'discard' } },
      },
      childContext,
    );

    const collection = owner.collection(options.collectionKey);
    const persistence = returnToCallerPersistence('embedded-collection-return', (request) => {
      if (options.mode === 'create') {
        collection.add(request.current, 'collection-entry:return-create');
      } else {
        const index = options.rowIndex!;
        collection.update(
          (_row, candidateIndex) => candidateIndex === index,
          request.current,
          'collection-entry:return-edit',
        );
      }
      return { status: 'returned', record: request.current };
    });
    const surface = new EntityEntrySurface(childLevel, childContext, {
      entityKey: options.entityKey,
      mode: options.mode,
      uiMetadata: options.uiMetadata,
      initialRecord: options.initialRecord,
      fieldMetadata: options.fieldMetadata,
      ...(options.requestedView !== undefined ? { requestedView: options.requestedView } : {}),
      persistence,
    });
    surface.prepare();
    surface.activate();
    runtime.activate(childLevel, 'collection-entry');
    return new EmbeddedCollectionEntrySession(runtime, owner, options, surface);
  }

  /** Open an editor for the authoritative row currently owned by the parent draft. */
  static edit(
    runtime: UiRuntime,
    owner: EntityEntrySurface,
    options: Omit<EmbeddedCollectionEntryOptions, 'mode' | 'initialRecord'> & {
      readonly rowIndex: number;
    },
  ): EmbeddedCollectionEntrySession {
    const row = owner.collection(options.collectionKey).current()[options.rowIndex];
    if (!row) {
      throw new Error(`Collection '${options.collectionKey}' requires a valid row index for edit.`);
    }
    return EmbeddedCollectionEntrySession.open(runtime, owner, {
      ...options,
      mode: 'edit',
      initialRecord: row,
    });
  }

  /** Open a new local member editor; persistence remains owned by the parent entry. */
  static create(
    runtime: UiRuntime,
    owner: EntityEntrySurface,
    options: Omit<EmbeddedCollectionEntryOptions, 'mode' | 'rowIndex' | 'initialRecord'> & {
      readonly initialRecord?: Readonly<Record<string, unknown>>;
    },
  ): EmbeddedCollectionEntrySession {
    return EmbeddedCollectionEntrySession.open(runtime, owner, {
      ...options,
      mode: 'create',
      initialRecord: options.initialRecord ?? {},
    });
  }

  get closed(): boolean {
    return this.#closed;
  }

  async save(): Promise<UiEntrySaveResult> {
    this.#assertOpen();
    const result = await this.surface.save();
    if (
      result.status === 'saved' ||
      (result.status === 'unchanged' && this.options.mode === 'edit')
    ) {
      await this.#close('collection-entry:save');
    }
    return result;
  }

  async cancel(): Promise<void> {
    this.#assertOpen();
    await this.#close('collection-entry:cancel');
  }

  async #close(source: string): Promise<void> {
    const result = await this.runtime.requestClose(this.surface.level, {
      source,
      dispose: () => this.surface.dispose(),
    });
    if (result.status !== 'closed') {
      throw new Error(`Embedded collection entry closure was rejected: ${result.status}.`);
    }
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('Embedded collection entry is already closed.');
  }
}
