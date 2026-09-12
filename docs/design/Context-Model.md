# Context Model

## Purpose

CTX is ManatOS's observable runtime context: the common address space through which metadata expressions, UI runtimes, components, dependency tracking and developer tooling observe the active application state.

It is deliberately **not** a database and not a second domain model. Persisted business data remains owned by the API/storage layers. CTX contains the safe facts, working state and runtime contracts required by the current client experience.

For an application developer, CTX answers questions such as: _Who is the current user? What entity metadata applies? Which UI surface is active? What is the live value of this field? Why was this popup opened? Is this entry dirty? Which resources has this component published?_

## Root contracts

```text
ctx
+-- system        safe host/runtime/client facts
+-- entities      canonical entity + UI metadata registry
+-- company       company/platform catalogue and capabilities
+-- user          authenticated-user runtime projection
|   +-- fields
|   +-- permissions
+-- ui            active UI surface chain
```

| Root       | Purpose                                                              | Typical consumers                                   |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `system`   | Safe runtime, client and feature facts.                              | feature expressions, diagnostics, connectivity UI   |
| `entities` | Canonical metadata known to the client.                              | generic forms/lists, expression tooling, components |
| `company`  | Company/platform structure and shared capabilities.                  | navigation, platform-aware policy and presentation  |
| `user`     | Authenticated user's persisted projection and effective permissions. | authorization-aware UI expressions, account UI      |
| `ui`       | The currently displayed recursive surface chain.                     | UI engine, expressions, components, debugger        |

Root contracts have different owners. For example, editing a SysUser entry does not mutate `ctx.user`: the entry is an uncommitted UI transaction, while `ctx.user` represents the authenticated session. If the authenticated user's own record is successfully saved, the current-user/bootstrap owner refreshes `ctx.user` from the authoritative server/session projection.

## UI chain

The public UI topology is recursive and contains only the currently displayed chain:

```text
ctx.ui
  +-- level                  root displayed surface
      +-- level              active child
          +-- level          active grandchild
              +-- ...
```

A page, an entry opened inside that page, and a selector popup opened by the entry therefore form one navigable chain rather than unrelated global objects. Closing the deepest child exposes its immediate parent again.

`CurrentUiLevel()` returns the deepest/current level. `TraverseUiLevels()` returns the ordered root-to-current chain. These functions should be preferred over hard-coded assumptions about nesting depth.

## Common UI level contract

```text
level
+-- id
+-- host              page | popup
+-- kind              static | list | entry | selector | hierarchy | custom
+-- mode              browse | create | edit | view | select | manage
+-- name
+-- path
+-- scope
+-- entityKey?
+-- recordId?
+-- invocation
+-- presentation
+-- state
+-- facts?
+-- fields?
+-- entry?
+-- list?
+-- resources?
+-- level?
```

Three dimensions are intentionally independent:

| Property | Supported values                                             | Meaning                                                                                  |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `host`   | `page`, `popup`                                              | **Where** the surface is mounted. Host does not redefine its business/runtime semantics. |
| `kind`   | `static`, `list`, `entry`, `selector`, `hierarchy`, `custom` | **What** semantic surface contract the level implements.                                 |
| `mode`   | `browse`, `create`, `edit`, `view`, `select`, `manage`       | **How** that surface currently operates.                                                 |

Examples: an entry may be `host=page, kind=entry, mode=edit`; the same entry contract can be `host=popup, kind=entry, mode=view`. A selector is normally `kind=selector, mode=select`. This separation prevents visual hosting, semantic purpose and operational behavior from becoming one overloaded flag.

## Invocation — why the surface exists

`invocation` is immutable-style input/provenance describing **why and how the parent/caller requested this surface**. It is not a second copy of the surface's mutable state.

```text
invocation
+-- purpose?
+-- sourceSurfaceId?
+-- sourceEntityKey?
+-- sourceRecordId?
+-- targetEntityKey?
+-- targetField?
+-- selectionMode?       single | multiple
+-- defaults?            { ... }
+-- overrides?           { ... }
+-- uiOverrides?         { ... }
+-- parameters?          { ... }
```

