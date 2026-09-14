# CTX and Expression Runtime Guide

This is the consolidated developer-facing reference for ManatOS V2 CTX, surfaces, expressions and reactivity. It describes the runtime contract rather than a particular entity. When code and metadata evolve, preserve these ownership and lifecycle rules first.

## 1. Mental model

CTX is the observable semantic runtime model. It is not a persistence database, DOM mirror, dependency graph, AST store, callback registry or lifecycle bookkeeping bag. A value belongs in CTX when application/runtime semantics need to observe it. Private implementation state stays with the runtime that owns it.

The root is `ctx`. Root facts (`system`, `company`, `entities`, `user`) coexist with one recursively projected active UI chain under `ctx.ui.level`. A page and popup are the same semantic `Surface`; `host` says where it is rendered. `kind` says what it contains and `mode` says how it operates.

The authoritative UI runtime may retain a richer ownership registry internally. Public `ctx.ui` deliberately projects only the currently displayed **navigation** chain. Therefore `parentId`/`children` ownership bookkeeping is not copied into public CTX merely because the runtime needs it internally.

## 2. Root CTX vocabulary

| Path                               | Meaning                                 | Owner / creation            | Mutation and lifetime           |
| ---------------------------------- | --------------------------------------- | --------------------------- | ------------------------------- |
| `ctx.system`                       | safe host/runtime facts                 | root bootstrap              | runtime-owned; system lifetime  |
| `ctx.system.scope`                 | active root application/runtime scope   | root bootstrap              | read-only to consumers          |
| `ctx.system.runtime.*`             | safe runtime mode/developer facts       | bootstrap/config            | read-only                       |
| `ctx.system.server.*`              | safe server/API facts                   | bootstrap                   | read-only                       |
| `ctx.system.client.*`              | client kind/version/features            | UI bootstrap                | read-only                       |
| `ctx.entities.<name>`              | canonical entity knowledge              | metadata/entity registry    | registry-owned                  |
| `ctx.entities.<name>.key`          | canonical entity key                    | registry                    | read-only                       |
| `ctx.entities.<name>.metadata`     | canonical entity metadata               | metadata loading            | registry-owned                  |
| `ctx.entities.<name>.uiMetadata`   | canonical UI metadata                   | metadata loading            | registry-owned                  |
| `ctx.company`                      | company/platform catalogue              | root bootstrap              | catalogue/runtime-owned         |
| `ctx.company.sysBO`                | company-wide entity contributions       | company catalogue           | read-only                       |
| `ctx.company.platforms[]`          | platform contexts                       | company catalogue           | read-only catalogue             |
| `ctx.company.currentPlatform`      | active platform identity                | platform/navigation runtime | controlled mutation             |
| `ctx.company.currentPlatformIndex` | active platform index                   | platform/navigation runtime | controlled mutation             |
| `ctx.user`                         | authenticated-user projection or `null` | session/login projection    | session-owned                   |
| `ctx.ui.level`                     | first displayed V2 surface or `null`    | surface runtime projection  | changes with displayed UI chain |

### User branch

`ctx.user` is field-shaped so the same expression semantics can consume authenticated-user facts and entry fields. `ctx.user.fields.<key>.value` is the safe current value. Optional `.option`/`.options` decorate enum/reference values. `.expression`, when present, is authored source only. `ctx.user.permissions.userRole` and `ctx.user.permissions.platforms.<id>.capabilities.platformAccess` are safe projected authorization facts; protected operations remain server-authorized.

## 3. Every UI surface variable

Each `ctx.ui.level` and nested `.level` has the same host-neutral shape. Universal level-control semantics live under the real `control` folder; kind-specific/domain payload stays beside it. The CTX Viewer reflects this schema directly and does not manufacture a display-only grouping.

| Node                                    | Meaning                                  | Owner / lifecycle           |
| --------------------------------------- | ---------------------------------------- | --------------------------- |
| `control`                               | universal UI-level control plane         | surface/UI runtime          |
| `entityKey` / `entityName` / `recordId` | optional entity/record identity          | entity-backed surfaces only |
| `selection` / `row`                     | selector/list semantics                  | selector/list runtime       |
| `resources`                             | component-owned host-neutral read models | component runtime           |
| `entry` / `fields`                      | entry record/field semantics             | entry/field runtime         |
| `list`                                  | list record projection                   | list runtime                |
| `level`                                 | next displayed child surface             | navigation projection       |

Every level always contains these `control` children:

| `control.*` node | Meaning                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `id`             | stable surface identity                                                      |
| `host`           | `page` or `popup`                                                            |
| `kind`           | `static`, `list`, `entry`, `selector`, `hierarchy`, `custom`                 |
| `mode`           | `browse`, `create`, `edit`, `view`, `select`, `manage`                       |
| `name`           | semantic surface name                                                        |
| `path`           | canonical CTX/surfaceRef address                                             |
| `scope`          | lexical expression scope                                                     |
| `invocation`     | immutable caller/open constraints and behavior                               |
| `presentation`   | effective visual semantics                                                   |
| `state`          | observable operational state                                                 |
| `facts`          | surface-owned semantic facts; present as an empty object when there are none |

