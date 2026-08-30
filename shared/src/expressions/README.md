# ManatOS expression semantics

The expression parser is context-agnostic: variable/path syntax is validated at parse time, while CTX existence and values are resolved only when the expression is evaluated.

Current scalar literals are `string`, `number`, `boolean`, and `null`. Runtime scalar values also admit JavaScript `Date` objects so date/time-aware functions and comparisons can be added without redesigning the evaluator. Arrays and objects may be resolved through CTX paths but do not yet have general operator semantics.

## Operators

- `+`: numeric addition when both operands are numbers. If either operand is a string, the other supported scalar is converted with `String(...)` and concatenated. Arrays/objects are intentionally rejected until their semantics are explicitly defined.
- `-`, `*`, `/`, `%`, `**`: numeric only for now.
- `==`, `!=`: JavaScript-like coercive scalar equality.
- `===`, `!==`: strict JavaScript/TypeScript equality.
- `<`, `<=`, `>`, `>=`: JavaScript-like scalar relational comparison; valid `Date` values compare by timestamp.
- `??`: lazy nullish coalescing.
- `condition ? a : b`: lazy ternary conditional; the condition must currently resolve to boolean.

Future candidates intentionally reserved for deliberate design include `contains`, `in`, optional/safe navigation (`?.`), date/date-time/time arithmetic, and structured array/object operations.
