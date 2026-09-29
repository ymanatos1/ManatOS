# Expression Function Catalog

The canonical function registry is `shared/src/expressions/functions/registry.ts`. Function names and signatures are part of the metadata language contract: parser validation and evaluator execution use the same registry.

Capabilities:

- **pure** — requires only evaluated arguments;
- **clock** — uses the injected evaluator clock;
- **ctx** — reads CTX/root context in addition to arguments;
- **entityResolver** — requires an asynchronous persistence-backed entity resolver.

## `EmailAddress(value)`

**Signature:** `EmailAddress(value: scalar)`  
**Capability:** `pure`  
**Argument:** `value` — nullable/string-like scalar to normalize.  
**Returns:** normalized lower-case trimmed email string, or `null` for empty input.  
**Errors:** structurally invalid values raise `ExpressionEvaluationError`; this is intentionally not an SMTP deliverability check.

```text
EmailAddress('  USER@Example.COM ')
=> 'user@example.com'
```

Common use: canonical field normalization such as `normalize.expression: 'EmailAddress(value)'`.

## `TelephoneNbr(value)` / `TelephoneNbr(countryCode, number)`

**Capability:** `pure`

One-argument form accepts a complete international number beginning with `+`; formatting characters are removed. Two-argument form accepts a `+` country code and national number.

**Returns:** canonical `+<digits>` string or `null` for empty one-argument input. The final international number is limited to 15 digits.

```text
TelephoneNbr('+30 694 438 6714')
=> '+306944386714'

TelephoneNbr('+30', '6944386714')
=> '+306944386714'
```

Invalid country code/length/shape raises an evaluation error.

## `SqRoot(value)`

**Signature:** `SqRoot(value: number)`  
**Capability:** `pure`  
**Returns:** JavaScript numeric square root.

```text
SqRoot(81) => 9
```

The registry enforces a numeric argument before evaluation.

## `FirstCtx(collection, resultField?)`

**Capability:** `ctx`  
**Arguments:** `collection` may be an array or object map; optional `resultField` is a property name.  
**Returns:** first collection member, the requested property of that member, or `null` when unavailable.

```text
FirstCtx($enums.SysPlatform.values, 'value')
=> value of the first enum item

FirstCtx(entries)
=> first entry object
```

For object maps, "first" follows enumerable value order. The function does not impose business ordering; callers supply an already ordered collection.

## `FindCtx(collection, matchField, matchValue, resultField?)`

**Capability:** `ctx`  
**Arguments:** collection; property name to compare; value compared with strict equality; optional property to project.  
**Returns:** first matching member, the requested result property, or `null`.

```text
FindCtx(items, 'value', status, 'label')
=> label of the item whose value equals status
```

It is a generic CTX collection primitive and contains no entity/enum-specific policy.

## `CurrentDay()`

**Capability:** `clock`  
**Returns:** current **local** calendar day at midnight in `datetime-local` form `YYYY-MM-DDT00:00`.

```text
CurrentDay()
=> '2026-09-14T00:00'   // for an evaluator clock on that local day
```

The function uses `context.now()` rather than constructing its own clock, making tests/evaluator hosts deterministic. Current metadata uses it for creation defaults.

## `CalendarAddDuration(startDate, duration)`

**Signature:** `CalendarAddDuration(startDate: string, duration)`  
**Capability:** `pure`  
**Duration shape:** `{ years, months, days }`; absent/non-negative parts normalize to whole-number units.  
**Returns:** `YYYY-MM-DD`, or `null` for invalid inputs.

```text
CalendarAddDuration('2024-01-31', { years: 0, months: 1, days: 0 })
=> '2024-02-29'
```

Year/month arithmetic is calendar-aware and clamps end-of-month rather than flattening a month to an approximate day count.

## `CalendarDurationBetween(startDate, endDate)`

**Signature:** `CalendarDurationBetween(startDate: string, endDate: string)`  
**Capability:** `pure`  
**Returns:** largest non-negative `{ years, months, days }` duration that reaches `endDate` from `startDate`, or `null` for invalid dates / end-before-start.

```text
CalendarDurationBetween('2024-01-31', '2024-03-02')
=> { years: 0, months: 1, days: 2 }
```

It is the calendar-aware inverse companion to `CalendarAddDuration`.

## `CurrentUiLevel()`

**Capability:** `ctx`  
**Returns:** deepest active object in the canonical `ctx.ui.level.level...` chain, or `null` if no UI level exists.

```text
CurrentUiLevel().kind
=> 'entry'   // when an entry is the deepest active surface
```

Traversal is capped at 256 levels; exceeding that is an evaluation error.

This function is meaningful only in an evaluator host/root that exposes the client UI CTX contract.

## `TraverseUiLevels()`

**Capability:** `ctx`  
**Returns:** ordered array from root UI level to deepest/current level.

```text
TraverseUiLevels()
=> [listLevel, entryLevel, selectorLevel]
```

The same 256-level safety limit applies. This derives the active chain; it does not depend on a separate active-child registry.

## `TraverseCtx(startId, collection, parentField, resultField?)`

**Capability:** `ctx`

Follows an id-based parent chain inside an already available CTX collection.

- `startId` — id/key of the first row; empty returns `null`;
- `collection` — array/keyed map resolvable by id;
- `parentField` — property holding the next parent id;
- `resultField` — optional root property to return.

```text
TraverseCtx(parentId, entries, 'parentId', 'id')
=> id of the terminal/root row
```

Missing collection/row returns `null`. Parent cycles and traversal beyond 256 levels raise explicit errors.

Use this only when the complete required chain is legitimately in CTX. Persistence-backed hierarchy calculation should use `TraverseEntity`.

## `TraverseEntity(startId, entityKey, parentField, resultField?)`

**Capability:** `entityResolver` (asynchronous)

Traverses authoritative persisted entity records through the injected `EntityResolver`.

```text
parentId == null
  ? null
  : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')
```

This is used by the Principal persisted `rootPrincipalId` calculation. Empty start or missing record returns `null`; cycles/depth overflow raise errors.

The synchronous evaluator path rejects it; an evaluation owner must provide async execution and an `entityResolver`. The function imports no concrete storage adapter.

## `GetTime()`

**Capability:** `clock`  
**Returns:** evaluator-clock Unix timestamp in milliseconds.

```text
GetTime()
=> 1788135300000
```

Like `CurrentDay`, it uses the injected clock for deterministic tests/hosts.

## `StrFormat(format, ...values)`

**Capability:** `pure`  
**Signature:** `StrFormat(format: string, ...values: scalar)`  
**Returns:** string with zero-based `{n}` placeholders replaced.

```text
StrFormat('{0} / {1}', name, version)
=> 'protoCRM / 1.2.3'
```

`null`/`undefined` supplied values render as an empty string. Placeholders whose index is not supplied remain visible unchanged.

## Registry rules

The registry validates arity and the compact runtime type vocabulary (`any`, `scalar`, `string`, `number`, etc.) before a function implementation runs. `scalar` accepts `null`, string, number or boolean.

To add another registered function, follow [Adding an Expression / Function](Adding-an-Expression.md). For combinations of operators, paths and multiple functions, see [Complex Expressions](Complex-Expressions.md).
