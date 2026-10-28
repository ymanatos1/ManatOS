# Entity Entries

An entity entry is the generic interactive surface for one record. It composes canonical entity metadata, UI metadata, CTX field state, expressions, reusable components, authorization capabilities and API persistence into create/view/edit workflows.

## Capabilities

Depending on metadata and invocation, an entry can provide:

- create, view and edit modes;
- metadata-driven tabs, sections and field layout;
- all canonical field types through reusable field components;
- literal/expression creation defaults;
- expression-driven visibility, readonly and calculated values;
- validation and normalization;
- enum/reference selectors and related-entry creation;
- related-record read-only collections;
- compound collection editors and hierarchy workspaces;
- dirty/baseline state across scalar and aggregate contributors;
- Create submission, Cancel/close protection and capability-driven actions; broader API update/delete capabilities are separate from current shared UIS Entry Save wiring;
- draft/recovery support where the client provides it;
- nested popup/selector levels and developer inspection.

## Canonical working state

For an existing record, the entry distinguishes:

```text
#data.original = authorized persisted baseline (or null for create)
#data.current  = canonical editable working record
```

The Entry initializes `#data.current` from `#data.original` and changes it only through the Entry-owned `setField()` semantic mutation path. For a new record, canonical defaults populate the initial working state.

A field component, rich-text editor, picture cropper or child component must not become a second owner of the semantic current value.

## Opening an entry

Opening resolves:

1. entity identity and canonical metadata;
2. effective UI metadata for the invocation;
3. record data (or new-entry defaults);
4. authorization/capabilities;
5. CTX UI level and field owners;
6. components/resources required by the declared tabs;
7. initial derived expressions and validation.

Only then is the entry semantically ready for interaction.

## Defaults and calculations

Creation defaults come from canonical entity metadata. Expressions are evaluated against the appropriate context and dependencies.

Calculated fields remain ordinary typed fields. Live client calculation can update presentation immediately; a `persisted: true` calculation is also materialized by the API before commit so background/non-UI writes preserve the same result.

## Readonly, visibility and enabled state

Side-effect-free decisions based on CTX-observable facts are good candidates for declarative expressions. Effective presentation state can react when dependencies change—for example a field becoming readonly after another enum value changes.

Security-sensitive editability must ultimately be backed by server authorization/capabilities; hiding/disabling a browser control is not authorization.

## Selectors and related records

A reference field can open a generic selector child level. Metadata declares the target and candidate restrictions; the selector returns the semantic record identity to the field.

`createRelated` can allow a caller to open a new related entry with source-projected defaults/fixed values and UI overrides. This uses the same hosted entry semantics rather than a special entity-specific popup form.

## Aggregate components

Some tabs own working state that is not reducible to one scalar field—for example a hierarchy workspace or compound collection editor. Such components contribute to the entry's aggregate dirty/valid/saving semantics through explicit runtime contracts.

The component's private draft remains owned by that component until commit/reconciliation. The parent entry must not pretend the draft is already persisted.

## Persistence and baseline reconciliation

The following is the **authoritative persistence contract**, not an assertion that every UIS Entry mode supports Save. In the inspected shared UIS Entry runtime, API-backed **create** is implemented; existing-record `saveReady` remains disabled even when the record is editable. The API and EJS0 have separate update paths.

A supported persistence operation follows:

```text
Entry #data.current + aggregate contributions
            |
            v
client validation / normalization where appropriate
            |
            v
supported API create (or update from an independently verified caller)
            |
            v
server authorization
canonical defaults/normalization/calculations
relationship/integrity work
storage transaction
            |
            v
saved authoritative record
            |
            v
reconcile #data.original + #data.current
clear successful draft state
```

Only a successful authoritative server result becomes the new baseline. In `EntryRuntime.create()` this reconciliation is executable; do not attribute generic existing-record update submission to the current shared UIS Entry runtime. This avoids keeping a stale baseline after server-generated/application-managed values change.

## Cancel and close

Cancel/discard semantics restore or abandon working state according to surface/component ownership. Unsaved drafts can require confirmation/recovery behavior, but Cancel must not silently mutate the persisted record.

Successful create workflows can close the owning creation surface and clear its draft so a later Create begins cleanly.

## Delete

Delete availability comes from server capability/policy and record context. The API remains authoritative. For example, Admin generally has full entity administration but the current self-delete safety rule prevents deleting the authenticated Admin's own SysUser record.

Relationship delete policy can require restrict/cascade/set-null/unlink/retain behavior independently of UI confirmation policy.

## Diagnostics

Entry state, fields, resources and nested levels are inspectable through CTX tooling. Expression inspection can distinguish formula definition from current calculated value. API Traffic shows save/delete calls and correlated server diagnostics.

See [Entry/Form Detail](Entity-Entries-Forms-Detail.md) for deeper state ownership mechanics.

## Entry working model

The shared Entry distinguishes `#data.original` from `#data.current`. The former is the persisted baseline, or `null` for a new record; the latter is the editable working projection. `#state.entry` tracks mode, active tab, permissions, loading/saving, dirty/valid/blocked/save-ready and errors. Individual field states are derived in `EntryEditState.ts` rather than maintained independently by each text input.

The Entry host handles ownership, resource loading and disposal. Embedded components contribute semantic layout for tabs, forms and typed fields. A field event goes through the type-aware component and Entry's mutation authority (`setField`); the actual DOM is neither the canonical record nor the place to store authorization decisions.

Async loading and reference projections are version-sensitive: a response belonging to a prior record or disposed Entry must not overwrite the current owner. Validation and client-level editing rules improve feedback, while server validation and commit remain authoritative. See [UIS Components](../clients/UIS-Component-Contracts.md) and [Workspace Commit](Workspace-Commit-and-Recovery.md).
