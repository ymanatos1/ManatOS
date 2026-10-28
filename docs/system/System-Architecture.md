# System Architecture

## 1. Architectural intent

ManatOS is a metadata-driven application platform. The server owns business truth and security; clients own presentation and interactive runtime state. Metadata and expressions connect those two sides without turning either side into an imitation of the other.

```text
                         MANATOS

  +-------------------- CLIENT ---------------------+
  | UI composition                                     |
  | CTX runtime                                        |
  | expression evaluation for UI decisions            |
  | page / popup / hierarchy interaction               |
  +-----------------------+---------------------------+
                          |
                    HTTP contracts
                          |
  +-----------------------v---------------------------+
  | API / DOMAIN                                         |
  | canonical metadata     authorization                |
  | validation             commands                     |
  | calculated business state                          |
  | relationship semantics                             |
  +-----------------------+---------------------------+
                          |
                    storage contract
                          |
  +-----------------------v---------------------------+
  | DATASTORE                                           |
  | selection / filtering / persistence / transaction |
  +----------------------------------------------------+
```

The core boundary is:

> **Server → facts, contracts and operations. Client → constructs UI from facts, metadata and invocation. Server → independently authorizes and validates every operation.**

## 2. Processes and HTTP boundary

ManatOS separates the API and UI processes. A reverse proxy may expose them as one site:

```text
/       -> UI process
/api/*  -> API process
```

The UI API base URL is configuration-driven. Business/UI code therefore does not depend on deployment topology.

API responses use a consistent envelope:

```text
query success    -> success + data
command success  -> success + message + data
failure          -> success:false + message + error [+ data]
```

Operational endpoints such as health/readiness belong to the running service rather than versioned business resources.

## 2.1 Client implementation independence

The TypeScript repository contains the established `ui.EJS0` client and the newer UIS hosts `ui.NG1` (Angular) and `ui.EJS1` (EJS). The shared UI semantics live in `shared.UI`, with presentation adapters in `shared.UI.NG` and `shared.UI.EJS`. This is the concrete realization of the architecture's framework-independent client contract. Other technologies may implement the same semantic boundaries without making their native code part of this TypeScript reference.

Architecture documents therefore describe client/UI semantics first. Concrete Angular/EJS adapter details belong to the client documentation and are identified separately from shared semantic contracts.

## 3. Metadata-driven entity model

The generic entity model has a stable entity key and is independent of a particular UI or storage provider. Current system-owned entities use the SysBO naming/category convention, with keys such as `sys-users` or `sys-principals`; storage-generated record identifiers are independent of those keys.

The same entity/metadata/runtime/storage contracts are intended to support future non-systemic entities defined by Applications. Those entities should not be described as SysBOs merely because the first registered objects are system-owned.

Two metadata layers are intentionally distinct:

```text
Canonical entity metadata
  fields
  relationships
  calculations
  persistence semantics
  entry semantics

UI metadata
  tabs
  components
  presentation
  actions
  dynamic visibility/editability
```

Canonical metadata describes the business object. UI metadata describes how a UI-capable client may present it. A non-UI client can use the API without understanding ManatOS pages, popups, tabs or CTX topology.

## 4. Declarative decision model

When a decision depends only on observable state and has no side effects, it is represented as a declarative expression rather than an imperative branch.

Examples include:

- calculated field values;
- field editability and presentation;
- action visibility/enabled state;
- tab visibility;
- list/query exception predicates;
- status/description/icon presentation.

Expressions are source contracts. Each execution host compiles/parses source using the shared language implementation and caches its runtime-local AST.

```text
metadata expression source
          |
          v
 shared grammar/compiler
          |
          v
 runtime-local AST
          |
    +-----+------+----------------+
    |            |                |
 browser      server          datastore
 UI logic   server logic   translatable predicate
```

Execution ownership follows semantics. The server does not evaluate UI-owned expressions against a fabricated client CTX.

## 5. CTX runtime model

CTX is an observable runtime tree, with distinct hosts for API operations and interactive UI composition. The modern UIS root is:

```text
ctx
├── system
├── company
├── runtime
│   ├── subsystems
│   ├── entities
│   ├── enums
│   └── user
├── flow                independent Flow execution state
└── ui
    └── level           owns #control #state #layout #data
        └── level       nested child surface, when present
```

`$runtime` addresses the canonical runtime branch; `$entities`, `$enums` and `$user` are aliases to its members. The API uses a different tree shape with parallel `api.level-<request>` branches. EJS0's legacy browser context is distinct from the modern UIS root. See [Context Architecture](../context/Context-Architecture.md).

