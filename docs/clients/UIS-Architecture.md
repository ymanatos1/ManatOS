# UIS Framework Architecture

The **UI Semantic Infrastructure (UIS)** separates the meaning and lifecycle of an interactive application surface from the technology that draws it. A List, Entry, popup, embedded field or workflow retains a shared semantic contract even when Angular and EJS use different rendering mechanisms.

UIS is not a collection of interchangeable HTML widgets. It is a runtime composition model: a host owns a semantic surface; that surface owns CTX namespaces and a component layout; concrete components contribute behavior and requests; a rendering adapter projects the resulting contract to a user interface.

## The architectural boundary

```text
Canonical metadata / API contracts / CTX
                  │
           shared.UI runtime
    surface ownership · state · layout
       semantic actions · reactivity
                  │
         shared component model
     List · Entry · Fields · Popups
                  │
        technology adapters
      shared.UI.NG   shared.UI.EJS
            │             │
           ui.NG1        ui.EJS1
                  │
          host-specific DOM,
     events, focus and window APIs
```

The core TypeScript repository also includes `ui.EJS0`, which provides valuable mature behavioral/presentation examples but does not by itself define current UIS ownership. An additional native client technology can implement the rendering side of the same semantic model; the TypeScript contracts, not a claimed native parity status, define portability.

## Foreground busy operations

`UiBusyRuntime` is the shared, framework-independent foreground-operation lease manager in `shared.UI/src/runtime/ui-busy-runtime.ts`. A host explicitly opts an operation in through `begin()`/its idempotent completion function, or `run()` which releases the lease in `finally`. Multiple foreground operations may overlap; the runtime exposes active count, visibility and presentation metadata to observers.

The busy indicator appears only when an operation outlives the default **180 ms** delay, avoiding flicker for quick requests. Ordinary background requests, page loading and popup opening are **not** automatically foreground-busy operations. Angular's `BusyOverlay` and the EJS equivalent render the shared state as a modal overlay; neither owns the API request or the business result.

```text
explicit foreground operation ─► UiBusyRuntime lease
                                    │
                           180 ms visibility delay
                                    │
                      NG / EJS BusyOverlay presentation
                                    │
                      operation completion (also on error)
                                    │
                              release lease
```

This is an interaction/lifecycle guarantee, not a guarantee that every network request displays a spinner.

## Surface identity and lifecycle

`UiSurfaceHostRuntime` in `shared.UI/src/runtime/surface/host-runtime.ts` creates an owned surface under the single canonical UI chain `ctx.ui.level.level...`. Every surface publishes exactly four namespaces, named `control`, `state`, `layout` and `data`. Components operate within that owner rather than introducing competing global branches.

| Namespace | Responsibility |
|---|---|
| `#control` | Identity, kind, lifecycle and semantic control references |
| `#state` | Working UI decisions such as tab selection, activity and editing state |
| `#layout` | Semantic composition of visible/embedded components |
| `#data` | Presentation input and current surface information, including entry working values when applicable |

The surface must establish semantic roles before observers are notified. Disposal is identity-checked: an outdated surface instance must never delete a newer owner that happens to reuse a path. A parent cannot be disposed while it still owns a nested child. These guarantees are architectural, not incidental DOM details.

## Ownership across the layers

| Layer | Owns | Does not own |
|---|---|---|
| `shared` | Canonical metadata, CTX engine, expressions, domain contracts | Browser focus or modal windows |
| `shared.UI` | Surface/Flow semantics, component contracts, lifecycle, reusable UI state | Angular/EJS DOM implementation |
| `shared.UI.NG`, `shared.UI.EJS` | Framework component hosts, templates, events, focus and rendering | Re-definition of entity semantics or API authority |
| `ui.NG1`, `ui.EJS1` | Host composition, routes, API transport and session integration | A second independently mutable entry model |
| API | Authentication, authorization, transactions and persisted facts | Trusting the client DOM as authority |