### `control.invocation`

`control.invocation.entityName` identifies the target when needed. `purpose` is `select`, `view`, `create` or `inspect`; it is distinct from `control.mode`. `caller.surfaceRef` is a stable reference to the caller, never copied caller state. `rules.values`, `rules.fields`, `rules.query` and `rules.actions` carry declarative constraints. `behavior` carries child behavior such as single/multiple selection, clear/autofocus and close-after-save.

### `control.presentation`

`control.presentation.kind` mirrors the semantic surface kind for visual composition; title, icon, subtitle and layout are visual semantics. Presentation must not become a second source for operational mode or entity state.

### `control.state`

`control.state.lifecycle` progresses through `creating`, `created`, `activating`, `active`, `deactivating`, `closing`, `closed`, `disposed`. `active`, `dirty`, `valid`, `loading`, `saving`, `deleting` and `blocked` are observable runtime state. `control.state.navigation.activeTabId` and `activeInternalTabIds` track navigation. Popup-hosted surfaces may additionally expose `control.state.popup.x`, `.y` and `.openedPopupsCounter`.

### `control.facts`

The folder exists on every level, even when empty. It contains safe semantic facts owned by the surface. Bare lexical expressions may still expose appropriate control/fact conveniences, but explicit CTX paths must use the real `#level.control...` structure.

### Entry projection and fields

`entry.original` is the baseline record projection. `entry.current` is the current record projection. Once a field runtime exists, field state is authoritative and `entry.current` is a read-only projection/mirror of those field values. `control.facts` are API-safe non-persisted record facts and must not be absorbed into persisted current data.

For every `fields.<key>`:

| Child                | Meaning / ownership                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `value`              | sole live scalar authority; canonical mutation publishes semantic change                                    |
| `originalValue`      | baseline authority; initialized from source/default and advanced only by a legitimate baseline operation    |
| `dirty`              | derived comparison of live value vs baseline; never an independent writer                                   |
| `valid`              | validation-derived field validity                                                                           |
| `validationIssues[]` | validation output owned by validation runtime                                                               |
| `option`             | selected enum/reference decoration when applicable                                                          |
| `options[]`          | effective option-domain authority after metadata/caller/server restrictions                                 |
| `ux`                 | effective presentation state such as visible/read-only/required/enabled, including expression-derived state |

`state.dirty` and `state.valid` are aggregate transaction state. Compound editors may contribute through private contributor contracts; they must not create parallel CTX authorities merely to participate in aggregation.

### Lists, selectors and hierarchy/component resources

`list.originalEntries` is the list baseline and `list.entries` is the current projected record set. Calculated fields are projected before publication. `selection.current`, `selection.selected[]` and `selection.facts` belong to selector/list semantics. `row.current` and `row.facts` provide current-row evaluation state without mutating the record catalogue. `resources` contains component-owned host-neutral read models only when a component has legitimate semantic data to publish.

## 4. UI level lifecycle and nesting

A child surface may be page-hosted or popup-hosted without changing its CTX semantics. Public nesting follows `navigationParentId`, not semantic ownership. Closing/disposal removes the child's public level and its owned transient semantic state. The parent receives a generic `SurfaceResult`; private continuation code decides what parent mutation, if any, follows.

Initialization is a semantic boundary. Calculations, validation and declarative tab visibility ignore reactive field/CTX events while an entry is partially initialized. `entry:initialized` establishes the deterministic first evaluation/validation/visibility pass. Implementation bookkeeping used to decide whether initialization has settled remains private runtime state rather than CTX.

## 5. Expression ownership and lifecycle

Authored expression **source text** is the portable contract. ASTs are execution infrastructure.

- API process: one process-local global AST cache, initially empty at API startup.
- UI process: one separate process-local global AST cache, initially empty at UI startup.
- Exact source string is the cache key. Parsing is lazy and happens once per exact source per process.
- Browser: never tokenizes/parses authored expression grammar. It requests compilation through the UI compile boundary and keeps only a document-lifetime non-semantic source→AST execution mirror.
- ASTs never belong under `ctx.*`, metadata, `SurfaceInvocation`, popup/page state or copied parent/child state.

The AST is context-neutral. Every evaluation supplies an explicit owner/scope and capabilities. Concurrent/async evaluations therefore cannot change one another's lexical owner. Resolver-call promise de-duplication is per reactive evaluation pass, not global semantic state.

## 6. Resolution and dependency identity

Variable resolution is lexical: resolve the **first** identifier at the current UI scope, then parent levels, then root; after that first identifier resolves, remaining members traverse strictly downward. Explicit root references remain absolute. Arrays support numeric indexing and stable semantic `id`/`key` lookup; arbitrary keys use quoted bracket syntax.

