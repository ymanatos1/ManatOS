# Expression Catalog

Expressions use a shared tokenizer/parser/evaluator and JavaScript-like operator precedence for the supported subset. Paths resolve against effective CTX scope at evaluation time; parsing is context-agnostic.

## Registered functions

| Function                       | Purpose / capability                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `EmailAddress(...)`            | normalize/validate canonical email identity; pure                    |
| `TelephoneNbr(...)`            | normalize international telephone value; pure                        |
| `SqRoot(...)`                  | numeric square root; pure                                            |
| `FirstCtx(...)`                | first usable value from context/value alternatives                   |
| `CurrentDay(...)`              | current calendar-day value through supplied clock capability         |
| `CalendarAddDuration(...)`     | calendar-aware duration addition                                     |
| `CalendarDurationBetween(...)` | calendar-aware duration calculation                                  |
| `CurrentUiLevel(...)`          | resolve current/effective UI level from CTX                          |
| `TraverseUiLevels(...)`        | traverse recursive UI-level topology                                 |
| `TraverseCtx(...)`             | traverse context relationships/paths according to evaluator contract |
| `TraverseEntity(...)`          | persisted entity traversal using entity-resolver capability          |
| `GetTime(...)`                 | extract/normalize time semantics                                     |
| `StrFormat(...)`               | deterministic string formatting                                      |

Function names are metadata-language contracts. Resolver-backed functions consume an injected resolver and do not import storage adapters. Clock-sensitive functions use the supplied evaluation clock for testability.

## Evaluation ownership

Pure/UI decisions can execute in the browser against CTX. Server calculations execute where server facts/capabilities exist. Entity traversal requires an entity resolver. Normal browser expression transport uses expression source and runtime-local compiled AST caching; tooling may expose AST for inspection.

See [Expressions](../design/Expressions.md) for operators and examples.
