# Adding an Expression

Expressions are appropriate for side-effect-free decisions or calculations over observable context. They are not a general replacement for services, commands or authorization.

## Before adding one

Ask whether the rule depends only on CTX-observable state and whether evaluating it has no side effects. If either answer is no, the rule likely belongs at another layer. If the required fact is not currently observable, consider whether exposing a safe fact in CTX would improve reuse without leaking security-sensitive data or creating ambiguous ownership.

## Implementation path

1. Identify the canonical inputs and expected output type.
2. Define the expression in metadata rather than embedding equivalent browser branching.
3. Declare dependencies/triggers where the runtime requires them.
4. Reuse registered evaluator functions rather than parsing or evaluating ad hoc code.
5. Test initial evaluation and recalculation when every relevant dependency changes.
6. If the calculated value is persisted, verify projection/materialization semantics as well as live UI behavior.

Expressions must remain deterministic with respect to their declared/observable inputs. Security decisions should consume safe server-resolved capability facts rather than reproduce authorization logic in the browser.

See [Expression Architecture](../architecture/Expression-Architecture.md), [Expressions](../design/Expressions.md), and [Expression Catalog](../reference/Expression-Catalog.md).
