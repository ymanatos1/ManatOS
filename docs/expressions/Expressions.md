# Expressions

Expressions are the constrained, reusable language in which metadata declares computed values, defaults, reactive predicates and other decisions. An expression specifies *what to evaluate*; its host owns the lexical context, allowed capabilities, time source, error handling and any eventual mutation. The interpreter is not JavaScript `eval` and does not authorize application operations.

The authoritative TypeScript implementation is `shared/src/expressions/{tokenizer,parser,resolver,evaluator,types}.ts`. Registered functions and capability declarations live in `shared/src/expressions/functions/registry.ts`.

## Language at a glance

```text
Expression source
      │
      ▼
  Tokenizer  ──► Parser ──► typed AST
                               │
         CTX root + current scope + authorized capabilities
                               │
                               ▼
                        Evaluator / resolver
                               │
                               ▼
                      value or typed error
```

The language supports finite numeric, quoted string, boolean and `null` literals; grouped expressions; array literals; variables and CTX paths; registered function calls; unary and binary operators; and a lazy conditional operator. Object literals, user-defined functions and unrestricted JavaScript execution are not part of this language.

## Operators and binding strength

Highest to lowest (operators on separate rows have distinct binding strength where indicated):

| Group | Operators | Semantics |
|---|---|---|
| Exponentiation | `**` | Numeric; right-associative |
| Prefix | `!`, `~`, unary `+`, unary `-` | Scalar truthiness for `!`, numeric operands for the remaining operators |
| Multiplication | `*`, `/`, `%` | Numeric; division and modulo reject zero denominators |
| Addition | `+`, `-` | Number addition or supported scalar string concatenation; numeric subtraction |
| Shifts | `<<`, `>>`, `>>>` | 32-bit bitwise shifts |
| Relational | `<`, `<=`, `>`, `>=` | Scalar or valid date comparison |
| Equality / membership | `==`, `!=`, `===`, `!==`, `IN` | Coercive/strict equality; strict array membership |
| Bitwise AND | `&` | 32-bit integer AND |
| Bitwise XOR | `^` | 32-bit integer XOR |
| Bitwise OR | `\|` | 32-bit integer OR |
| Logical AND | `&&` | Lazy scalar truthiness; returns the left operand when falsy, otherwise evaluates and returns the right operand |
| Nullish fallback | `??` | Lazy fallback when left is `null` or `undefined` |
| Logical OR | `\|\|` | Lazy scalar truthiness; returns the left operand when truthy, otherwise evaluates and returns the right operand |
| Conditional | `test ? whenTrue : whenFalse` | Lazy conditional; **boolean condition required** |

The `IN` operator is **implemented**, not reserved syntax. It requires an array on the right and returns whether a member is strictly equal to the left operand:

```text
2 IN [1, 2, 3]                 // true
'Admin' IN ['User', 'Admin']   // true
2 IN ['2']                    // false: strict member equality
```

`IN` is case-insensitive as a keyword at tokenization (`in` and `IN` are recognized). It is **not** SQL membership: it does not run a database query or traverse a collection of objects by itself.

Logical `&&` and `||` evaluate truthiness only for supported scalar values (string, number, boolean, null, undefined and valid Date). Arrays and ordinary objects are rejected as truthiness operands. Like JavaScript, these operators return operand **values**, not necessarily booleans, and skip an unnecessary right-hand branch. For example, `0 || 9` yields `9`, `5 && 'ok'` yields `'ok'`, and `'' && 99` yields `''`. Unary `!` also uses scalar truthiness. By contrast, ternary `? :` **requires an actual boolean condition** and raises an evaluation error for numeric/string conditions. Use explicit boolean comparisons for business predicates when the result must be boolean. Parentheses should make intended precedence clear.

## CTX paths and lexical lookup

A path begins with an absolute root (`$`), a declared alias, a relative selector, or an ordinary lexical identifier. For ordinary identifiers, only the **first member** is searched from current scope outward through its ancestors. Once the first identifier is found, subsequent members are traversed strictly downward. A later missing member does not cause the resolver to retry the path against another ancestor.

