# Adding an Expression or Function

Expressions are source contracts parsed by the shared language. Add a function only when the operation is reusable and entity/field agnostic.

The function registry is the single language entry point. Define its name, human-readable signature, arity/type checks, execution capability and implementation. Capabilities should be as narrow as possible: pure operations need no runtime authority; clock-aware functions use the supplied clock; CTX-aware functions receive context; persisted traversal uses the entity resolver rather than importing storage.

Add parser/evaluator tests for normal, null/empty, lazy and error behavior as relevant. Document the function in [Expression Catalog](../reference/Expression-Catalog.md).