| Member                              | Meaning / usage                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `purpose`                           | Human/tool-readable reason for opening the surface, e.g. `open-entity-entry-page`, `open-entity-entry-popup`. Useful to generic lifecycle/policy code. |
| `sourceSurfaceId`                   | Surface that initiated the request. Supports provenance and return routing without guessing from DOM structure.                                        |
| `sourceEntityKey`, `sourceRecordId` | Business source of the invocation when relevant.                                                                                                       |
| `targetEntityKey`                   | Entity the invocation intends to select/open/manage.                                                                                                   |
| `targetField`                       | Calling field that should receive a result, especially reference selectors.                                                                            |
| `selectionMode`                     | `single` or `multiple`; describes selector result cardinality.                                                                                         |
| `defaults`                          | Caller-provided initial values. Defaults seed creation; they are not permanent restrictions.                                                           |
| `overrides`                         | Invocation-specific behavioral input understood by the target contract.                                                                                |
| `uiOverrides`                       | Invocation-specific UI restrictions/presentation input, e.g. narrowing allowed options.                                                                |
| `parameters`                        | Extensible purpose-specific parameters that do not deserve top-level members.                                                                          |

Example:

```text
Principal entry
   |
   | opens Parent principal selector
   v
Selector invocation
  purpose         = "select-reference"
  sourceEntityKey = "sys-principals"
  sourceRecordId  = "..."
  targetEntityKey = "sys-principals"
  targetField     = "parentPrincipalId"
  selectionMode   = "single"
```

Code should **read invocation to understand the request**, then write changing runtime state to the appropriate state/field/resource contract. Do not mutate invocation to represent what subsequently happened.
For hosted create entries, browser policy/default handling reads `invocation.defaults` from the owning CTX level. A hidden `_entryDefaults` form value may still exist as server form/popup continuation transport, but browser logic must not reread it as an alternative semantic source.

## Presentation — what the surface looks like

`presentation` contains visual semantics only:

```text
presentation
+-- kind
+-- title?
+-- icon?
+-- subtitle?
+-- layout?
```

| Member     | Meaning                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `kind`     | Semantic surface kind used by presentation infrastructure.                                                      |
| `title`    | Primary user-visible caption.                                                                                   |
| `icon`     | Icon identity understood by the presentation layer.                                                             |
| `subtitle` | Optional secondary caption/context.                                                                             |
| `layout`   | Layout variant such as an entity-entry or hierarchy layout. Layout is visual composition, not operational mode. |

A critical invariant is that `presentation` never owns `mode`. `mode=edit` changes behavior; `layout=entity-entry` changes presentation. Keeping them separate allows the same runtime semantics to be rendered by different hosts/layouts.

## State — what the surface is doing now

`state` is runtime-owned observable operational state:

```text
state
+-- lifecycle
+-- active
+-- dirty
+-- valid
+-- loading
+-- saving
+-- deleting
+-- blocked
+-- navigation
|   +-- activeTabId
|   +-- activeInternalTabIds
+-- popup?                 popup-hosted levels only
    +-- x
    +-- y
    +-- openedPopupsCounter
```

### Lifecycle

| Value          | Meaning                                                                        |
| -------------- | ------------------------------------------------------------------------------ |
| `creating`     | Runtime object is being constructed but is not ready for use.                  |
| `created`      | Construction completed; not yet active.                                        |
| `activating`   | Transitioning into the active displayed chain.                                 |
| `active`       | Current usable surface.                                                        |
| `deactivating` | Losing active ownership while lifecycle cleanup runs.                          |
| `closing`      | Close operation has begun.                                                     |
| `closed`       | No longer displayed.                                                           |
| `disposed`     | Runtime resources/subscriptions are released; the instance must not be reused. |

### Operational flags

