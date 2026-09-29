# Entity Entries and Forms — Detailed Runtime Model

This document supplements [Entity Entries](Entity-Entries.md) with the mechanics that matter when extending/debugging the generic runtime.

## Ownership layers

An entry combines several authorities without duplicating them:

| Concern                                  | Owner                                        |
| ---------------------------------------- | -------------------------------------------- |
| Canonical entity/field semantics         | entity metadata                              |
| Presentation/layout/invocation overrides | UI metadata + invocation                     |
| Current semantic field value             | CTX entry/field runtime                      |
| Original committed baseline              | entry baseline owner                         |
| Expression-derived state                 | evaluator/reactive runtime, projected to CTX |
| Private editor mechanics                 | field/component implementation               |
| Aggregate draft (when applicable)        | owning component/workspace                   |
| Authorization                            | API policy/capability projection             |
| Persistence                              | API/service/storage layers                   |

A regression usually appears when one layer starts maintaining a second authoritative copy of another layer's state.

## Initialization

Existing entries load an authoritative server record and seed each `fields.<key>.value` together with its `fields.<key>.originalValue` baseline. `entry.current` and `entry.original` expose read-only record projections over that authoritative field state. New entries seed current field values from canonical defaults plus allowed invocation-projected fixed/default values; they do not introduce a second mutable current-record owner.

Older `dataCurrent` / `dataOriginal` terminology describes the conceptual working/baseline records from the V1-to-V2 migration. It must not be interpreted as current V2 CTX node names or parallel authorities.

Initialization bookkeeping is lifecycle/runtime state, not business-semantic CTX merely because the UI needs to know whether setup completed.

## Field state

Each field runtime can expose the current/baseline value plus derived interaction state such as validation, readonly and visibility. Browser mutation routes through one canonical field owner so DOM listeners, calculations and programmatic changes converge on the same path.

Programmatic CTX updates must project back into components; the runtime must not rely solely on native HTML `change` events.

## Dirty aggregation

Scalar dirty state is the comparison of current versus baseline semantic values. Aggregate components can independently contribute dirty state:

```text
entry dirty =
    scalar field dirty
 OR collection-editor draft dirty
 OR hierarchy-workspace dirty
 OR other registered aggregate contributor
```

This allows Save/Cancel/close protection to reason about the complete transaction.

## Reactive recalculation

A mutation invalidates dependent expression-backed values/state. Recalculation is ordered/deduplicated by the reactive runtime and resulting canonical values are projected to field components. Transient evaluator operands remain invocation-local rather than becoming shared mutable scope.

## Save reconciliation

On a successful save, the returned server record becomes authoritative. Entry field values and baselines are reconciled in place so the active UI remains consistent without constructing a second hidden form state.

Persisted calculations, audit values and application-managed fields can therefore update the visible entry and baseline even if the browser did not originate those exact final values.

## Hosted entries

An entry can be hosted as a page, popup or embedded level. `host` does not alter entry semantics. Popup invocation/fixed-value rules are read from the owning CTX surface contract, not hidden form transport.

Nested selectors or related-entry popups become child UI levels and are disposed with their own lifecycle.

## Discard, continuation drafts and outage recovery

Ordinary entry closure does not persist unsaved work as a resumable browser draft. Dirty cancellation can offer Save or Discard; only Save crosses the API persistence boundary, while Discard abandons the transaction.

Two deliberately separate mechanisms must not be generalized into that normal lifecycle:

1. **Create Organization continuation draft** — the hierarchy create workspace may persist its unfinished graph across normal navigation/closure. Edit Organization does not.
2. **Abnormal outage recovery** — on detected system unavailability, the workspace-recovery runtime captures recoverable user changes/UI descriptors to IndexedDB before gentle disposal, then can reconstruct/reapply them after recovery.

Neither mechanism changes API/storage authority: browser-local state is not committed business data. See [Persistence, Commit, Discard and Recovery](Persistence-Commit-and-Recovery.md).

## Failure behavior

Validation failures retain the user's working state and surface field/entry errors. Transport/server failures do not commit the baseline. Retriable popup actions use the normal popup action contract rather than mutable global callbacks.

## Testing implications

Generic entry changes should cover:

- new and existing records;
- direct DOM and programmatic CTX mutation;
- calculated/defaulted fields;
- save reconciliation;
- nested selectors/popups;
- aggregate dirty contributors;
- authorization-driven actions;
- cancellation/draft/outage-recovery boundaries when affected;
- multiple entities, to prevent accidental entity-specific implementation.
