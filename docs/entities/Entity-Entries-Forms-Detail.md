# Entity Entries and Forms — Detailed Runtime Model

This document supplements [Entity Entries](Entity-Entries.md) with the mechanics that matter when extending/debugging the generic runtime.

## Ownership layers

An entry combines several authorities without duplicating them:

| Concern | Owner |
| --- | --- |
| Canonical entity/field semantics | entity metadata |
| Presentation/layout/invocation overrides | UI metadata + invocation |
| Current semantic field value | modern UIS Entry `#data.current` (via `EntryRuntime.setField()`) |
| Original committed baseline | Entry `#data.original` |
| Expression-derived state | evaluator/reactive runtime, projected to CTX |
| Private editor mechanics | field/component implementation |
| Aggregate draft (when applicable) | owning component/workspace |
| Authorization | API policy/capability projection |
| Persistence | API/service/storage layers |

A regression usually appears when one layer starts maintaining a second authoritative copy of another layer's state.

## Initialization

Existing entries load the server record into the modern Entry level’s `#data.original` baseline and `#data.current` working record. A new Entry constructs the working record from canonical defaults and invocation-projected values. The runtime also uses private TypeScript initialization objects; these are not competing CTX records.

Initialization bookkeeping is lifecycle/runtime state, not business-semantic CTX merely because the UI needs to know whether setup completed.

## Field state

Each field component consumes current record values and can expose derived interaction state such as validation, readonly and visibility under `#state.fields`. It does not own another mutable copy of the Entry record. Browser mutation routes through one canonical field owner so DOM listeners, calculations and programmatic changes converge on the same path.

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

This allows action readiness and dirty-close protection to reason about the full working state. A derived `dirty` or `valid` value does not by itself mean that a Save command is wired for the current mode.

## Reactive recalculation

A mutation invalidates dependent expression-backed values/state. Recalculation is ordered/deduplicated by the reactive runtime and resulting canonical values are projected to field components. Transient evaluator operands remain invocation-local rather than becoming shared mutable scope.

## Create, editing and persistence boundary

The generic UIS Entry **supports a real API-backed create operation**. `UiEntryContentRuntime.create()` requires a `recordId` of `new`, create mode, a resource port and `#state.entry.saveReady`; it submits canonical fields through `sysbo.entry-create`. A valid created GUID and server-authoritative returned record are required before it updates `#data.original` and `#data.current`, marks the record clean and moves to view mode.

**Existing-record editing is not an equivalent implemented Save workflow in this source baseline.** The Entry can load an existing record, present/edit working values and derive dirty/validation state, but `load()` explicitly sets `saveReady: false`; `publishEdited()` only enables save readiness in create mode. Do not infer that pressing Save performs an API update transaction for an existing record in the modern UIS host.

The API and the established EJS0 application have broader create/update and aggregate operation capabilities. Their existence does not change the specific modern UIS Entry execution contract. The architecture requires successful authoritative persistence before reconciling a record baseline; that principle is implemented for modern UIS create, and is the required contract for any supported update caller.

```text
Modern UIS Entry
  ├─ load existing → working record + derived field state
  │                   └─ no general existing-record Save submission
  └─ new record    → validation/capability → API create
                                          → returned durable GUID/record
                                          → new #data.original / #data.current
```

Persisted calculations, audit values and application-managed fields may change the API's returned value. Browser components must use that authoritative result instead of assuming the draft exactly matches the stored record.

## Hosted entries

An entry can be hosted as a page or popup. `host` does not alter entry semantics. Popup invocation/fixed-value rules are read from the owning CTX surface contract, not hidden form transport.

Nested selectors or related-entry popups become child UI levels and are disposed with their own lifecycle.

## Draft recovery

When local draft recovery is enabled, the recovery store captures enough semantic entry state to recover unsaved work after navigation/reload/crash according to the client policy. The draft source must be distinguishable from freshly loaded database state so the UI can explain what was restored.

Draft persistence does not change API/storage authority: nothing is committed until Save succeeds.

## Failure behavior

Validation failures retain the user's working state and surface field/entry errors. Transport/server failures do not commit the baseline. Retriable popup actions use the normal popup action contract rather than mutable global callbacks.

## Testing implications

Generic entry changes should cover:

- new and existing records;
- direct DOM and programmatic CTX mutation;
- calculated/defaulted fields;
- create submission and baseline reconciliation;
- absence of unsupported existing-record Save submission;
- nested selectors/popups;
- aggregate dirty contributors;
- authorization-driven actions;
- draft recovery when affected;
- multiple entities, to prevent accidental entity-specific implementation.

## Field ownership and dirty-state propagation

The canonical Entry current value is shared by all its projections, including fields appearing in different tabs. A tab switch changes display state, not record identity or the meaning of the original-versus-current comparison. `deriveEntryFieldState` and `entryAvailableOptions` evaluate field eligibility and option presentation from canonical metadata and current runtime facts. Enum-backed values and field-inline options follow one resolution mechanism; the displayed language label is not the persisted enum identity.

Dirty-close coordination is a surface concern. A user may open a nested selector or Entry popup while an ancestor Entry contains unsaved changes; closing the child does not automatically abandon the ancestor's working state. The UI must distinguish canceling an interaction, discarding changes, and successfully committing an operation. See [Workspace Commit, Drafts and Recovery](Workspace-Commit-and-Recovery.md).
