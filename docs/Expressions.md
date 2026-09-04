# ManatOS expression semantics

The expression parser is context-agnostic: variable/path syntax is validated at parse time, while CTX existence and values are resolved only when the expression is evaluated.

Current scalar literals are `string`, `number`, `boolean`, and `null`. Runtime scalar values also admit JavaScript `Date` objects so date/time-aware functions and comparisons can be added without redesigning the evaluator. Arrays and objects may be resolved through CTX paths but do not yet have general operator semantics.

## Operators

ManatOS uses JavaScript-like precedence for the supported operator subset. Parentheses remain recommended whenever a business rule would otherwise be difficult to scan. Unlike JavaScript, ManatOS deliberately keeps numeric operators type-safe: arithmetic and bitwise operators require numeric operands rather than silently coercing strings/booleans.

From higher to lower binding strength (with `**` above the prefix operators in the same relationship used by JavaScript):

1. `**`
2. prefix `!`, `~`, unary `+`, unary `-`
3. `*`, `/`, `%`
4. `+`, `-`
5. `<<`, `>>`, `>>>`
6. `<`, `<=`, `>`, `>=`
7. `==`, `!=`, `===`, `!==`
8. `&`
9. `^`
10. `|`
11. `&&`
12. `??`
13. `||`
14. `condition ? whenTrue : whenFalse`

Supported semantics:

- `+`: numeric addition when both operands are numbers. If either operand is a string, the other supported scalar is converted with `String(...)` and concatenated. Arrays/objects are intentionally rejected.
- `-`, `*`, `/`, `%`, `**`: numeric only.
- `!`: scalar logical NOT.
- `&&`, `||`: lazy scalar logical operators; the right operand is evaluated only when required.
- `??`: lazy nullish coalescing.
- `&`, `|`, `^`: numeric bitwise AND/OR/XOR using JavaScript-compatible 32-bit integer results.
- `~`: numeric 32-bit bitwise NOT.
- `<<`, `>>`, `>>>`: numeric 32-bit left, signed-right, and unsigned-right shifts. Shift counts use the JavaScript 0-31 range.
- `==`, `!=`: JavaScript-like coercive scalar equality.
- `===`, `!==`: strict JavaScript/TypeScript equality.
- `<`, `<=`, `>`, `>=`: JavaScript-like scalar relational comparison; valid `Date` values compare by timestamp.
- `condition ? a : b`: lazy ternary conditional. The condition must resolve to boolean in the canonical server evaluator.

Examples:

```text
!enabled
enabled && user.fields.role.value === 'Admin'
flags & 4
flags | 2
flags ^ 1
~mask
value << 2
value >>> 1
1 + 2 > 2 ? 10 : 20
```

### CTX array addressing

Every CTX array remains a normal ordered array and supports zero-based numeric indexing wherever it occurs:

```text
entry.emailAddresses[0]
entry.emailAddresses[1].address
entry.telephoneNumbers[1].fullNumber
```

When members expose a stable `id` or `key`, the same array also supports semantic keyed lookup without duplicating it into a second object:

```text
entry.emailAddresses['2b8f7232-c605-4c66-94b3-50f4c7d6a576'].address
entry.telephoneNumbers['<telephone-number-id>'].fullNumber
```

Numeric indexing is positional; semantic lookup is stable across reordering. Both syntaxes use the same generic CTX resolver.

Future candidates intentionally reserved for deliberate design include `contains`, `in`, optional/safe navigation (`?.`), richer date/time arithmetic, and general structured array/object operators.

## Registered functions

All function names are case-sensitive and are registered centrally in `expressions/functions/registry.ts`. The parser validates function existence and arity from that registry; evaluation then applies the same runtime argument contract before executing the function.

### `SqRoot(value: number)`

Returns the numeric square root of `value`.

```text
SqRoot(81)                           -> 9
```

### `FirstCtx(collection, resultField?: string)`

Returns the first member of a CTX-resolved collection, or `null` when the collection is missing/empty. If `resultField` is supplied, that property is returned from the first member. Arrays use index `0`; object maps use their first enumerable value. Ordering is therefore the caller/source collection's responsibility.

