# Expression Architecture

This document is the programmer's reference for the ManatOS expression language: its portable contract, grammar, compilation pipeline, runtime execution model, CTX resolution, capabilities, diagnostics, and built-in function catalogue.

## 1. Architectural contract

The **authoring contract is expression source text**, typically declared in metadata. The constrained language is implemented once in `shared/src/expressions/`, and its compiler and evaluator are reused by authorized TypeScript hosts. Neither expressions nor their ASTs are substitutes for CTX ownership, authorization decisions, or persistence commands.

```text
              authored expression source
                           │
                           ▼
           shared tokenizer + parser + registry
                           │
                           ▼
                   compiled expression
                AST + required capabilities
                           │
         ┌─────────────────┼────────────────┐
         ▼                 ▼                ▼
       API host       shared.UI runtime   other trusted host
    domain/persisted    CTX reactivity    explicit scope
       execution        and UI rules       and capabilities
         │                 │                │
         └─────────────────┴────────────────┘
                           ▼
             value / structured diagnostic
```

Compilation is **not limited to the Node server**. `UiReactivityRuntime` in `shared.UI/src/runtime/reactivity.ts` invokes `compileExpression()` directly, then evaluates its compiled expressions against the owning UI level in CTX. That shared runtime is consumed by the browser UIS adapters. API/server callers compile independently through the same shared implementation. Each JavaScript execution environment using the default function registry has its own process/module-local exact-source cache; this cache is an implementation optimization, not canonical state.

The application must supply the legitimate execution root, current scope and capabilities. The API must not synthesize browser-only `ctx.ui` facts to authorize an operation. UI results may control presentation, but never replace authoritative API permissions or persisted calculations.

## 2. Why expressions exist

Expressions move side-effect-free decisions and calculations into metadata when they depend on observable state. This allows generic renderers, validation, defaults, calculated fields and policy presentation to reuse the same declarative rule instead of introducing entity-specific imperative branches.

Architectural test: **if a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs as a declarative expression.**

Expressions do not replace commands, persistence, authorization or other side-effecting domain operations.

## 3. Language pipeline in detail

### 3.1 Tokenization

`tokenizeExpression(source)` scans source left-to-right and emits tokens with their original character position for diagnostics. Whitespace is ignored.

Supported lexical forms include:

- numbers: `12`, `12.5`, `.5`;
- quoted strings with `'` or `"` and escapes such as `\\n`, `\\r`, `\\t`, escaped quotes and backslash;
- identifiers beginning with a letter, `_` or `$`;
- `IN` as a case-insensitive keyword operator;
- operators documented below;
- punctuation `(` `)` `.` `,` `[` `]` `?` `:`.

Unexpected characters, malformed numbers and unterminated strings fail during parsing rather than being tolerated by the evaluator.

### 3.2 Parsing and compilation

`compileExpression()` performs recursive parsing and returns:

```text
CompiledExpression
├─ source                    original source, retained for diagnostics/debugging
├─ ast                       JSON-compatible discriminated AST
└─ requiredCapabilities[]    static union required by reachable function nodes
```

AST node kinds are:

```text
literal       scalar literal
array         array literal
variable      lexical or explicit $ path
group         parenthesized expression
unary         + - ! ~
binary        arithmetic/comparison/logical/bitwise/IN
conditional   condition ? whenTrue : whenFalse
function      registered ManatOS function call
```

Function calls are validated against the canonical shared function registry at compile time. Unknown function names and invalid arity are therefore metadata/programming errors, not late surprises in a renderer.

### 3.3 Operator precedence

Higher rows bind more tightly:

| Precedence | Operators          | Notes                                                 |
| ---------: | ------------------ | ----------------------------------------------------- |
|         14 | `**`               | exponentiation; right-associative                     |
|         13 | unary `+ - ! ~`    | exponentiation remains tighter than unary             |
|         12 | `* / %`            | division/modulo by zero are evaluation errors         |
|         11 | `+ -`              | `+` supports the evaluator's numeric/string semantics |
|         10 | `<< >> >>>`        | bitwise shifts                                        |
|          9 | `< <= > >=`        | relational comparison                                 |
|          8 | `== != === !== IN` | equality/membership                                   |
|          7 | `&`                | bitwise AND                                           |
|          6 | `^`                | bitwise XOR                                           |
|          5 | `\|`               | bitwise OR                                            |
|          4 | `&&`               | lazy                                                  |
|          3 | `??`               | lazy nullish coalescing                               |
|          2 | `\|\|`           | lazy logical OR                                       |

The conditional operator `?:` is parsed above the binary-expression layer and supports nested conditional expressions.

### 3.4 Runtime evaluation

