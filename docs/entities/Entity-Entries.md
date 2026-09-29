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
- Save, Cancel and Delete actions with capability checks;
- cancellation protection plus explicitly scoped draft/outage-recovery support;
- nested popup/selector levels and developer inspection.

## Canonical working state

For each scalar field, `fields.<key>.value` is the live semantic authority and `fields.<key>.originalValue` is its baseline authority. The entry-level record shapes are read-only projections:

```text
fields.<key>.value          = live scalar authority
fields.<key>.originalValue  = baseline scalar authority
entry.current.<key>         = read-only current-record projection
entry.original.<key>        = read-only baseline-record projection
```

For an existing record, the server record seeds both current and baseline field state. For a new record, canonical defaults and allowed invocation-projected values seed the current field state. Older documentation/code discussions may call the projected record shapes `dataCurrent` and `dataOriginal`; those names are migration terminology, not additional V2 CTX authorities.

A field component, rich-text editor, picture cropper or child component must not become a second owner of the semantic current value.

## UI view and host

Before rendering, an entry resolves a named UI view from the entity's common UI metadata plus the selected view contribution. `main`, `account` and `quick` are view keys; `full` and `quick` are view types. The selected view can alter tabs/content, field presentation, actions and related collections without creating another canonical entity record.

This is independent of hosting. The same entry architecture can be page-, popup- or embedded-hosted. Host controls placement/lifecycle; UI view controls record presentation. See [Entity UI Views](../metadata/UI-Views.md).

## Opening an entry

Opening resolves:

1. entity identity and canonical metadata;
2. selected UI view and its effective UI metadata, followed by invocation-local UI overrides;
3. record data (or new-entry defaults);
4. authorization/capabilities;
5. CTX UI level and field owners;
6. components/resources required by the declared tabs;
7. initial derived expressions and browser field/component validity state.

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

## Save

A save approximately follows:

```text
authoritative field values + aggregate contributions
            |
            v
browser validity / working-state checks where appropriate
            |
            v
API create/update request
            |
            v
server authorization
canonical defaults/normalization/persisted calculations
domain/integrity enforcement where applicable
storage uniqueness/schema/transaction behavior
            |
            v
saved authoritative record
            |
            v
reconcile field values/baselines + entry.current/entry.original projections
clear successful draft state
```

The returned authoritative record is the new baseline. This avoids keeping a stale pre-save baseline after server-generated/application-managed values change.

## Cancel and close

For ordinary entries, closing a dirty transaction does not persist it. Cancellation protection can offer Save or Discard: Save crosses the API persistence boundary; Discard abandons the working transaction. A clean close simply disposes the surface. Normal navigation/closure does not create a general-purpose resumable entry draft.

Create Organization is the explicit exception: its unfinished create-workspace graph can be kept as a browser-local continuation draft across normal navigation/closure. Edit Organization does not have that behavior. Successful hierarchy Commit clears the create draft. Abnormal outage recovery is a separate mechanism and must not be confused with this exception.

See [Persistence, Commit, Discard and Recovery](Persistence-Commit-and-Recovery.md).

## Delete

Delete availability comes from server capability/policy and record context. The API remains authoritative. For example, Admin generally has full entity administration but the current self-delete safety rule prevents deleting the authenticated Admin's own SysUser record.

Relationship delete policy can require restrict/cascade/set-null/unlink/retain behavior independently of UI confirmation policy.

## Diagnostics

Entry state, fields, resources and nested levels are inspectable through CTX tooling. Expression inspection can distinguish formula definition from current calculated value. API Traffic shows save/delete calls and correlated server diagnostics.

See [Entry/Form Detail](Entity-Entries-Forms-Detail.md) for deeper state ownership mechanics and [Generic List and Entry Contracts](Generic-List-and-Entry-Contracts.md) for the host-neutral aggregate/authority contract.