```text
$runtime.enums.SysPlatform
#data.current.name
#state.fields.name
$entities.sysUsers
items[0].name
items['record-id'].name
```

The actual root and available aliases depend on the evaluation host. The API CTX and interactive UI CTX do not have identical root topology. `#`, `#level`, `#control`, `#data`, `#layout`, `#state` and `#flowstep` are recognized relative selectors; their meaning depends on the current semantic scope.

Array indexing is zero based; string keys can identify keyed members in supported CTX collections. Dynamic member syntax is also implemented (`object.(expression)`), where the computed segment must evaluate to a nonempty string or a nonnegative integer.

## Optional traversal: `?.`

**Optional path traversal is supported in both the tokenizer/parser and synchronous/asynchronous resolvers.** It is not a future feature. Its purpose is to tolerate a missing or null *receiver* without weakening mandatory traversal elsewhere.

```text
#data.current?.managerId
$runtime.user?.principalId
person?.(fieldName)
```

The operator marks the **preceding path member** optional. If that receiver is `null` or absent, the path resolves to `null`; if present, traversal continues. A later mandatory member may still fail. For example:

```text
person?.address.city
person?.address?.city
```

The first expression tolerates a missing `person` but still requires `address` when `person` exists. The second also tolerates a missing `address`. Optional traversal does **not** turn all missing names into `null` or suppress arbitrary expression errors. A mandatory unresolved name fails under the caller's evaluator/error policy.

`?.` (path traversal), `??` (nullish fallback) and `? :` (conditional selection) are three distinct operators:

```text
person?.name ?? 'Unknown'
enabled ? currentValue : previousValue
```

In this interpreter, optional traversal is a metadata expression grammar feature, not unrestricted JavaScript optional invocation. Consult [CTX Reference](../context/CTX-Reference.md) for the active host's root/scope contracts.

## Synchronous versus asynchronous evaluation

Pure calculations and CTX/clock-bound functions can be evaluated by their authorized host. Persisted-entity traversal (`TraverseEntity`) requires an explicitly granted resolver/delegate and uses the asynchronous evaluation path. An expression must not implicitly acquire datastore access merely by referring to an entity name.

The registered function metadata describes argument count, argument types and required capability. The interpreter validates the signature before evaluation and emits structured failures at parse or execution boundaries. See [Expression Architecture](Expression-Architecture.md) for compilation, diagnostics, error isolation and security, and [Function Catalog](Expression-Catalog.md) for the full supported registry.

## Practical interpretation

| Intent | Example | Requirement |
|---|---|---|
| Conditional presentation | `canEdit && !busy` | Boolean-valued host facts make this result boolean |
| Safe optional label | `person?.name ?? 'Unassigned'` | Optional receiver and fallback semantics |
| Enum/role filter | `role IN ['Admin', 'Superuser']` | Array-literal membership |
| Numeric rule | `quantity > 0 ? quantity * unitPrice : 0` | Numeric/boolean types |
| Default from canonical metadata | `FirstCtx($enums.SysPlatform.values, 'value')` | Available enum scope/function capability |
| Current-day default | `CurrentDay()` | Evaluator-provided clock |

Expressions calculate and describe. They are not a substitute for server-side authorization checks, transactional storage enforcement or input validation at trust boundaries.

### Operator results and evaluation boundaries

```text
5 && 'authorized'       // 'authorized' (not true)
0 || 20                // 20
null ?? 'fallback'      // 'fallback'
true ? 'yes' : 'no'    // 'yes'
```

These examples illustrate evaluator semantics, not an authorization grant: a client expression cannot replace server policy. Structured operands are valid in operations that define their own structured semantics (for example an array on the right of `IN`) but are not generally accepted for scalar truthiness.

See [Complex Expressions](Complex-Expressions.md), [Adding Expressions](Adding-an-Expression.md) and [Events and Reactivity](Events-and-Reactivity.md).
