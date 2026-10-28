# UI Surfaces and Levels

A **UI Surface** is a semantic unit of interaction with an explicit owner, lifecycle, CTX state and component layout. A **level** is the surface's location in the active recursive UI hierarchy. Page-hosted and popup-hosted experiences may use the same kinds of semantic content; their rendering hosts differ, but the data and ownership contracts should not.

## Hierarchy and canonical namespaces

```text
ctx.ui
└── level                      outer surface
    ├── control                identity, kind, ownership
    ├── state                  interaction state
    ├── layout                 semantic component tree
    ├── data                   selected/current presentation data
    └── level                  nested child surface
        ├── control
        ├── state
        ├── layout
        └── data
```

A List may open an Entry; an Entry may open a selector; a selector may open another owned surface. Nesting follows the invocation chain rather than creating parallel top-level trees. Source modules `host-runtime.ts`, `host-level-runtime.ts`, `embedded-runtime.ts`, `lifecycle.ts`, and `invocation.ts` establish these related but distinct responsibilities under `shared.UI/src/runtime/surface/`.

A `#level` denotes an explicit surface owner. `#layout` components are *children in its semantic composition*, not automatically child surfaces. A tab is usually a state selection within one surface; it should not create a new `#level` merely because different embedded content becomes visible.

## Construction order and observability

The host creates and publishes the four namespaces together, establishes semantic roles and then exposes the surface to observers. Child content attaches to its declared parent. A rendering adapter may mount corresponding DOM or template elements only after the semantic contract is available. This prevents transiently observable partial levels and avoids rendering components that do not yet have a stable CTX owner.

`#control`, `#state`, `#layout` and `#data` have complementary purposes. For example, field values belong to the Entry's current working data; visibility and tab selection are state; field positions and embedded child composition are layout; invocation/ownership and lifecycle belong to control or host-owned bindings. A component must not copy the whole Entry into its own state node simply to render an input.

## Nested lifetime and identity

The parent retains its original CTX path while a child is open. The active leaf receives the focused interaction, but parent ownership does not move. Child disposal must occur before parent disposal. An asynchronous completion from an old popup must not delete a replacement owner at a reused path: the host's identity check prevents that category of stale mutation.

Dirty-close coordination belongs to the surface/Entry interaction boundary. A nested Entry with pending changes must not disappear solely because a parent modal receives a generic close event. The user-facing close decision and the authoritative edit state need to agree.

## Surface types and content reuse

| Surface/content | Semantic role | Hosting consideration |
|---|---|---|
| Page | Route-owned content and shell integration | Ordinary navigation and page lifetime |
| List | Query state, collection data, selection/actions | Page or related-record selector popup |
| Entry | Working values, baseline, fields, validation and actions | Page or nested editor popup |
| Popup | Contextual invocation, modality, result, close policy | Browser modal/window handling |
| Embedded component | Controlled contribution to a parent's layout | Adapter rendering and input handling |
| Flow | Cross-step execution at `ctx.flow` | **Not** a UI surface or nested level |

A generic Popup Host may display the same List/Entry content used on a Page; it must not construct a second independent implementation of List or Entry semantics. See [UIS Architecture](UIS-Architecture.md) for the architecture and [Flow Execution](Flow-Execution.md) for the separate execution model.

## Engineering considerations

Components and surfaces should report actions through defined semantic contracts. The rendering host manages modal focus, keyboard interaction, detachable windows and DOM lifetime. No browser click handler independently grants authorization or persists canonical data. Verify nested open/close, parent identity, repeated invocation, stale asynchronous responses, focus restoration and CTX observer cleanup.

Related: [Client Context Model](../context/Client-Context-Model.md), [Entity Lists](../entities/Entity-Lists.md), [Entry Forms](../entities/Entity-Entries-Forms-Detail.md), [Popups and Selectors](../entities/Popups-and-Selectors.md).
