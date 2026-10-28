# Context Architecture

CTX is the shared model for **host-owned, scoped and observable runtime facts**. It offers hierarchical lookup, explicit mutation, change observation, ownership and cleanup. It is not a database, an application-wide event bus or the Debugger itself. The API and each interactive client construct independent CTX trees; neither synchronizes its entire tree with another host.

## Roots and owners

```text
ContextTreeRuntime (common engine)
├── TypeScript UIS host
│   ├── system / company
│   ├── runtime
│   │   ├── subsystems
│   │   ├── entities
│   │   ├── enums
│   │   └── user
│   ├── flow                  optional operation execution
│   └── ui
│       └── level             active semantic surface
│           └── level         optional nested surface
└── API host
    ├── system / company / entities / enums
    └── api
        └── level-<request>   parallel request branches
            └── level-<nested operation>
```

The modern UI uses `$runtime` for the canonical runtime branch; `$entities`, `$enums` and `$user` are convenience aliases to its contents, not competing stores. `ui.EJS0` has a distinct established legacy context representation. It is documented where its behavior matters and is not imposed on the shared UIS contract.

## Shared engine

The context engine in `shared/src/context/` owns path resolution, mutations, revisions, observation and lifetime. Consumers select an explicit host root and lexical scope. A subscription belongs to its owner and must be disposed with that owner; a UI adapter may display a value but must not silently become its authoritative writer.

The expression evaluator provides lexical lookup, CTX aliases, mandatory traversal and `?.` optional traversal. Optional receivers yield `null` when absent; mandatory traversal remains strict. Observers invalidate dependent expressions after canonical mutations, without requiring unrelated component state to be re-created.

## UIS level ownership

`UiSurfaceHostRuntime` in `shared.UI/src/runtime/surface/host-runtime.ts` owns the active `ctx.ui.level.level...` chain. Each level has four namespaces:

| Namespace | Responsibility |
|---|---|
| `#control` | invocation, capability/resource contracts and surface control |
| `#state` | reactive interaction, validation, dirty and action state |
| `#layout` | semantic composition and embedded component placement |
| `#data` | current semantic content and supporting data |

A nested selector or popup is a *child* of its invoking level. A child cannot acquire ownership of the parent's record merely by rendering a field selector. Level construction initializes the semantic subtree before observers encounter it; identity-checked disposal prevents an old instance from deleting a newer level.

### List and Entry

A modern **Entry** owns editable record data in `#data.current`, with `#data.original` as the comparison baseline. `#state.fields` and `#state.entry` contain derived field, validation and entry status. Field components submit typed changes to the Entry runtime (`setField`), rather than writing an alternative scalar-value store. Working aggregates and resource data have explicit owners.

A modern **List** owns results and query inputs under `#data.list`, `#data.filters`, `#data.listModel`, with interaction/selection status under `#state.list`. List queries preserve API authorization and stale-response protections.

The legacy EJS0 model stores some live field values as `fields.<key>.value`. That model must never be substituted for the modern Entry record authority in cross-client specifications.

## Flows and API execution

`ctx.flow` is the execution state of an operation under `FlowRunner` (`shared.UI/src/flows/flowRunner.ts`). Steps and substeps are **not** UI levels. A Flow can invoke a surface; the Flow owns transitions while the surface owns its nested UI lifecycle.

The API owns independently addressable parallel request branches under `api`. Node's `AsyncLocalStorage` tracks the current operation pointer; semantic facts remain in the CTX tree. A request branch is removed after its operation ends. The client cannot manufacture authorization by modifying CTX.

## Integration and assurance

A typed field input becomes an Entry semantic intent, then a controlled `#data.current` mutation; subscribers and reactive expressions observe the resulting change. API persistence is a separate, validated and authorized operation. The same boundary separates debugging from mutation: CTX Viewer, CLI and API Traffic display source-owned state and may never define an alternative state model.

See [Client Context](Client-Context-Model.md), [API Context](API-Context-Model.md), [CTX Catalog](CTX-Catalog.md), [Expressions](../expressions/Expressions.md), [UIS Architecture](../clients/UIS-Architecture.md) and [Flow Execution](../clients/Flow-Execution.md).
