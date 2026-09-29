# Entity UI Views

A **UI view** is a named presentation of one canonical entity record. It selects and composes presentation metadata; it does **not** create another entity type, data model, persistence contract or UI surface type.

For example, SysUsers and SysPrincipals expose deliberate read-only `quickView` presentations that the standard list Quick View action can host in a popup. SysUsers also reuses its `quickView` for Account, while SysPrincipals retains a separate `quick` view for compact editable record interaction. All remain presentations of their canonical records.

## View identity versus view type

Two concepts are intentionally separate:

- the **UI-view key** identifies a concrete named presentation, such as `main`, `quickView` or `quick`;
- `viewType` identifies the presentation/interaction family, currently including `full` and `quick`.

A view key is therefore not interchangeable with `viewType`. Multiple named views can share the same type: `main` and `account` are both `full` SysUser views.

The current defaults are `main` for the view key and `full` for its type when an entity uses the implicit first-generation view contract.

## Orthogonal to the host surface

UI view answers **which presentation of the record?** Host answers **where is that interaction mounted?**

```text
canonical entity record
        |
        +-- UI view: main / quickView / quick / ...
        |
        +-- host: page / popup / embedded
```

These dimensions must not be collapsed. A quick view is not a popup type; a popup can host an entry whose selected UI view is quick. Likewise, an embedded child is a host/lifecycle choice rather than a special metadata model.

## Common UI plus view contribution

Entity UI metadata has a common `record` definition and may declare keyed `uiViews`. The selected view contributes only what differs from the common record definition.

Current composition rules are deliberate and observable:

- view `tabs`, `content` and `tabNavigationVisible` replace their common counterpart when supplied;
- `fieldOverrides` compose by field key;
- nested field `presentation` objects compose rather than discarding common presentation properties;
- canonical `entryActions` belong to the common entity record; a view may supply `actionOverrides` by action key without redefining the action;
- a view with `readOnly: true` automatically suppresses canonical `save` and `delete` mutation actions;
- `relatedCollections` compose by collection key;
- unspecified properties continue to come from common record UI metadata.

This permits a compact or account-specific presentation to reuse canonical field policy, components and actions without copying the whole entity UI definition. Action identity and behavior therefore remain entity-owned while a view controls only the properties that differ in that presentation.

## Resolution

The generic resolver selects the requested view key, otherwise `defaultUIView`, otherwise the conventional `main` view. An unknown requested key is an error rather than a silent fallback to a different presentation.

Resolution produces effective UI metadata for that opening. Invocation-specific UI field overrides can then be layered onto that resolved view for caller-local presentation constraints. Those overrides do not mutate the global metadata definition.

## What a UI view may change

A UI view can change presentation and interaction composition, including:

- tabs and their content/layout;
- whether tab navigation is shown;
- field presentation/editability overrides;
- record-level actions;
- related-collection blocks;
- compact/full composition choices.

It must not redefine canonical field types, relationships, persisted calculations, storage semantics or authorization.

## Runtime ownership

The selected view is resolved before the entry is rendered and is projected into the entry/UI-level bootstrap for diagnostics and runtime awareness. Live field values still belong to that entry's CTX level. Switching or selecting a UI view does not create a second copy of the canonical record.

The API remains authoritative for permissions. A UI view may hide or disable an action for presentation reasons, but it cannot grant an operation that server policy does not allow.

## Current examples

- **SysUsers `main`** — normal full entity administration view.
- **SysUsers `account`** — another `full` view of the same SysUser record, with Account-specific tabs/actions and read-oriented composition.
- **SysPrincipals `main`** — normal full Principal entry.
- **SysPrincipals `quick`** — `quick` view with a compact field inventory/layout while inheriting common Principal field policy.

These examples establish the reusable architecture; future application-defined entities may declare additional named views without introducing entity-specific runtime branches.

See [Metadata Architecture](Metadata-Architecture.md), [Adding UI Metadata](Adding-UI-Metadata.md), [Entity Entries](../entities/Entity-Entries.md), and [UI Surfaces and Levels](../clients/UI-Surfaces-and-Levels.md).
