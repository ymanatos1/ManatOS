import type { UiExtensionDefinition } from './registry.js';
import type { UiWorkspaceRecordMutation } from './workspace-transaction.js';

export type UiEntryPersistenceKind = 'repository' | 'return-to-caller' | 'aggregate' | 'transient';

/** Semantic contribution returned by a child editor to its immediate live owner. */
export interface UiOwnedEntryResult {
  readonly entityKey: string;
  readonly identity: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly mutation?: UiWorkspaceRecordMutation;
  /** Existing heterogeneous mutation that became semantically empty and must be removed. */
  readonly removeMutationId?: string | null;
  readonly parentMutationId?: string | null;
  /** Private resources referenced by the accepted child state. */
  readonly runtimeResources?: Readonly<Record<string, unknown>>;
}

export interface UiEntryPersistenceRequest {
  readonly entityKey: string;
  readonly mode: 'create' | 'edit' | 'view';
  readonly current: Readonly<Record<string, unknown>>;
  readonly original: Readonly<Record<string, unknown>>;
  /** Parent-owned collection drafts committed by the same entry persistence boundary. */
  readonly collections?: Readonly<
    Record<
      string,
      {
        readonly current: readonly Readonly<Record<string, unknown>>[];
        readonly original: readonly Readonly<Record<string, unknown>>[];
      }
    >
  >;
}

export interface UiEntryPersistenceResult {
  readonly status: 'persisted' | 'returned' | 'committed' | 'accepted';
  /** Authoritative semantic record after the operation. Omit when current is authoritative. */
  readonly record?: Readonly<Record<string, unknown>>;
  /** Authoritative collection rows after an aggregate commit. Omitted collections keep the submitted draft authoritative. */
  readonly collections?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
  /** Optional typed payload for a caller/aggregate completion contract. */
  readonly data?: unknown;
}

export type UiEntryReturnHandler = (
  request: UiEntryPersistenceRequest,
) => Promise<UiEntryPersistenceResult> | UiEntryPersistenceResult;

/** Trusted typed persistence implementation. Hosts/components never implement Save themselves. */
export interface UiEntryPersistenceDefinition extends UiExtensionDefinition {
  readonly kind: UiEntryPersistenceKind;
  save(request: UiEntryPersistenceRequest): Promise<UiEntryPersistenceResult>;
}

/**
 * Generic immediate-owner persistence strategy.
 *
 * A nested entry never needs to know whether its caller is an entity entry,
 * hierarchy workspace, popup workflow, or a future aggregate. Save returns the
 * complete semantic entry draft to the caller supplied by the invocation/owner.
 * The caller decides whether to stage it again or cross an ultimate repository
 * boundary. This keeps editing ownership orthogonal to persistence destination.
 */
export const returnToCallerPersistence = (
  id: string,
  returnToCaller: UiEntryReturnHandler,
): UiEntryPersistenceDefinition => ({
  id,
  contractVersion: 1,
  kind: 'return-to-caller',
  save: async (request) => {
    const result = await returnToCaller(request);
    if (result.status !== 'returned') {
      throw new Error(
        `Return-to-caller persistence '${id}' must return status 'returned', not '${result.status}'.`,
      );
    }
    return result;
  },
});