A field interaction is a request to perform a semantic action; it is not permission for a component to write arbitrary CTX branches or bypass API policy. Embedded components contribute under their declared parent, and reusable field behavior is independent of their visual technology.

## Composition: Page, List, Entry and Popup

A Page provides route and content hosting. A List represents a metadata-defined collection with query/filter/paging/selection semantics; a List popup reuses that surface to select a related Entry. An Entry owns its working values, canonical metadata resolution, edit/dirty reconciliation and field composition. A popup contributes modality, invocation context and return behavior; opening a nested popup adds a child surface under the invoking level rather than creating a second global UI runtime.

Typed fields use shared behavior declarations under `shared.UI/src/components/fields/` and embedded Entry components under `shared.UI/src/components/entry/embedded/`. A generic host should orchestrate rather than embed per-field business rules. The actual implementation also contains adapter-specific field components and compatibility paths; architectural ownership must be confirmed for each feature before asserting full parity.

## UIS and Flows are distinct

`ctx.flow` describes the orchestration of an operation across steps. It is not another UI surface, and a surface's nested `#level` is not a Flow step. A Flow can open a surface and respond to its typed events, but the Flow runner owns step transitions and the surface host owns UI lifecycle. See [Flow Execution](Flow-Execution.md).

## Extension model

To add a reusable UI component, define its shared semantic contract and behavior first; declare its owned layout/actions and metadata inputs; expose rendering adapters that consume the contract; add focused regression scenarios for the affected clients. A new rendering technology should implement host/component presentation boundaries while reusing canonical metadata and API guarantees.

This structure makes additional client technologies possible without redesigning business entities for each framework. Portability is an architectural goal and depends on actual adapter coverage and behavior, not on names or directory symmetry.

## Related references

- [UI Surfaces and Levels](UI-Surfaces-and-Levels.md) — precise semantic layout and nested context.
- [UIS Components and Ownership](UIS-Component-Contracts.md) — component boundaries and field integration.
- [Flow Execution](Flow-Execution.md) — operation orchestration.
- [Entity Lists](../entities/Entity-Lists.md) and [Entity Entries](../entities/Entity-Entries.md).
- [Client Context Model](../context/Client-Context-Model.md).

## Why this abstraction matters for application designers

Application authors describe an entity and its intended presentation rather than independently implement one form in Angular, another in EJS and a third in a new client technology. The common UIS model provides semantic Entry/List/Popup ownership and type-specific component contracts. The adapter supplies technology-specific rendering, input, focus and window behavior. The API remains a separately authoritative boundary.

```text
Application model
  entity + UI Views + relationships
             │
    UIS shared component model
       Entry / List / Popup
             │
   ┌─────────┴─────────┐
   │                   │
 Angular adapter    EJS adapter
   │                   │
  browser UI         browser UI
   └─────────┬─────────┘
             │
       authoritative API
```

This is not a claim of perfect adapter parity. The actual shared field registry, embedded components and adapters must be traced for each behavior. A shared semantic contract makes additional implementations less duplicative, but their actual engineering quality still depends on concrete integration.

## Composition, invocation and results

A List that selects a related record is semantically a **List surface with a selection result**, even if it is presented within a popup. An Entry used in a popup similarly retains Entry content semantics while acquiring popup lifecycle and return behavior from the host. The invoking surface is responsible for accepting the result, updating its own canonical working state and restoring appropriate focus.

```text
Entry page level
   └─ ReferenceField action
        └─ nested List popup level
              └─ select stable record identity
                    └─ invocation result
                          └─ Entry setField()
```

This avoids duplicating the List or Entry implementation for every host mode. The parent remains the semantic owner of its working field; the child cannot overwrite arbitrary ancestor CTX branches. Child-close and disposal checks prevent stale popup instances from corrupting the active parent.

See [UIS Surface Composition](UIS-Surface-Composition.md) for the detailed levels, resources, action path, and host/adapter split.
