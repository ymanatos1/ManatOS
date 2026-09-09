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

## 3. Metadata-driven SysBO model

A SysBO definition has a stable entity key such as `sys-users` or `sys-principals`. Storage-generated record identifiers are independent of that key.

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

CTX is the observable runtime state tree available to the expression engine and diagnostics.

```text
ctx
+-- system
+-- entities
+-- company
+-- user
|   +-- fields
|   +-- permissions
+-- ui
    +-- level
        +-- level
            +-- ...
```

`ctx.ui.level.level...` is the single currently displayed UI chain. Pages and popups share the same recursive model. There is no second public active-surface topology.

CTX is runtime state, not business persistence. Its mutation path owns events, dependency propagation and lifecycle semantics.

## 6. Entry state model

An entry level owns one record's field lifecycle.

```text
entry level
+-- entry
|   +-- original          immutable baseline record
|   +-- current           derived whole-record projection
+-- fields
|   +-- <field>
|       +-- value         canonical live scalar value
|       +-- dirty         derived from value vs baseline
|       +-- valid
|       +-- validationIssues[]
|       +-- ux
+-- facts                 non-persisted observations
+-- state
```

The authority rules are deliberately singular:

```text
LIVE AUTHORITY                 BASELINE AUTHORITY
fields.<k>.value               entry.original[k]
       |                              |
       +------------+-----------------+
                    |
                    v
          derived field dirty
                    |
                    v
          derived entry.current
                    |
                    v
          derived surface dirty
```

`entry.current` is a projection of live `fields.<k>.value` values, not an independently writable record. `entry.original` is likewise a projection of `fields.<k>.originalValue`; the field state owns both live and baseline scalar authority symmetrically.

`facts` are API-safe observations useful to expressions but not persisted fields. They never enter persistence payloads merely because they exist in CTX.

## 7. UI ownership

The client UI engine owns:

- page/popup composition;
- recursive UI-level lifecycle;
- field interaction state;
- dirty/valid/loading/saving presentation state;
- selector invocation and return behavior;
- hierarchy working state;
- evaluation of UI-owned declarative expressions.

The server may provide declarative UI metadata. It does not construct runtime client topology or execute client presentation semantics.

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
6. Expression source is portable; compiled AST is runtime-local by default.
7. Entry live scalar authority is `fields.<key>.value`.
8. Entry baseline authority is `fields.<k>.originalValue`; `entry.original.<k>` is a read-only mirror.
9. Transactional baseline/working pairs are retained when they represent genuinely different states.
10. Generic metadata/runtime infrastructure is preferred over entity-specific branches.
