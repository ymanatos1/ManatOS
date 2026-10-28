# State, Mutation and Events

Reactive behavior depends on **semantic changes to owned runtime state**, not merely on DOM events. The shared CTX runtime provides canonical tree addressing, revisions and subscriptions. A higher-level owner—API request, UIS surface, typed component or Flow—decides which changes are valid and how derived values are recomputed.

## 1. State ownership

```text
        Authoritative runtime owner
          (API / Entry / List / Flow)
                       │
                 CTX mutation
                       │
                revision + paths
                       │
          ┌────────────┴──────────────┐
          ▼                           ▼
     subscribers                diagnostics
          │                           │
          ▼                           ▼
    derived semantic             view of state
       projections              (not its owner)
```

The CTX tree is not a database; it is not a second authorization service; it is not a DOM mirror. A control displays and sends a semantic intent. The owning runtime validates the intent, updates canonical working state and publishes the resulting change. Application entities remain authoritative only once an API operation accepts and persists them.

## 2. Structural mutation contract

`ContextTreeRuntime` exposes `get`, `set`, `setMembers`, `add`, `delete`, `subscribe`, semantic-kind registration and statistics. `ContextTreeMutation` includes `revision`, `kind`, `path` and `paths` (all directly affected members of an atomic mutation). `setMembers` can publish coordinated `state`/`data` changes as one revision.

Subscription options include a path filter, recursive descendant observation, an identifying label and optional asynchronous delivery. The default is synchronous delivery; `async: true` uses a microtask. Subscribers must tolerate registration and disposal over time and must not assume that unrelated consumers observe mutations in a browser event order.

## 3. UIS ownership and record editing

The modern UIS content model separates control, state, data and layout:

```text
ctx.ui.level
├─ control   kind · host · invocation · instanceId
├─ state     semantic flags, field validation, query state
├─ layout    component-contributed semantic structure
└─ data      working records, baselines, resources
```

An Entry's record value authority is `#data.current`, with `#data.original` as the baseline. Its derived entry flags belong to `#state.entry`; field-specific facts belong to `#state.fields`. A List's loaded rows belong to `#data.list`; pagination/query control is under `#state.list` and `#data.listModel`. The user-facing field components decode native input and send an intent to the runtime; they do not each maintain a separate persisted record.

The established EJS0 implementation uses a different browser-runtime field-node model, including `fields.<key>.value` and baseline field values. That representation is valid when explicitly describing EJS0, but it is not the canonical state authority for `shared.UI`/NG1/EJS1. Cross-client behavior should be specified in terms of shared semantic contracts rather than copied legacy CTX paths.

## 4. Reactive expression dependencies

`shared.UI/src/runtime/reactivity.ts` compiles expression source and walks the AST for variable dependencies. Paths with explicit `#data`, `#state`, `#layout`, `#control` and `#level` selectors can be mapped to the owning surface. Dynamic paths and ambiguous lexical roots conservatively subscribe at broader scope so that a dependency is not silently ignored.

```text
#data.current.quantity ──────┐
                             ├─► expression / projection ─► #state or #data derived fact
#data.current.unitPrice ─────┘
```

Subscription filters and mutation paths determine invalidation, not whether a specific text box fired `change` or `blur`. Calculations must be evaluated in the correct owning scope, and a failed expression must be reported through its appropriate diagnostic boundary rather than implicitly committing an undefined value.

## 5. Lifecycle safety

A UIS Surface Host creates the complete set of `#control`, `#state`, `#layout` and `#data` namespaces in one owned publication. Semantic role annotations are registered before consumers receive the new tree. Disposal is identity-checked and child-safe: a retired surface cannot erase the context of a newer instance that reused a path.

Nested popups occupy the next child `level`. Closing a parent with an active child is deferred or rejected by the owning runtime, not bypassed by deleting the tree directly. Embedded components register and clean up only their own subscriptions and layout contributions.

## 6. Flow ownership and events

`ctx.flow` is independent of the active `ctx.ui.level` hierarchy. A Flow's step state and current-step pointer are owned by `FlowRunner`; a step may initiate a popup or await an event, but the popup and Flow have separate semantic identity. Flow execution must not depend on arbitrary DOM visibility or debugger focus.

## 7. API request and storage mutation

The API's context is request-scoped and has a different root from a modern UI CTX. Server operations authenticate and authorize independently of client runtime state. Storage transactions, relationship validation and persisted calculations are authoritative operations; a client CTX change is neither a successful database commit nor proof of permission.

## 8. Observability and diagnostics

The CTX Viewer, debugger and CLI inspect the same semantic paths and revisions. The description of a node (type, semantic kind, children, byte statistics) belongs to inspection metadata, not to a duplicated application state store. Notifications can update visible nodes incrementally without cloning the tree into a second authority. Sensitive values must remain outside any client-safe diagnostic projection.

## 9. Engineering invariants

- One owning runtime for each authoritative semantic value.
- Explicit path ownership and deterministic component/surface disposal.
- Host-independent CTX mutation semantics across API and clients, despite different root shapes.
- Server-side authorization and storage constraints independent of client projections.
- Correct lexical expression scope, optional/mandatory path semantics and error isolation.
- Safe subscription lifetimes; no duplicated dependency authority in DOM or browser event handlers.

See [CTX Catalog](CTX-Catalog.md), [Client Context](Client-Context-Model.md), [Expression Architecture](../expressions/Expression-Architecture.md), [UIS Surfaces](../clients/UI-Surfaces-and-Levels.md), and [Flow Execution](../clients/Flow-Execution.md).
