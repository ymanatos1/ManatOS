# Expressions and Reactivity

ManatOS expressions are a constrained declarative language used by canonical/UI metadata for side-effect-free calculations and decisions. Expression source is portable; each process owns its own parser/AST cache and evaluator capabilities.

## Reading map

- [`Expressions.md`](Expressions.md) — language syntax/operators/path/function use and practical fundamentals.
- [`Complex-Expressions.md`](Complex-Expressions.md) — progressively composed real examples with evaluation/dependency implications.
- [`Expression-Catalog.md`](Expression-Catalog.md) — exhaustive registered-function reference with signatures, arguments and examples.
- [`Adding-an-Expression.md`](Adding-an-Expression.md) — authoring metadata expressions and registering new evaluator functions in code.
- [`Expression-Architecture.md`](Expression-Architecture.md) — parser/evaluator/AST ownership, capability and architecture detail.
- [`Events-and-Reactivity.md`](Events-and-Reactivity.md) — dependency invalidation, events and recalculation.
- [`Event-Catalog.md`](Event-Catalog.md) — runtime event catalogue.

For CTX ownership/path semantics see [`context/`](../context/).
