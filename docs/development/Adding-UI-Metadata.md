# Adding UI Metadata

UI metadata describes how canonical domain information is presented and interacted with. It should add presentation, layout, invocation and dynamic UI policy without redefining canonical field or relationship meaning.

## Typical additions

UI metadata can define list columns and filters, entry tabs, field presentation, actions, selectors, component bindings and expression-backed visible/enabled/read-only policy. Reuse existing field/component keys when the interaction semantics already exist.

## Workflow

1. Start from the canonical BO definition and identify the fields/relationships the UI needs.
2. Add list and entry presentation declaratively.
3. Use dynamic values/expressions for pure CTX-observable decisions.
4. Use a reusable component only where a field or compound interaction cannot be expressed by existing metadata.
5. Verify the same semantics in list, entry, selector and related-collection contexts where applicable.
6. Add metadata/presentation tests that protect the generic contract instead of asserting one entity-specific implementation detail.

UI metadata must not become a hidden authorization layer. Visibility and enabled state can reflect safe capability facts, but the API remains authoritative.

See [Metadata Model](../design/Metadata-Model.md), [Fields](../design/Fields.md), and [Components](../design/Components.md).
