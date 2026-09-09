# Metadata Model

## Layers

ManatOS separates canonical entity definition from UI presentation metadata.

```text
SysBO
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