The evaluator recursively visits the AST. Literals and arrays produce values directly; variables are resolved from the supplied execution context; operators evaluate their operands; functions are dispatched through the canonical registry. `UiReactivityRuntime` compiles declared rules when creating its level-owned reactive entries, extracts dependencies from their AST nodes and evaluates with the canonical CTX root and the owning level as current scope. CTX mutations enqueue dependent entries; derived writes produce ordinary CTX notifications. A bounded evaluation budget prevents nonconvergent cycles from indefinitely rescheduling updates. Other authorized evaluator clients may compile and evaluate the shared language separately using their own legitimate roots and scopes. No AST is semantic CTX state.

`&&`, `||`, `??` and `?:` preserve lazy branch semantics. The logical operators use restricted scalar truthiness and return the selected **operand**, not a coerced boolean; `?:` requires a boolean condition. An unavailable capability in a branch that is never executed therefore need not be exercised at runtime, although `requiredCapabilities` remains the static union useful for planning and diagnostics.

Synchronous entry points are used when all reached functions can execute synchronously. `evaluateCompiledExpressionAsync()` / `evaluateExpressionAsync()` support asynchronous capability-backed functions such as `TraverseEntity()`.

### 3.5 AST cache identity and lifecycle

`compileExpression()` interns compiled expressions by **exact source text** in the executing JavaScript module. Custom function registries have separate registry-specific caches because their compile-time function validation can differ. Separate API, Node UI host and browser execution environments do not share one in-memory cache. Equivalent expressions containing different whitespace are distinct cache keys.

Compilation output is context-neutral. It must not be copied into canonical entity metadata, CTX nodes, surface invocation data or field values. The current UI reactive registry owns compiled rule references for its surface lifetime; disposing the surface releases those references and observers. The shared compiler cache is distinct from semantic surface lifecycle.

The debugger can inspect authored source, computed results and diagnostics without treating an AST as an editable CTX child.

## 4. Variables and CTX resolution

A variable node preserves both its original path text and parsed path members. An explicit `$.*` reference is absolute; `$` denotes the CTX root. An unqualified variable is resolved lexically from the current evaluation scope according to the host's CTX rules.

For UI evaluation, this means metadata can normally use concise field-oriented expressions while still allowing an explicit root reference when required:

```text
enabled
parentId
principalType.option.canHaveParent
$runtime.user.permissions.userRole
#state.entry.dirty
```

The active UIS user projection is reached through `$runtime.user` (when the authorized host supplies it); the older `$.user` root must not be generalized to modern NG1/EJS1. The current UI CTX is the real browser context. UI-owned expressions execute against it; the API does not manufacture an imitation of it.

### CTX traversal versus entity traversal

These are deliberately different contracts:

```text
TraverseCtx()                         TraverseEntity()
     |                                     |
     v                                     v
materialized CTX data                persisted canonical entity data
already available to host            EntityResolver supplied by owner
     |                                     |
no persistence guarantee             independent of loaded UI subset
```

Use `TraverseCtx()` only when the intended semantics genuinely concern materialized CTX. Use `TraverseEntity()` when correctness requires persisted entity hierarchy traversal.

## 5. Execution ownership and capabilities

Every evaluation has an owner, root, current scope and a set of available capabilities. The current capability vocabulary is:

| Capability       | Meaning                                           | Typical owner                               |
| ---------------- | ------------------------------------------------- | ------------------------------------------- |
| `pure`           | deterministic computation from supplied arguments | any host                                    |
| `clock`          | evaluator-provided current time                   | browser, API, worker                        |
| `ctx`            | access to the execution root/current CTX scope    | UI and CTX-aware hosts                      |
| `entityResolver` | canonical persisted entity lookup                 | API/server or another trusted resolver host |

`pure` is the narrowest and preferred capability. A function should request a stronger capability only when its semantics require it.

The owner rules are:

- evaluator invocation-only operands are passed explicitly with that invocation; they are neither semantic CTX nor mutable evaluator-global state. Field normalization's raw `value` operand is the current example;
- client executes UI-owned calculations/presentation policy against live client CTX;
- server executes server-owned rules against server-owned facts/domain context;
- storage adapters may translate suitable structured predicates into native query predicates;
- server may parse, retain, analyze, transform and partition expressions, but does not evaluate UI semantics against server-created `ctx.ui` state.

## 6. Function registry contract

`shared/src/expressions/functions/registry.ts` is the canonical function catalogue. Each definition contains:

```text
name
capability
signature
├─ human-readable text
├─ minimum arguments
├─ maximum arguments (null = variadic)
├─ positional runtime argument types
└─ optional variadic type
evaluate()
└─ optional evaluateAsync()
```

Runtime signature types are intentionally small: `any`, `scalar`, `string`, `number`, and `boolean`. `scalar` means `null | string | number | boolean`.

