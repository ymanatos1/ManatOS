# Component Catalog

A reusable UI component contributes *semantic layout and behavior* under an owning UIS surface. Its concrete Angular/EJS presentation does not become the state authority. Components are selected through declarative metadata and explicit registries rather than by a separate entity-specific controller for each field.

## Modern UIS component families

| Family | Semantic owner / source | Responsibility |
|---|---|---|
| Surface shell | `shared.UI/src/runtime/surface/` | Publish and dispose owned `#level` and its canonical namespaces |
| Entry | `shared.UI/src/components/entry/embedded/` | Entry, tabs, layout and typed-field component composition |
| List | `shared.UI/src/components/list/embedded/` | Header, actions, view selector, filters, columns, rows, cells and pagination |
| Field behavior | `shared.UI/src/components/fields/types/` | Native-input decoding, type-specific validation/formatting and tools policy |
| Popup | `shared.UI/src/popups/embedded/` | Popup composition under the owning level |
| Authentication | `shared.UI/src/popups/auth/` and `shared.UI/src/flows/auth/` | Input definitions and Flow-dependent sign-in/account actions |
| Shared editor assistance | `shared.UI/src/components/common/change-report/` | Entry change report presentation |

The Entry embedded registry (`shared.UI/src/components/entry/embedded/registry.ts`) registers fifteen field component kinds: `boolean`, `date`, `datetime`, `duration`, `email`, `enum`, `guid`, `number`, `picture`, `pictures`, `reference`, `richText`, `telephone`, `string` and `version`. Registered keys are prefixed with `field-` in the embedded component registry (for example `field-string`). `RichText` is the `field-richText` embedded key. These keys express semantic identity; concrete adapter templates must render the corresponding contract.

## Components used by the established EJS client

`ui.EJS0/src/presentation/metadata/component-registry.ts` maps additional metadata component keys to EJS partials or browser-mounted implementations. Typical composite features include contextual information, provider credentials, date/duration composition, collection editing and hierarchy workspaces. These are part of the EJS0 implementation's established presentation capabilities, not evidence that every composite has already been reproduced by the new shared UIS adapters.

This distinction matters: the common semantic component architecture provides a technology-neutral extension direction while the mature EJS0 client remains a distinct implementation with additional concrete behavior.

## Contract of a reusable component

A component has a declarative identity, input metadata, a precise owning surface/layout parent, allowed actions, derived state, event dispatch, cleanup rules and appropriate authorization facts. Typed field behavior receives native semantic input rather than a DOM object and returns a decoded value or rejection; the owning Entry alone writes `#data.current`.

```text
Canonical field metadata
        │
        ▼
Registered field behavior ──► semantic Field component
                                      │
                                      ▼
                            Entry owns working record
                                      │
                                 UIS adapter
                               Angular / EJS
```

Composition of fields into Entry or List layouts does not transfer record ownership to a field widget. A List row uses the same registered field behavior for formatting; a host that renders a different platform still consumes the same semantic contract.

## Extension rule

Add type semantics once in `shared.UI/src/components/fields/` and add/align concrete embedded components and templates in the Angular/EJS adapters. For composite behavior, declare an explicit parent layout contribution and observable semantic state; avoid an empty subclass that hides the entire component's composition behind a generic renderer.

See [Components](Components.md), [Field Components](Field-Components-Detail.md), [UIS Component Contracts](../clients/UIS-Component-Contracts.md) and [Adding a Component](Adding-a-Component.md).