| Flag       | Meaning                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `active`   | Surface currently participates as active UI.                                                                                                                 |
| `dirty`    | Owned transactional working state differs from its baseline. It should be derived/maintained by the owning runtime, not independently guessed by components. |
| `valid`    | Current owned input satisfies client validation required for the operation. Server validation remains authoritative at persistence time.                     |
| `loading`  | Surface is waiting for required data/read models.                                                                                                            |
| `saving`   | Persistence operation is in progress.                                                                                                                        |
| `deleting` | Delete operation is in progress.                                                                                                                             |
| `blocked`  | Surface cannot currently proceed because an owning runtime/policy has blocked interaction.                                                                   |

`navigation` records observable tab selection. It describes current navigation state after the UI changes; it is not metadata defining which tabs exist. Popup geometry is state because position/depth changes during the lifetime of a popup.

## Entry, fields and single-authority values

An entry level owns a record editing transaction. Its field-oriented and record-oriented views are intentionally both readable, but duplicate mutable authorities are forbidden.

```text
                  LIVE AUTHORITY
              fields.firstName.value
                       |
                       +------ read-only projection ------+
                                                       entry.current.firstName

                 BASELINE AUTHORITY
              entry.original.firstName
                       |
                       +------ read-only mirror ----------+
                                                   fields.firstName.originalValue
```

A field node commonly exposes:

```text
fields.<fieldName>
+-- value                 canonical mutable live scalar
+-- originalValue         canonical baseline value
+-- dirty                 derived change state
+-- valid                 validation aggregate
+-- validationIssues[]
+-- option/options?       option/reference presentation state where applicable
+-- ux                    field UI/presentation state
```

`entry.current` is a convenient whole-record projection of canonical field values. Consumers may read it for persistence preparation, debugging or record-oriented components, but writes target `fields.<key>.value`.

`fields.<k>.originalValue` is the sole per-field baseline authority. `entry.original.<k>` is a read-only getter mirror, symmetric with `fields.<k>.value` / `entry.current.<k>`. Baseline promotion after successful persistence updates the field baseline through the canonical CTX mutation path, so both record-shaped mirrors follow without synchronization races.

For enum/reference fields, `fields.<k>.options` is the canonical **effective option domain** after metadata and caller/server restrictions have been applied. `fields.<k>.option` is the decoration for the selected value. Entry selectors and policy logic consume these CTX nodes; they do not reconstruct semantic option metadata from rendered controls.

## Facts — observations, not persisted fields

`facts` contains API-safe runtime observations required by expressions/components but which are **not canonical persisted entity fields**. Examples include `hasPassword` or effective entity permissions supplied to an entry surface.

Use a fact when the value describes the current runtime/API projection and must not accidentally become part of a persistence payload. Do not put a value in `facts` merely because it is convenient; canonical entity values belong in fields.

## Lists

A list level owns collection/query state rather than a single record field lifecycle:

```text
list
+-- entries
+-- originalEntries
+-- ... query/paging state owned by the list runtime
```

Unlike aliases of one scalar value, `entries` and `originalEntries` may legitimately coexist when they represent working and baseline collection states. The architectural test is semantic: two values may coexist when they represent **different states**, not when they are merely two mutable copies of the same fact.

## Resources — component-owned read models

`resources` is the host-neutral namespace for structured read models owned by metadata components or surface infrastructure.

```text
level.resources
+-- referenceData
+-- collections
+-- <component-owned resource>
```

Resources let a reusable component publish/consume supporting data without inventing entity-specific top-level CTX branches. A resource should have a clear owner and lifecycle matching its surface. It is not a substitute for canonical entity fields or general-purpose dumping ground.
`referenceData` may therefore coexist with an entry field's `options` when it represents factual supporting records for other consumers; it must not be treated as a fallback/parallel selector catalogue for that field.

## Semantic node metadata and observability

CTX nodes have semantic descriptors outside application data. The debugger/runtime can therefore describe a node without inserting bookkeeping properties into the represented value:

```text
kind        semantic contract/role
 type       JavaScript/domain value type
 attributes [mutable, derived, readonly, mirror, observable, ...]
 watchable  whether the path participates in CTX observation
 subscribers
   direct
   dependent
   global
   total
```