## 6. Entry state model

The current UIS Entry owns the canonical editable record and its baseline:

```text
Entry surface level
├── #control          invocation, command and resource boundary
├── #data
│   ├── current         canonical editable field values
│   └── original        record baseline
├── #state
│   ├── fields          per-field validation/dirty state
│   └── entry           derived aggregate status
└── #layout             semantic Entry and Field components
```

A field component decodes input and requests `EntryRuntime.setField()`; the Entry writes the authoritative working record. Derived state and views observe canonical changes. The baseline changes only through controlled lifecycle/reconciliation. In particular, a legacy EJS0 field-node path such as `fields.<key>.value` is not the current UIS Entry value authority. Compound editors can additionally own transaction/draft state with a defined commit boundary.

## 7. Client/UI ownership

A UI-capable client owns its presentation/runtime concerns:

- page/popup composition;
- recursive UI-level lifecycle;
- field interaction state;
- dirty/valid/loading/saving presentation state;
- selector invocation and return behavior;
- hierarchy working state;
- evaluation of UI-owned declarative expressions.

The server may provide declarative UI metadata. It does not construct runtime client topology or execute client presentation semantics. The TypeScript repository realizes this through the shared `shared.UI` framework and Angular/EJS adapters alongside the separate established EJS0 client. Other technologies may use the same contracts without changing the API's authority.

## 8. Security boundary

Authentication establishes identity. Authorization remains server authoritative.

CTX exposes safe authorization **facts**, for example record permissions or platform capabilities. UI expressions may use those facts to decide presentation, but hiding/disabling an action never grants or revokes authority.

```text
server authorization
       |
       +--> safe permission/capability facts --> CTX --> UI policy
       |
       +--> operation authorization -----------------> API command
```

Every command is independently authorized and validated server-side.

## 9. Relationships and delete semantics

Canonical relationships describe entity semantics, including cascade, unlink, set-null, restrict and retain behavior. Delete impact is planned before mutation so clients can present the consequences without reproducing relationship rules.

Hierarchy calculations that require persisted entity traversal use resolver-capable entity operations rather than depending on whichever records happen to be loaded in a UI list.

## 10. Transactional workspaces

Aggregate editors such as hierarchy workspaces own a working graph distinct from its baseline.

```text
       baseline graph
            |
            v
      working graph <----- child edits / moves / creates
            |
            | Commit
            v
      aggregate API operation
            |
            v
       datastore transaction
```

Child edits are owner-managed operations. They do not independently persist behind the workspace owner's back. Commit is the aggregate persistence boundary.

## 11. Storage boundary

Business services depend on a datastore abstraction rather than a concrete database. Query contracts preserve structured predicates so capable adapters can push filtering and authorization into selection rather than materializing forbidden/unwanted rows first.

The storage implementation is responsible for atomic persistence where the domain operation requires a transaction.

## 12. Architectural invariants

1. A concept has one authoritative representation unless two representations have genuinely different semantics.
2. A mutation has one ownership path.
3. CTX-observable, side-effect-free decisions are candidates for declarative expressions.
4. UI policy does not replace server authorization.
5. The server does not fabricate client UI runtime topology.
6. Expression source is portable; compiled AST is process-local runtime infrastructure and is never semantic CTX, metadata, or surface-invocation state.
7. Entry live scalar authority in modern UIS is `#data.current.<key>`.
8. Entry baseline authority in modern UIS is `#data.original.<key>`; `#state.fields` derives per-field state.
9. Transactional baseline/working pairs are retained when they represent genuinely different states.
10. Generic metadata/runtime infrastructure is preferred over entity-specific branches.

## Current TypeScript composition

The npm workspaces are `shared`, `shared.UI`, `shared.UI.NG`, `shared.UI.EJS`, `api`, `ui.EJS0`, `ui.NG1` and `ui.EJS1`. `shared` provides canonical domain, metadata, expression and CTX infrastructure. `shared.UI` provides semantic UI runtime and components. The Angular and EJS adapters host those semantics in framework-specific presentation; UI applications compose the hosts. The API remains an independently deployed/operated authority.

The cross-client principle is intentionally asymmetric: presentations can differ in components, windows, modal controls and native capabilities while sharing the same semantic entity and request contracts. Other technology implementations, including .NET and Kotlin, are architectural illustrations only in this TypeScript-focused reference.

See [UIS Architecture](../clients/UIS-Architecture.md) and [Repository Structure](../development/Repository-Structure.md).
