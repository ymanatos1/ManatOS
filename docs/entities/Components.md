# Components

Components are reusable participants in metadata-driven presentation. The **UI Semantic Infrastructure (UIS)** separates a component's semantic identity, layout contribution and actions from the concrete controls supplied by an Angular or EJS renderer. Canonical business-field definitions remain in metadata; components do not create a competing value or authorization model.

## Component architecture

```text
Canonical entity metadata + effective UI metadata
                        │
                        ▼
        shared.UI surface host and #level
          #control · #state · #layout · #data
                        │
                        ▼
            embedded component tree
           List / Entry / FormField / Field
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
         shared.UI.NG        shared.UI.EJS
          ui.NG1                ui.EJS1
              │                   │
        Angular views        EJS/DOM views
```

`UiSurfaceHostRuntime` owns the `ctx.ui.level.level...` chain and publishes each level's four namespaces atomically. `UiHostLevelRuntime` supplies the content-ownership boundary; `UiSurfaceEmbeddedRuntime` and per-surface registries construct semantic child layout. An adapter renders and delegates interactions; it must not become a second business-state owner.

## Component families

| Family | Semantic responsibility | Source anchor |
|---|---|---|
| List surface | Query/filter/sort/page state, selection and presentation over authorized records | `shared.UI/src/components/list/ListPageRuntime.ts` |
| Entry surface | Original/current record, field state, validation, dirty state and edit/save actions | `shared.UI/src/components/entry/EntryRuntime.ts` |
| Embedded components | Explicit `#layout` contribution, owned action/event handling and disposal | `shared.UI/src/runtime/surface/embedded-runtime.ts` |
| Typed Field behaviors | Type-specific formatting, tools and accepted field interaction semantics | `shared.UI/src/components/fields/registry.ts` |
| Popup hosts | Placement, interaction focus, modal lifecycle and child-surface results | `shared.UI.NG/src/components/sys-bo/entry/EntryPopupHost.ts` and corresponding EJS host |
| Diagnostics and shell | CTX inspection, navigation, application-level tools and presentation | `shared.UI/src/debugger/` and adapters |

All fifteen registered semantic field types share a consistent field contract. A `FormField` composes the label, type-aware control and reusable Field Tools; it must not hard-code independent type semantics. An embedded component registers its own child layout rather than relying on an invisible host-generated placeholder. The component's semantic state and its visual state are deliberately distinct.

## Explicit ownership

A component can contribute layout nodes, localized captions, action availability, typed input interpretation, reusable presentation and local interaction state. The owning Entry or List remains authoritative for its working data; the API remains authoritative for protected operations and persistence.

```text
User input
   │
   ▼
Concrete UI adapter ──► semantic component action
                                 │
                                 ▼
                      owning List / Entry runtime
                                 │
                                 ▼
                       canonical CTX mutation
                                 │
                                 ▼
                         reactive projections
```

The adapter may own focus, scroll, popup stacking and DOM event coordination. It may not independently overwrite a referenced Entry's current value or make a hidden authorization decision. The same separation holds for non-entity workflow inputs, whose transient values are not canonical entity fields.

## Related collections and selectors

A related-record component consumes canonical relationship metadata and reference representation. A record selector is a nested List surface presented in a popup host; its result is an identity or selection returned to the caller. Relationship placement and record ownership are decided by the invoking field/workspace and validated by the API, not embedded in the generic selector.

A related-entry creation action may open an Entry surface as a child of the selector or caller. Child surfaces have their own `#level`, while the parent retains its original current values and invocation state.

## Field Tools

A Field Tools menu is a reusable embedded component, **not** a feature implicitly implemented by a field's HTML input. `uiEntryFieldTools()` composes actions from the concrete registered field's tool capabilities and effective read-only/dirty/required state. Actions include Copy, Revert, Inspect CTX, type-specific Trim/Clear/Zero/Today/Now and reference Select where applicable. `EntryFieldToolsEmbedded` validates requests and returns semantic effects; the Entry owns the resulting mutation. In the Angular adapter, `FieldToolsMenu` owns its trigger/menu and delegates to `EntryContext` rather than directly altering persisted records.

The visibility of an action is not an authorization grant. Its availability is projected from the field presentation contract; the relevant API operation remains independently protected.

## Established EJS0 client

`ui.EJS0` retains a separate, mature EJS component system under `views/components/` and `views/popups/`. Its `sysbo/list/`, `sysbo/entry/fields/` and hierarchy parts provide concrete examples of presentation and interaction, but **its browser field-node model is not the UIS source of truth**. It may use server-rendered partials and iframe-hosted entries. Those are implementation-specific approaches, not universal requirements of UIS or an instruction for new adapters to recreate legacy CTX state.

## Extension contract

A component is a correct extension only when its canonical metadata assumptions, shared semantic behavior, layout placement, concrete adapter templates, localization, accessibility and lifecycle have been checked together. Cross-adapter behavioral equivalence is established through actual implementation and verification, never by matching class names.

See [Field Components](Field-Components-Detail.md), [UIS Architecture](../clients/UIS-Architecture.md), [UIS Component Contracts](../clients/UIS-Component-Contracts.md), and [Popups and Selectors](Popups-and-Selectors.md).