`kind` answers _what contract is this node?_; `type` answers _what value does it contain?_; `attributes[]` describes orthogonal characteristics. `watchable=yes` is a capability, whereas subscriber counts are live telemetry showing current interest in the path.

The CTX Viewer uses this same semantic information for node icons and its Properties panel. This is not debugger-only metadata: it makes runtime contracts discoverable to developers and future generic infrastructure.

## Mutation, events and dependencies

Canonical mutable paths change through the CTX runtime rather than arbitrary object assignment. A mutation identifies its path and cause/source, emits the CTX change event, and allows dependent expressions/components to react.

```text
canonical write
     |
     v
CTX mutation pipeline
     |
     +--> change event
     +--> exact/direct subscribers
     +--> expression dependents
     +--> broader runtime subscribers
     +--> read-only projections observe new authority
```

A read-only mirror/projection is never a second write route. Attempting to mutate one through the generic CTX API is rejected. This invariant is central to keeping dependency behavior deterministic.

## Choosing the correct CTX location

When adding runtime data, ask in this order:

1. **Is it a canonical entity field?** Put live entry state under `fields`.
2. **Is it the persisted/editing baseline?** It belongs to the owning transaction's `original` state.
3. **Is it a safe non-persisted observation?** Consider `facts`.
4. **Is it supporting structured data owned by a component/surface?** Consider `resources`.
5. **Does it describe why the surface was opened?** It belongs to `invocation`.
6. **Is it visual semantics?** It belongs to `presentation`.
7. **Is it changing operational/lifecycle state?** It belongs to `state`.
8. **Is it really company/user/system-wide?** Only then promote it to the corresponding root contract.

The guiding rule is one semantic owner and one mutable authority. Convenience views are welcome when they are read-only projections rather than competing state.

## Debugging and developer usage

Use the CTX Viewer to inspect the active chain and select a node. The Properties panel exposes its preferred symbolic path, semantic kind/type, attributes, watchability and live subscriber counts. For expressions, prefer CTX paths and the provided traversal functions rather than DOM state or assumptions about nesting depth.

Canonical absolute `ctx...` paths remain the stable internal identity used for mutation routing, dependency keys and subscriptions. **Path representation is separate from path identity:** whenever the runtime can describe a path relative to the active execution context, it prefers a `#`-anchored notation first (`#level...`, then `#...`), and falls back to `$...` only when no `#` form can express the target. Resolver results carry this preferred notation alongside the canonical path so the same rule applies to internal diagnostics/tooling as well as visible captions and CLI prompts.

When diagnosing unexpected behavior, first identify the **authority path**, then inspect its subscribers/dependents. If two paths appear to expose the same value, check their attributes: one should be the authority and the other explicitly `derived`/`readonly`/`mirror`, never two independently mutable copies.

### CTX path quick reference

Expression paths use a small set of explicit navigation primitives over the real CTX tree:

| Form            | Meaning                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$`             | CTX root.                                                                                                                                                                                              |
| `#`             | Immediate parent of the current evaluation context.                                                                                                                                                    |
| `#level`        | Nearest ancestor that is a UI-level context.                                                                                                                                                           |
| `.(expression)` | Dynamic path member. Evaluate the parenthesized expression and use its result as the next key/index. The result must be a non-empty string or a non-negative integer; invalid results fail explicitly. |

Aliases are convenience names for real CTX paths; they do not create values or evaluator-only scopes. Current built-ins are:

| Alias                  | Canonical path / meaning                                          |
| ---------------------- | ----------------------------------------------------------------- |
| `$entity`              | Canonical entity for the current initialization context.          |
| `$entity-fields`       | Canonical `fieldDefinition` for that initialization scope.        |
| `$entry-current`       | Scalar record currently being initialized.                        |
| `$level-entity`        | `$.entities.(#level.control.entityName)`                          |
| `$level-entity-fields` | `$.entities.(#level.control.entityName).metadata.fieldDefinition` |

For example, canonical create defaults use `$entity-fields` / `$entry-current` so they are portable outside UI execution, while UI-only expressions may still use the `$level-*` aliases. Aliases always resolve to real CTX state; they never manufacture hidden evaluator scopes.
