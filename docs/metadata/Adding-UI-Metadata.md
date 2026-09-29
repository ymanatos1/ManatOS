# Adding UI Metadata

UI metadata describes how canonical domain information is presented and interacted with. It should add presentation, layout, invocation and dynamic UI policy without redefining canonical field or relationship meaning.

## Typical additions

UI metadata can define list columns and filters, entry tabs, field presentation, actions, selectors, component bindings and expression-backed visible/enabled/read-only policy. Reuse existing field/component keys when the interaction semantics already exist.

## Common record UI versus a named UI view

Put presentation shared by every entry view in the entity's common `record` UI metadata. Add a keyed `uiViews` contribution only when the same canonical record needs a genuinely different named presentation. Set `defaultUIView` when the ordinary view is not adequately expressed by the conventional `main` key.

Do not create a UI view merely to choose page versus popup versus embedded hosting; hosting is an orthogonal surface concern. Likewise, do not copy the entire common record definition into a view. Declare only the differences and let generic view resolution compose the effective metadata.

Use `viewType` for the presentation family (`full`, `quick`, etc.), not as the unique view identity. Two named views may intentionally share a type.

## Workflow

1. Start from the canonical BO definition and identify the fields/relationships the UI needs.
2. Add list and entry presentation declaratively.
3. Use dynamic values/expressions for pure CTX-observable decisions.
4. Use a reusable component only where a field or compound interaction cannot be expressed by existing metadata.
5. Verify the same semantics in list, entry, selector and related-collection contexts where applicable.
6. If adding an alternate record presentation, define a stable UI-view key and the appropriate `viewType`, keeping shared record UI outside the view contribution.
7. Add metadata/presentation tests that protect the generic contract instead of asserting one entity-specific implementation detail.

UI metadata must not become a hidden authorization layer. Visibility and enabled state can reflect safe capability facts, but the API remains authoritative.

See [Metadata Model](Metadata-Model.md), [Entity UI Views](UI-Views.md), [Fields](../entities/Fields.md), and [Components](../entities/Components.md).
