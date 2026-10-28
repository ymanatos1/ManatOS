# Client and UI Architecture

The client architecture is defined by **semantic contracts**, not by a particular web framework. A client consumes canonical metadata, authorized API resources and runtime facts; it composes interactive surfaces; and it renders those surfaces using its own presentation technology. The TypeScript implementation supplies a reusable **UIS framework** that realizes this separation explicitly.

## 1. Three different responsibilities

```text
         canonical domain + expression/CTX contracts
                         shared/
                            │
                      shared.UI/
        surface lifecycle · actions · components
       List/Entry · Flows · state · diagnostics
                            │
              ┌─────────────┴────────────┐
              ▼                          ▼
          shared.UI.NG               shared.UI.EJS
              │                          │
            ui.NG1                    ui.EJS1
          Angular host               EJS host
              └───────────┬──────────────┘
                          ▼ HTTP
                     authoritative API
```

`ui.EJS0` remains a separately implemented, mature EJS client; its presentation architecture and browser runtime are not an implicit dependency of `shared.UI`. EJS0 behavior is useful as a reference for functional requirements, not a mandate to clone its internal state model.

**Shared semantics (`shared.UI`):** Surface ownership, CTX projections, semantic component composition, List/Entry working state, typed field behavior, selection, popup invocation, Flow execution, resource ports and diagnostics.

**Rendering adapters (`shared.UI.NG`, `shared.UI.EJS`):** HTML/templates/framework controls, native UI event capture, mounting and disposal, focus, menu/overlay positioning, accessibility and rendering behavior. An adapter must not replace the shared record value or authorization authority.

**Hosts (`ui.NG1`, `ui.EJS1`):** Application bootstrap, routes, HTTP resources, server-side session boundary and technology-specific lifecycle. The host integrates with the API; it does not redefine the entity or security model.

## 2. Metadata-driven composition

Canonical entity metadata describes fields, relationships, calculations, identifiers, defaults and validation. UI metadata selects views, components, tabs, actions, layout and presentation. UIS resolves both through generic component contracts. A view may vary the presentation of a record without changing its canonical meaning.

```text
Entity / UI metadata ─┐
authorized resources ─┼─► List or Entry runtime ─► semantic #layout
surface invocation ──┘              │                    │
                           CTX #data / #state       adapter template
                                   │                    │
                                   └────────┬───────────┘
                                            ▼
                                      user interaction
```

A resource port supplies authorized data without making the shared runtime aware of Express, EJS, Angular or an API credential. The API separately validates every protected operation.

## 3. Canonical surface levels

`UiSurfaceHostRuntime` owns one child at `ctx.ui.level[.level...]` and publishes the four namespaces `#control`, `#state`, `#layout`, `#data` atomically. `#control` contains identity, semantic kind, host and invocation. `#state` contains operational UI facts; `#data` holds working records, lists and supporting resources; `#layout` is the declarative component hierarchy.

A root Page occupies `ctx.ui.level`; a Popup opened from that Page occupies the next `.level`; further nested popups extend the same chain. Exactly one child may occupy a particular parent slot. Disposal is child-safe and identity-checked. This is a semantic hierarchy, not a browser z-index arrangement.

A List and an Entry can be hosted by a page or popup without duplicating their content runtime. Hosting determines placement and modal/focus behavior; `kind` determines semantic content; `mode` determines how the content is used.

## 4. Entry semantics

The modern Entry runtime in `shared.UI/src/components/entry/EntryRuntime.ts` owns `#data.current` (working record) and `#data.original` (baseline). It derives `#state.fields` and `#state.entry` (including mode, permissions, dirty, valid, save readiness and load status). An adapter decodes user controls into a typed Field interaction. The Entry runtime alone applies that interaction to the working record.

This is different from EJS0's older field-node model. The common architecture defines the semantics of record editing, not the literal path layout of a retired client runtime.

## 5. Lists, views and references

The List runtime owns loaded rows, filter/search, view selection, sort, paging, selection and reference data. Component composition is explicit: header, actions, filters, columns, rows, cells and pagination have reusable semantic components. Field formatting remains per registered Field type, rather than a List-specific type switch.

Selectors reuse List behavior with selection intent, while reference fields request authorized candidate records through resource interfaces. Nested Entry creation and selection results must return to their invoking owner without relying on DOM global state. Both UI capability projections and selector constraints remain presentation/resource facts; direct API calls are authorized independently.

## 6. Flows are not surfaces

`FlowRunner` orchestrates multi-step operations under `ctx.flow`, independently from `ctx.ui.level`. A Flow can open a Popup or wait on a semantic event, but opening that Popup does not transfer the Flow's step state into the UI tree. Authentication Flows demonstrate this division: the operation manages steps; UIS surfaces collect and present the required input.

## 7. CTX and expressions

The modern client root is `system`, `company`, `runtime`, optional `flow` and dynamically created `ui`. `runtime` owns effective `subsystems`, `entities`, `enums`, `user`; `$entities`, `$enums`, `$user` alias that branch. Expressions provide declarative presentation and calculated behavior; reactive dependencies subscribe to CTX mutations. The implemented `?.` optional traversal must not be confused with `??` fallback or the conditional `? :` operator.

## 8. Authorization and operation boundary

The client is never the authorization decision maker. `shared.UI/src/authorization/ui-authorization.ts` consumes API-derived capability projections and initializes safe runtime-user facts. A disabled or absent UI action does not provide security; the server recomputes permission for the actual resource and operation. Login/browser sessions belong to host/server boundaries, not to ordinary UI fields.

## 9. Extension and verification

A new field type requires shared type behavior, an embedded semantic component where appropriate, the Angular/EJS presentation counterparts and source-backed tests. A new client technology consumes the same conceptual contracts without importing the EJS or Angular templates. Architecture fidelity and visual usability are complementary criteria, not alternatives.

The documentation scope is TypeScript. Other client technologies may be mentioned as evidence of the architectural portability objective without presenting their implementations or asserting unverified parity.

## Further reference

[UIS Architecture](UIS-Architecture.md), [UIS Component Contracts](UIS-Component-Contracts.md), [Surfaces and Levels](UI-Surfaces-and-Levels.md), [Flow Execution](Flow-Execution.md), [Entity Lists](../entities/Entity-Lists.md), [Entity Entries](../entities/Entity-Entries.md), [CTX](../context/Client-Context-Model.md) and [Authorization](../security/Authorization-Policy-Architecture.md).
