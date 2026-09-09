export interface EntryAggregatePolicyInput {
  readonly mode: string;
  readonly fieldDirty: boolean;
  readonly fieldValid: boolean;
  readonly contributorDirty?: boolean;
  readonly contributorValid?: boolean;
  readonly blocked?: boolean;
  readonly loading?: boolean;
  readonly saving?: boolean;
  readonly deleting?: boolean;
}

export interface EntryAggregatePolicyState {
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly blocked: boolean;
  readonly saveReady: boolean;
}

/** Canonical pure predicate for aggregate entry persistence readiness. */
export function calculateEntryAggregatePolicy(
  input: EntryAggregatePolicyInput,
): EntryAggregatePolicyState {
  const dirty = input.fieldDirty || input.contributorDirty === true;
  const valid = input.fieldValid && input.contributorValid !== false;
  const blocked = input.blocked === true;
  const saveReady =
    dirty &&
    valid &&
    !blocked &&
    input.loading !== true &&
    input.saving !== true &&
    input.deleting !== true &&
    input.mode !== 'view';
  return { dirty, valid, blocked, saveReady };
}
