/**
 * Temporary, schema-agnostic transfer value for exactly one Entry.
 *
 * This DTO is never an owner of state. A provider creates it from its canonical
 * surface #data and the receiving provider immediately imports it into its own
 * canonical #data. Resource values are keyed by the same opaque ids referenced
 * by field values (picture GUIDs today; arbitrary resources in the future).
 */
export interface UiEntryTransferDto {
  readonly entityKey: string;
  readonly identity: string;
  readonly identityField: string;
  readonly current: Readonly<Record<string, unknown>>;
  readonly original: Readonly<Record<string, unknown>> | null;
  readonly resources: Readonly<Record<string, unknown>>;
}

export interface UiEntrySurfaceProvider {
  exportEntry(identityField?: string): UiEntryTransferDto;
  importEntry(transfer: UiEntryTransferDto): void;
  resource<T = unknown>(key: string): T | undefined;
  acceptResource(key: string, value: unknown): void;
  resources(): Readonly<Record<string, unknown>>;
}

export interface UiOwnerEntryAddress {
  readonly entityKey: string;
  readonly identity: string;
}

/** Owner-domain record overlay. It exposes no workspace-transaction representation. */
export interface UiOwnerEntryProjection {
  readonly identity: string;
  readonly current: Readonly<Record<string, unknown>> | null;
  readonly deleted: boolean;
}

export interface UiOwnerSurfaceProvider {
  provideEntry(entityKey: string, identity: string): UiEntryTransferDto;
  provideEntryIfPresent(entityKey: string, identity: string): UiEntryTransferDto | null;
  canOwnEntity(entityKey: string): boolean;
  subscribeChanges(listener: () => void): () => void;
  queryEntries(entityKey: string): readonly UiOwnerEntryProjection[];
  /** Document-boundary continuation only; never a live Entry/Owner data channel. */
  continuationFormStateSnapshot(): Readonly<Record<string, unknown>>;
  saveEntry(
    transfer: UiEntryTransferDto,
    request: import('./entry-persistence.js').UiEntryPersistenceRequest,
    metadata: import('@manatos/shared/metadata/bo').ManatOSObjectMetadata<Record<string, unknown>>,
    parent?: UiOwnerEntryAddress | null,
  ): import('./entry-persistence.js').UiOwnedEntryResult;
}

export const cloneEntryTransfer = (transfer: UiEntryTransferDto): UiEntryTransferDto => ({
  entityKey: transfer.entityKey,
  identity: transfer.identity,
  identityField: transfer.identityField,
  current: structuredClone(transfer.current),
  original: transfer.original ? structuredClone(transfer.original) : null,
  resources: structuredClone(transfer.resources),
});
