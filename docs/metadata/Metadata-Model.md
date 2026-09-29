# Metadata Model

## Layers

ManatOS separates canonical entity definition from UI presentation metadata. Current system-owned definitions may use SysBO names, but this model is generic and is intended to support future application-defined entities as well.

```text
Entity
+-- canonical metadata
|   +-- fields
|   +-- relationships
|   +-- calculations
|   +-- persistence semantics
|   +-- entry representation
+-- UI metadata
    +-- tabs
    +-- field presentation/components
    +-- actions
    +-- list presentation
    +-- dynamic UI policy
```

## Fields

Each semantic field is defined once canonically. Calculation metadata augments that field; it does not create a parallel calculated-field model.

A persisted calculation opts the calculated value into generic persistence materialization. Trigger/dependency metadata describes when assisted recalculation is appropriate.

## Dynamic values

A metadata value may be static or expression-backed. The generic runtime resolves both through the same contract. Dynamic UI policy includes visibility, enabled state, editability, labels/status and similar side-effect-free decisions.

## Entry representation

Canonical entry semantics may define name, type, description and status. UI metadata may decorate them with icons/layout. Lists, selectors, hierarchy views and cards consume the same semantic representation rather than each inventing entity-specific display rules.

## Relationships

Relationships are canonical domain metadata. They define navigation and mutation consequences, including delete behavior. UI components consume relationship projections but do not redefine referential semantics.

## Defaults and invocation

Static metadata defaults, caller defaults and invocation overrides are inputs to entry initialization. Once resolved, live field state belongs to the entry runtime. Invocation is not retained as a competing copy of field state.

## Entity UI views

UI metadata can declare multiple keyed `uiViews` for one canonical entity. A key such as `main`, `account` or `quick` identifies a concrete presentation; its `viewType` describes the presentation family, such as `full` or `quick`. The two are intentionally distinct.

The common `record` UI definition is the reusable base. A selected view contributes presentation differences: replacement-style structures such as tabs/content can replace the common structure, while keyed field overrides, actions and related collections compose with it. Resolution creates effective metadata for one opening; it does not mutate the canonical/global UI definition.

UI views are orthogonal to page/popup/embedded hosting. They change presentation of a record, not its canonical entity semantics, CTX ownership, persistence contract or authorization. See [Entity UI Views](UI-Views.md).