When adding a function: use the shared checked registration, document semantics/null/error behaviour, choose the narrowest capability, keep it entity/field agnostic, and add evaluator tests. Function names are PascalCase metadata-language contracts; renaming one is a metadata migration.

## 7. Built-in function reference

### Contact normalization

#### `EmailAddress(value: scalar)` — `pure`

Normalizes an email address for canonical identity/deduplication: trims whitespace and lowercases it. Empty input returns `null`; structurally invalid input raises an evaluation error. This is structural normalization, not SMTP deliverability validation.

```text
EmailAddress('  USER@Example.COM ')  ->  'user@example.com'
```

#### `TelephoneNbr(value: scalar)` / `TelephoneNbr(countryCode, number)` — `pure`

Normalizes a telephone number to canonical international `+<digits>` form. A complete number must start with `+`; the two-argument form accepts a `+` country code plus national number. Formatting characters are removed and the final number respects the 15-digit international limit. Empty one-argument input returns `null`; malformed values raise an evaluation error.

```text
TelephoneNbr('+30 694 438 6714')       -> '+306944386714'
TelephoneNbr('+30', '6944386714')      -> '+306944386714'
```

### Numeric and collection helpers

#### `SqRoot(value: number)` — `pure`

Returns the numeric square root. Argument type is checked before execution.

```text
SqRoot(81) -> 9
```

#### `FirstCtx(collection, resultField?: string)` — `ctx`

Returns the first member of an already ordered CTX-addressable collection, or `null` for absent/empty input. Arrays use index `0`; object maps use their first enumerable value. With `resultField`, returns that member's property.

```text
FirstCtx(platformId.options, 'value')
FirstCtx(customerId.options, 'id')
FirstCtx(entries)
```

It deliberately does **not** impose entity-specific ordering; the caller must supply the intended ordering.

### Calendar and clock

#### `CurrentDay()` — `clock`

Returns the evaluator clock's local calendar day at midnight as `YYYY-MM-DDT00:00`. It uses the injected evaluator clock, making tests deterministic.

#### `CalendarAddDuration(startDate: string, duration)` — `pure`

Adds `{ years, months, days }` using calendar-aware year/month arithmetic and end-of-month clamping; it does not approximate months/years as fixed day counts. Returns a `YYYY-MM-DD` value, or `null` for invalid input.

```text
CalendarAddDuration('2024-01-31', duration)
```

#### `CalendarDurationBetween(startDate: string, endDate: string)` — `pure`

Returns the largest non-negative `{ years, months, days }` duration reaching `endDate` from `startDate`. Returns `null` for invalid dates or when end precedes start.

#### `GetTime()` — `clock`

Returns the evaluator clock as Unix milliseconds. Use it when an actual timestamp is required; use `CurrentDay()` for calendar-day defaults.

### UI/CTX navigation

#### `CurrentUiLevel()` — `ctx`

Returns the deepest object in the canonical `ctx.ui.level.level...` chain. It derives the active level; no duplicate `currentSurface` state is required. Maximum nesting depth is 256; exceeding it is an explicit evaluation error.

#### `TraverseUiLevels()` — `ctx`

Returns the ordered UI-level ancestry from root `ctx.ui.level` to the deepest currently displayed level. It traverses only the canonical displayed chain and has the same 256-level safety limit.

#### `TraverseCtx(startId, collection, parentField: string, resultField?: string)` — `ctx`

Walks an id-based parent hierarchy inside a materialized CTX collection until a root row is reached. If `resultField` is supplied, that root property is returned; otherwise the root row is returned. Empty starts/missing rows return `null`; cycles and depth over 256 are errors.

```text
TraverseCtx(parentId, entries, 'parentId', 'id')
```

Do not use this as a substitute for persisted traversal when the loaded CTX collection may be incomplete.

#### `TraverseEntity(startId, entityKey: string, parentField: string, resultField?: string)` — `entityResolver`

Asynchronously walks a canonical persisted hierarchy using the execution owner's `EntityResolver`. Empty starts and missing records return `null`; cycles and depth over 256 are explicit errors.

```text
TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')
```

This is the correct primitive when a calculation must not depend on which records happen to be loaded by a client.

### Text

#### `StrFormat(format: string, ...values)` — `pure`

Replaces zero-based `{n}` placeholders with scalar values. Missing indexes remain visibly unchanged rather than disappearing.

```text
StrFormat('{0} / {1}', name, version)
```

## 8. Operator/runtime value rules

Grammar literals are `string`, `number`, `boolean`, and `null`; runtime scalar handling also permits `Date` where evaluator semantics support it. Arrays are supported as expression values, but operators that require scalars reject arrays/objects rather than relying on JavaScript coercion.

