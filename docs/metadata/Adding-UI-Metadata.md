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

See [Metadata Model](Metadata-Model.md), [Fields](../entities/Fields.md), and [Components](../entities/Components.md).

## Adding a named view

Define a stable view key within the entity's UI metadata, choose whether it represents an Entry or List purpose, and declare only the intended presentation differences. Common record metadata remains authoritative for unoverridden properties. Arrays and keyed overrides have different composition rules, so confirm the effective result through `shared/src/metadata/ui/view-resolution.ts` before assuming two fragments merge in the same way.

Verify the named view from a full Page and any nested popup or related-list caller that can select it. Check translated labels, permissions, action visibility, correct fallback/default view behavior and rejection of unknown keys. View resolution remains distinct from loading the referenced record, which is an API/resource operation.