```text
FirstCtx(platformId.options, 'value')
FirstCtx(customerId.options, 'id')
FirstCtx(entries)
```

Typical create-default metadata:

```text
FirstCtx(platformId.options, 'value')
```

This is intentionally entity-agnostic; it does not know what a Platform or Customer is.

### `CurrentDay()`

Returns the evaluator clock's current local calendar day at midnight in `datetime-local` form (`YYYY-MM-DDT00:00`). The function uses the evaluator-provided clock so tests and alternate hosts can remain deterministic.

```text
CurrentDay()                         -> 2026-08-31T00:00
```

Typical create-default metadata:

```text
validFrom = CurrentDay()
```

### `TraverseCtx(startId, collection, parentField, resultField?)`

Follows an id-based parent chain inside a CTX collection until it reaches the terminal/root row. If `resultField` is supplied, that property is returned from the root; otherwise the root object is returned. Empty start ids return `null`. Cycles are detected explicitly and traversal is capped at 256 levels.

```text
TraverseCtx(parentId, entries, 'parentId', 'id')
TraverseCtx(parentId, entries, 'parentId', 'name')
```

A persisted Principal root-id calculation can therefore remain completely declarative:

```text
parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')
```

### `GetTime()`

Returns the evaluator clock's current Unix timestamp in milliseconds.

```text
GetTime()                            -> 1788135300000
```

Use this when a numeric timestamp is genuinely required. Prefer `CurrentDay()` when the semantic intent is a calendar-day default.

### `StrFormat(format, ...values)`

Replaces zero-based placeholders (`{0}`, `{1}`, ...) with scalar arguments. A placeholder whose argument is not supplied is left visible rather than silently removed.

```text
StrFormat('{0} / {1}', name, version)
StrFormat('Hello {0}', user.fields.name.value)
```

## Expression examples

The examples below show intended metadata-style usage rather than entity-specific evaluator behavior.

```text
# Conditional editability
principalType.option != null && principalType.option.canHaveParent === true

# Conditional visibility
mode != 'create'

# Current user / current entry comparison
id != user.fields.id.value

# Null-safe decision using an explicit comparison
parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')

# Create default from the first available CTX option
FirstCtx(platformId.options, 'value')

# Current-day default
CurrentDay()

# Presentation choice
credentialsVerified ? 'success' : 'secondary'

# Presentation icon
hasClientSecret ? 'lock-fill' : 'lock'

# String composition
StrFormat('{0} / {1}', name, version)

# Platform capability decision
user.permissions.protocrm.capabilities.platformAccess === true

# List Add visibility
permissions.create === true

# Entry Delete visibility
mode !== 'create' && permissions.delete === true

# Entry Save visibility
mode !== 'view' && (permissions.create === true || permissions.edit === true)

# Runtime constraint decision
addConstraintReached !== true
```

## Design rules for metadata expressions

Expressions should describe domain/UI relationships, not reproduce renderer logic. Prefer one-level CTX names such as `entries` when a value is intentionally made available for upward resolution. Reusable entity calculations belong in canonical business-object metadata; UI-only visibility, editability, decoration, create defaults, navigation visibility and action state belong in metadata. Prefer resolved scalar facts from CTX (`permissions.create`, platform capabilities, mode, constraint facts) over testing whole structured objects or recreating entitlement/role logic in metadata. Keep facts and policy separate: CTX should expose `addConstraintReached`, not `disableAddButton`; metadata decides how that fact affects presentation. Evaluator-backed UI decisions never replace API/domain authorization. Functions must remain entity/field agnostic so the same evaluator can serve system pages, future application pages, server-side persistence calculations, and other renderers.


## Execution ownership and capabilities

Expressions are execution-context independent. The current owner supplies the lexical scope and available capabilities. `TraverseCtx()` operates only on materialized context data; `TraverseEntity()` requires the canonical `entityResolver` capability and can be delegated by a browser owner when its lazy branch is actually reached. See [Expression Parsing and Evaluation Mechanics](Expression-Evaluation-Mechanics.md).