Dependency discovery consumes the canonical AST, not reparsed source. A local semantic change can legitimately project to more than one dependency identity: a local path plus an owner-qualified `surface:<id>:...` path. Root CTX changes retain their absolute `ctx.*` identity. This projection lets local expressions remain concise while cross-surface dependencies remain unambiguous.

## 7. Reactive event contract

Canonical field/CTX mutation emits one semantic event. Calculations, validation and declarative UX consume the shared event→dependency projection and shared overlap semantics. A consumer must not invent a second matcher for the same contract.

One event may match multiple dependency aliases for the same target. That does **not** mean the target executes multiple times. Calculation and validation runtimes deduplicate at the event boundary. Initial calculation similarly evaluates each registered calculation once regardless of how many dependencies it declares. Cascades remain valid because a calculated result is written through the canonical field mutation route and therefore emits the next semantic event normally.

`changedPath` passed to an individual calculation/validation callback is diagnostic context: the first canonical matching path for that target. It is not a second dependency authority.

## 8. Mutation and authority rules

1. Mutate canonical owners, never mirrors.
2. Field UI controls adapt user input into canonical field mutation; they are not expression state.
3. Calculations write their result through canonical field mutation, preserving events/cascades.
4. `entry.current`/`entry.original` are projections, not alternate writers.
5. Child surfaces return results; they do not directly own parent continuation mutations.
6. Safe authorization facts in CTX may drive presentation but never replace API authorization.
7. Remote/entity-resolver calculations execute only where the required capability legitimately exists; do not fabricate server UI context or force asynchronous resolver semantics into a synchronous projection.

## 9. Debugger contract

The debugger observes CTX; it does not define CTX. Path lookup delegates to the canonical browser context runtime. Keyed arrays, bracket syntax and future path semantics must therefore resolve exactly as application expressions/mutation routing do. Debugger aliases, icons, provenance links, history, expansion, watches, layout and subscriber telemetry are presentation/runtime diagnostics and never semantic CTX children.

Subscriber registrations are private telemetry beside CTX. The debugger may show direct/dependent/global counts and registration details (`kind`, `label`, paths), but those registrations do not become application state. In the current document model, runtime scripts register against the document-local CTX runtime; navigation creates a new document/runtime and therefore a new telemetry registry.

The debugger may display authored expression source and live calculated values. It must not expose an AST as though it were a semantic child of a calculated variable.

## 10. V1 → V2 interpretation

When reading older code/documentation, apply these convergence rules:

- “page state” and “popup state” are not separate semantic models; both are V2 surfaces.
- `kind` and `mode` are distinct dimensions; `entry` is a kind, `create/edit/view` are modes.
- public `ctx.ui.level[.level...]` is the displayed navigation chain, not the private surface ownership registry.
- scalar live/baseline state belongs to `fields.<k>.value/originalValue`; `entry.current/original` are projections.
- `list.entries`/`list.originalEntries` are the canonical V2 list projections; older `dataList` terminology should be read as legacy shorthand, not a second CTX collection authority.
- expression source remains metadata; compiled AST state is private process/browser execution infrastructure.
- lifecycle gates and contributor registries are private runtime bookkeeping unless they have independent semantic meaning.
- reactive consumers use canonical event projection/matching instead of feature-local path heuristics.

## 11. Worked examples

### Calculated entry field

An entry owns `fields.firstName.value`, `fields.lastName.value` and calculated `fields.displayName.value`. The calculation AST depends on first/last name. During initialization those source values may change without running the calculation. At `entry:initialized`, `displayName` evaluates once. Later a user mutation of `firstName` emits one value event; even if local and owner-qualified dependency identities both match, `displayName` evaluates once and writes through canonical field mutation.

### Selector popup

An entry opens a popup-hosted selector. The selector receives purpose, caller reference, query/field/action rules and behavior in its invocation. Its selection lives in the child level. On completion it returns a generic selection result. The parent's private continuation maps that result to the parent field through the canonical mutation route. No destination-field callback is stored in child CTX.

### Cross-surface/root dependency

A child expression may depend on an ancestor surface path or `ctx.user.permissions...`. Foreign-surface changes are represented by owner-qualified dependency identity; root changes retain `ctx.*`. The shared matcher decides invalidation. The expression is evaluated in its own explicit owner scope, not by changing a global “current context”.

## 12. Architectural review checklist

Before adding a CTX node or expression feature, ask: Is this observable semantic state or merely lifecycle/implementation bookkeeping? Who owns it, when is it created/changed/disposed, and who may mutate it? Is there already a canonical authority or projection? Can a pure CTX-observable decision be metadata expression rather than hardcoded imperative policy? Does the change preserve one parser/cache model, one mutation route, one event/dependency contract and host-neutral page/popup semantics? If the answer requires a second authority, parser, matcher, mirror writer or copied invocation state, redesign the boundary first.