Important behavioural rules:

- division or modulo by zero is an evaluation error;
- logical operators require supported scalar truthiness;
- lazy operators do not evaluate unnecessary branches;
- malformed or unsupported operands fail explicitly rather than silently producing arbitrary JavaScript results;
- function arguments are validated against registry signatures before implementation execution.

## 9. Dependency and recalculation model

CTX references in compiled expressions provide dependency information. A canonical CTX mutation invalidates expressions that depend on that path. Calculated writes use the same observable CTX mutation/event model as user-originated writes, allowing cascades to remain deterministic and inspectable.

Conceptually:

```text
canonical CTX write
       |
       v
  ctx-change event
       |
       v
 dependency match
       |
       v
 reevaluate expression
       |
       v
 calculated CTX write
       |
       +----> next dependent expressions, if any
```

A derived/read-only CTX mirror is not a second mutable authority. Dependencies may observe the canonical path and its declared related/mirror paths without introducing synchronization writes.

## 10. Diagnostics and provenance

Parse failures report source position. Evaluation failures can carry expression source, variable path, caller provenance, correlation id, current context path, target path and nested evaluation chain.

Callers identify why evaluation was requested through sources such as renderer, CTX debugger, calculated field, field normalization, CTX change, UI metadata, reference selection, navigation or tests. This makes the debugger useful without embedding debugger-specific state into expression semantics.

The evaluator throws errors to the caller even when a diagnostic sink is configured; diagnostics are observability, not error suppression.

## 11. Synchronous versus asynchronous execution

Use synchronous evaluation for expressions whose actually executed functions are synchronous. `TraverseEntity()` intentionally has no synchronous persistence implementation and raises a clear error if forced through that path. Resolver-backed evaluation uses the asynchronous evaluator and an owner-supplied `EntityResolver`.

This keeps persistence out of the shared language implementation:

```text
expression evaluator
       |
       v
EntityResolver interface
       |
       +--> API/storage implementation
       +--> authorized/cached/batched implementation
       +--> test implementation
```

## 12. Programmer guidance

Prefer concise lexical field references when the expression belongs to a field/surface scope; use explicit `$.*` paths when the rule intentionally crosses that scope. Prefer pure functions. Use `TraverseCtx()` only for intentionally materialized-state semantics and `TraverseEntity()` for persisted hierarchy semantics.

Do not add a function to hide entity-specific imperative logic. A reusable function should express a general operation; the entity-specific decision remains in metadata/source. Likewise, do not introduce a second runtime representation merely to make an expression easier to evaluate—extend the canonical CTX contract only when the new observable state has clear ownership and lifecycle semantics.

## 13. Quick reference

| Function                  | Capability     | Main purpose                                    |
| ------------------------- | -------------- | ----------------------------------------------- |
| `EmailAddress`            | pure           | canonical email normalization                   |
| `TelephoneNbr`            | pure           | canonical international telephone normalization |
| `SqRoot`                  | pure           | square root                                     |
| `FirstCtx`                | ctx            | first CTX collection member/property            |
| `CurrentDay`              | clock          | current local calendar day                      |
| `CalendarAddDuration`     | pure           | calendar-aware date + duration                  |
| `CalendarDurationBetween` | pure           | calendar-aware duration between dates           |
| `CurrentUiLevel`          | ctx            | deepest active UI level                         |
| `TraverseUiLevels`        | ctx            | active UI-level ancestry                        |
| `TraverseCtx`             | ctx            | parent traversal in materialized CTX            |
| `TraverseEntity`          | entityResolver | persisted parent traversal                      |
| `GetTime`                 | clock          | current Unix timestamp                          |
| `StrFormat`               | pure           | indexed text formatting                         |

The function registry remains the executable source of truth. This document describes that contract for developers; when adding or changing a function, update both together.

## Interpreter grammar and optional-path contracts

The implemented tokenizer recognizes `?.` and `IN`, alongside `??` and the ternary `? :` operator. `?.` is path traversal, not a synonym for a general exception handler. The parser marks the **receiver** member optional; synchronous and asynchronous CTX resolvers return `null` when an optional receiver is missing or null, while mandatory members remain strict. This allows expressions such as `#data.current?.principalId ?? null` without silently accepting an unrelated misspelled mandatory path.

`IN` is membership over an **array operand**; comparison uses the evaluator's strict equality. Both operators are implemented in `shared/src/expressions/{tokenizer,parser,resolver,evaluator}.ts`. The precise syntax and examples are in [Expressions](Expressions.md).

The lexical resolver searches the first ordinary identifier from the current scope through ancestors, then traverses subsequent members downward only. Host-controlled capabilities distinguish pure functions, the clock, CTX and persisted-entity traversal; the expression does not authorize itself or write business state.
