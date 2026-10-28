# CTX Catalog

CTX is a scoped semantic runtime, not one universal object shape. The modern Angular/EJS UIS clients and the API construct different roots. This catalog enumerates the public *conceptual* branches; individual children are published by the owning runtime and depend on selected metadata and active operations.

## EJS1 / NG1 root

| Path | Meaning | Owning boundary |
|---|---|---|
| `ctx.system` | Safe runtime and host information | Bootstrap |
| `ctx.company` | Shared domain/selected platform | Platform selection/runtime |
| `ctx.runtime` or `$runtime` | Effective current composition | Runtime bootstrap |
| `$runtime.subsystems` | Effective subsystems | Runtime metadata composition |
| `$runtime.entities` or `$entities` | Effective entity metadata | Entity registry |
| `$runtime.enums` or `$enums` | Effective enum metadata and items | Enum registry |
| `$runtime.user` or `$user` | Authenticated-user projection or null | Session/host integration |
| `ctx.flow` | Active Flow status, steps and current pointer | FlowRunner |
| `ctx.ui.level[.level...]` | One active nested semantic surface chain | UIS Surface Host |

`$entities`, `$enums` and `$user` are *aliases*, not independent persisted copies. A historical `ctx.user` root may appear in EJS0 examples, but it does not describe the modern `ManatOSRuntimeRootContext`.

## Modern Page/Popup level

```text
ctx.ui.level
├─ control    host · kind · identity · invocation
├─ state      current semantic UI state
├─ layout     component-contributed semantic tree
├─ data       values and resolved resources
└─ level?     nested active surface, if opened
```

The four namespaces are created together by `UiSurfaceHostRuntime`. A component does not get to add a second authoritative copy of a List or Entry record. The root Page slot is unique; a Popup occupies a nested child of the active chain.

## Entry projection

| Path | Meaning |
|---|---|
| `#data.original` | Original/baseline record or null |
| `#data.current` | Working record values; Entry edit authority |
| `#data.references` | Resolved reference catalogue data |
| `#data.imageVariants` | Resource presentation facts |
| `#state.entry.mode` | `create`, `view`, `edit` |
| `#state.entry.activeTab` | Current Entry tab |
| `#state.entry.dirty` | Baseline-versus-working-state comparison |
| `#state.entry.valid` | Entry validation projection |
| `#state.entry.saveReady` | Current UI save readiness |
| `#state.fields` | Derived per-field validation and presentation facts |
| `#layout` | Entry/Tab/Field/embedded semantic contributions |

These shapes are defined in `shared.UI/src/components/entry/EntryRuntime.ts` and its semantic embedded components. Older EJS0 `fields.<key>.value` models are not substitutes for `#data.current` in this contract.

## List projection

| Path | Meaning |
|---|---|
| `#state.list` | Query and UI state: view, sort, page, size, load/error, selection mode |
| `#data.list` | Current loaded List rows |
| `#data.filters` | Filter values |
| `#data.references` | Related display/catalogue data |
| `#data.listModel` | Descriptor, query, selected IDs, pagination |

The query runtime and selection behavior are implemented under `shared.UI/src/components/list/`. Only field components own field-type formatting; Lists need not duplicate the type switch.

## Flows

`ctx.flow` is a separate Flow-owned branch. It has `control` (host=`flow`, name, instance identity, status and current-step pointer) and `steps` (step-owned state). Its nesting is not a second `ctx.ui` surface chain. A Flow may open or close UIS surfaces, but its orchestration remains independent of browser window layout.

## API CTX and operation traces

The API host owns a separate root and request-scoped levels; process-local operation tracing uses a different Node-specific facility. See [API Context Model](API-Context-Model.md). Debugger viewing should respect the selected context target and not treat detached tabs as a new canonical owner.

## Lookup semantics

Absolute paths and aliases resolve from the host's root; ordinary first identifiers are lexical; subsequent members traverse strictly downward. `?.` handles missing/null optional receivers, `??` provides a fallback value, and `? :` selects between branches. These are distinct, implemented operators. See [Expressions](../expressions/Expressions.md) and [CTX Reference](CTX-Reference.md).
