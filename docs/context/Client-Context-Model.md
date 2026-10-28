# Client Context Model

CTX provides a host-owned semantic tree for runtime facts, expression scope, observable UI state and diagnostics. A client CTX is **not** a replicated API database and is not automatically synchronized with server CTX. Values are published by their designated owners; components observe authorized projections rather than maintaining parallel copies of the same state.

## Canonical modern client root

The current EJS1/NG1 root is defined by `ManatOSRuntimeRootContext` in `shared/src/context/manatos-context.ts`:

```text
ctx
├─ system                   host/runtime/client facts
├─ company                  shared domain + selected platform
├─ runtime                  effective selected composition
│  ├─ subsystems             selected subsystem catalogue
│  ├─ entities               canonical effective entity metadata
│  ├─ enums                  effective enum definitions/values
│  └─ user                   authenticated user or null
├─ flow?                    current Flow execution (separate from UI)
│  ├─ control                identity/status/current-step pointer
│  └─ steps                  step-owned state
└─ ui?                      current semantic UI chain
   └─ level                  active Page surface
      ├─ control
      ├─ state
      ├─ layout
      ├─ data
      └─ level?              active nested Popup surface
         ├─ control
         ├─ state
         ├─ layout
         └─ data
```

The `ui` root branch is created by its surface host when needed; it is not a permanent collection of all visited pages. The `flow` branch is optional and owned by FlowRunner. `$runtime`, `$entities`, `$enums` and `$user` are concise expression/viewer access paths; the last three refer to `runtime.entities`, `runtime.enums` and `runtime.user` rather than independent enumerated root branches.

The established `ui.EJS0` client retains a separate legacy CTX topology. Its `ctx.entities`, `ctx.enums`, `ctx.user` and field-node structures are not the canonical EJS1/NG1 contract and should only be used in descriptions explicitly scoped to EJS0.

## Ownership and lifecycle

| Context branch | Owner | What consumers may assume |
|---|---|---|
| `system` | Bootstrap/host | Safe host, client and runtime facts; no secrets or arbitrary access to host internals |
| `company` | Runtime company/platform selection | Shared catalog and current platform selection |
| `runtime` | Effective subsystem/bootstrap projection | Readable metadata, enums and authenticated-user projection |
| `flow` | `FlowRunner` | Active named operation and step statuses, not visual nesting |
| `ui.level[.level...]` | `UiSurfaceHostRuntime` | Exactly one active child chain with per-surface namespaces |
| `#layout` contributions | Embedded semantic components | Declarative component hierarchy attached under the owning level |
| `#state`, `#data` | List, Entry, Popup or other content runtimes | Observable mutable facts, subject to that content's ownership rules |

The host creates `#control`, `#state`, `#layout` and `#data` atomically, registers their semantic roles and publishes the complete level. A surface can dispose only the level it owns; an active child prevents premature parent teardown. Framework adapters may render or collect input, but cannot replace these semantic owners.

## Level identity, kind and mode

A surface's `control` establishes `host` (`page` or `popup`), `kind` (for example `list` or `entry`), `instanceId` and `invocation`. Hosting, semantic kind and operational mode are different dimensions. For an Entry, create/view/edit mode is projected in `#state.entry.mode`; `#control.kind` remains `entry` regardless of how it is displayed.

```text
List Page  ctx.ui.level
  └─ Entry Popup     ctx.ui.level.level
       └─ List Popup ctx.ui.level.level.level
```

This is a semantic ownership chain, not a CSS z-index relationship. Embedded components contribute their own layout/state under a level without creating duplicate business-object state authorities.

## List data and state

`shared.UI/src/components/list/ListPageRuntime.ts` defines the modern List level. Key projections include:

```text
#state.list
  view, page, pageSize, total, totalPages
  sort, direction, loading, error
  selectionMode, filtersVisible, viewsOpen
#data
  list[]                 loaded rows
  filters                current query filters
  references             resolved related-record data
  listModel              query descriptor, selectedIds, paging
```

The query runtime owns search/filter/sort/page transitions and asynchronous results. List and cell components are semantic views of these facts; adapter templates must not become parallel query managers.

## Entry values and state

`shared.UI/src/components/entry/EntryRuntime.ts` defines Entry levels. **`#data.current` is the editable value authority; `#data.original` is the baseline.** Field-specific presentation/validation facts are projections under `#state.fields`, and overall mode/dirty/valid/loading/save flags live under `#state.entry`.

```text
#control  host · kind=entry · entityName · instanceId · invocation
#data
  original      persisted baseline or null for creation
  current       working record values
  references    resolved reference data
  imageVariants
#state
  fields        field-specific validation/presentation
  entry         mode · activeTab · permissions · dirty · valid · saveReady
#layout         semantic Entry / Tabs / Fields / embedded components
```

A field adapter reports native input facts; its registered typed Field behavior interprets those facts; the Entry runtime applies the value to the owned `current` record and republishes derived state. The UI's dirty or permission indicator is not server-side authorization and does not commit data by itself.

## Expression resolution

The evaluator searches only the first ordinary identifier lexically outward, then traverses the remaining path downward. Relative selectors `#`, `#level`, `#control`, `#state`, `#layout`, `#data`, `#flowstep` refer to the appropriate semantic scopes. Absolute `$runtime` and its aliases are the preferred way to access effective global metadata and session projections.

The implemented `?.` operator tolerates missing/null receivers; mandatory segments remain strict. For example `#data.current?.managerId ?? null` uses optional traversal and nullish fallback as separate language operations. See [Expressions](../expressions/Expressions.md).

## API CTX is separate

API CTX has a different root and parallel request subtrees. It is not an identical client snapshot, and Node's operation trace is not the CTX tree. See [API Context Model](API-Context-Model.md) and [Context Architecture](Context-Architecture.md).

## Related documentation

[CTX Reference](CTX-Reference.md), [CTX Catalog](CTX-Catalog.md), [State and Events](State-Mutation-and-Events.md), [UIS Surfaces](../clients/UI-Surfaces-and-Levels.md), [Flow Execution](../clients/Flow-Execution.md).
