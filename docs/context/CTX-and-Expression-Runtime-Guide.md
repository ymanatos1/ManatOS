# CTX and Expression Runtime Guide

CTX and the expression evaluator provide a common semantic execution foundation. CTX owns an observable tree of application facts; expressions interpret declarative formulas against a caller-supplied scope; UIS and API hosts determine which facts, capabilities and side effects are permitted. No component can become a second canonical owner by rendering or inspecting a value.

This guide describes the current shared TypeScript contracts. For detailed root vocabulary, see [Client Context Model](Client-Context-Model.md), [API Context Model](API-Context-Model.md) and [CTX Catalog](CTX-Catalog.md).

## 1. Architectural responsibilities

```text
             Domain / UI metadata declarations
                              │
                              ▼
                expression source + facts
                              │
                tokenizer → parser → AST
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
 Host-owned CTX context                    capability policy
 root · current scope                      pure / clock / ctx
 revisions · subscriptions                 entityResolver
          └───────────────────┬───────────────────┘
                              ▼
                typed evaluation or error
                              │
                              ▼
                owning service / UI surface
                 decides whether to mutate
```

The interpreter never independently commits a database operation, authorizes a request, publishes a UI level or acquires a browser capability. An AST is execution infrastructure, not authoritative CTX state. A metadata expression's source text is the portable authored contract.

## 2. CTX roots and aliases

Modern EJS1/NG1 clients have `system`, `company`, `runtime`, optional `flow` and dynamically created `ui` branches. The `runtime` branch owns effective `subsystems`, `entities`, `enums` and `user`. `$runtime` addresses the effective branch, while `$entities`, `$enums` and `$user` are aliases into that branch. They are not independent copies that require synchronization.

A modern UI surface owns `ctx.ui.level[.level...]` with the four canonical namespaces `control`, `state`, `layout`, `data`. An Entry owns its current working record under `#data.current`; a List owns its rows and query state under `#data.list`, `#data.listModel` and `#state.list`.

The API constructs a separate CTX root and request-level branches. `ui.EJS0` has its own established CTX and browser runtime. Its field-node authority (`fields.<key>.value`) does **not** redefine modern UIS Entry ownership. Never use an EJS0-only path as the generic shared runtime contract.

## 3. Tree mutation and observation

`ContextTreeRuntime<T>` in `shared/src/context/context-tree-runtime.ts` provides canonical path addressing and structural operations:

| Method | Role |
|---|---|
| `get(path)` | Read the value at a CTX path |
| `set(path, value)` | Update a known path |
| `setMembers(path, members)` | Coordinate updates to multiple members as one structural mutation |
| `add(parentPath, key, value)` | Create a child at a named parent |
| `delete(path)` | Remove an owned path |
| `subscribe(listener, options)` | Observe all changes or a path-filtered set; recursive and optional asynchronous delivery |
| `registerSemanticKind` / `unregisterSemanticKind` | Annotate the meaning of an owned path for tooling |

Each mutation has a monotonically increasing revision, a kind, directly affected path and affected-path collection. Subscribers observe changes according to their registered path/recursive policy. Synchronous delivery is the default; a subscriber can opt into microtask delivery. Consumers must not treat UI event handler order as a substitute for semantic revision/lifecycle ownership.

`GlobalContextStatistics` tracks logical node and byte statistics. The Viewer is a consumer of the observable tree rather than the authority for its contents.

## 4. Lexical expressions

The parser recognizes literals, arrays, groups, registered functions, arithmetic, comparison, membership (`IN`), bitwise/logical operators, lazy conditional (`? :`), nullish fallback (`??`) and optional path traversal (`?.`). Operator and grammar details are in [Expressions](../expressions/Expressions.md).

Only the first ordinary identifier is sought lexically (current scope outward through ancestry). Once resolved, its remaining path members traverse strictly downward. A missing mandatory member is not silently resolved from a different ancestor. The optional operator marks the preceding receiver and returns `null` when that receiver is absent or null; it does not disable all missing-name errors. Both sync and async resolvers implement this contract.

Dynamic path segments may resolve strings or nonnegative integer indices; invalid dynamic member types produce an expression error. Absolute `$runtime` and relative selectors such as `#level`, `#data` and `#state` are preferable when ownership matters.

## 5. Compilation and evaluation

Compilation tokenizes and parses the source into an AST. The parser validates registered function existence and signatures. Evaluation is separately supplied with root, current scope, clock, capability set, diagnostics and (where required) the asynchronous persisted-entity resolver. Pure and clock/CTX expressions should not accidentally gain authorization or write capabilities.

`TraverseEntity` requires an authorized asynchronous resolver; client expressions that lack it must not be made equivalent by hidden network calls. Expression errors and diagnostics are reported at their owning boundary. A calculation failure should not silently produce an authorized operation or replace a trusted business value.

## 6. Reactive UI execution

`shared.UI/src/runtime/reactivity.ts` extracts CTX dependencies from the compiled AST. Static `#data`, `#state`, `#layout` and `#control` paths are mapped to the owning level; lexically ambiguous or dynamic dependencies conservatively depend on the root rather than missing valid changes. Subscribers react to mutation notifications and reevaluate their own declared expression outputs.

A field edit follows this ownership path:

```text
Native input event
       │
       ▼
Registered typed Field behavior
       │ semantic field intent
       ▼
EntryRuntime.setField()
       │
       ▼
#data.current  ──► #state.fields / #state.entry
       │                     │
       └──────────┬──────────┘
                  ▼
             CTX mutation
                  │
                  ▼
        reactive dependent expressions
```

The Entry runtime, not the DOM or a generic wrapper, performs the working-value mutation. Derived fields, validation, action enablement and tab visibility may be projected from canonical facts. All resulting UI state remains presentation; authorization is checked again by the API.

## 7. Flow execution is separate

`FlowRunner` owns a `ctx.flow` branch with control/status and step subtrees. Flow steps can request surfaces, but their operation lifecycle is not represented by recursively adding a UI level for every step. A Popup remains under `ctx.ui.level.level...`; a Flow's current step is a pointer to step state. This separation prevents a browser navigation event from accidentally mutating the orchestration authority.

## 8. Diagnostics, safety and extension

The Viewer, CLI and debugging tools inspect CTX using the same path/identity semantics. Detaching a debugger window or showing a node does not create a second source of state. Sensitive server data and credentials should not be projected into client-visible CTX for convenience. Each expression host must explicitly authorize capabilities, limit untrusted operations and handle errors without revealing secrets.

When extending the evaluator, update the shared tokenizer/parser/resolver/evaluator only where the grammar truly changes; registered business functions normally belong in `shared/src/expressions/functions/registry.ts`. When extending UIS, use semantic owners and adapters rather than introducing host-local mutable mirrors.

## Related references

[Context Architecture](Context-Architecture.md), [State Mutation and Events](State-Mutation-and-Events.md), [Expressions](../expressions/Expressions.md), [UIS Architecture](../clients/UIS-Architecture.md), [Flow Execution](../clients/Flow-Execution.md), [Debugger](../diagnostics/Developer-Tools.md).
