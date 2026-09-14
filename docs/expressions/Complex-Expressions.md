# Complex Expressions

ManatOS expressions become most useful when paths, operators, conditionals and registered functions are composed into one declarative rule. This guide demonstrates the **currently supported** composition model rather than introducing a second expression syntax.

For the exact operator grammar see [Expressions](Expressions.md); for function signatures see [Expression Function Catalog](Expression-Catalog.md).

## 1. Conditional field calculation

A current persisted example is the Principal root calculation:

```text
parentId == null
  ? null
  : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')
```

Step by step:

1. resolve the current `parentId`;
2. compare it with `null`;
3. the conditional evaluator executes only the selected branch;
4. a root Principal returns `null`;
5. otherwise `TraverseEntity` follows persisted parents and returns the terminal Principal `id`.

Because `TraverseEntity` is resolver-backed, API persistence can evaluate the same formula against authoritative storage. Changing `parentId` invalidates the calculated `rootPrincipalId`; hierarchy cascades can recalculate descendants before commit.

## 2. Default from metadata options

Current UI metadata uses:

```text
FirstCtx($entity-fields.platformId.enumItems, 'value')
```

Evaluation:

1. `$entity-fields.platformId` resolves the field-definition alias;
2. `.enumItems` resolves its canonical option collection;
3. `FirstCtx` takes the first item;
4. `'value'` projects the stored value.

This is useful as a declarative default when "first configured canonical option" is the rule. Ordering is supplied by metadata; `FirstCtx` does not invent its own sort.

## 3. Conditional formatting

A generic composition can choose a template before formatting:

```text
enabled
  ? StrFormat('{0} / active', name)
  : StrFormat('{0} / inactive', name)
```

Only the selected conditional branch is evaluated. `StrFormat` replaces `{0}` with the resolved `name`.

Dependencies include `enabled` and `name`. A client reactive owner can therefore recompute the result after either changes.

## 4. Null fallback

The expression language supports null coalescing (`??`), allowing a preferred value to fall back without a verbose conditional:

```text
description ?? name
```

If `description` is `null`/nullish according to evaluator semantics, the expression yields `name`.

A more useful composition can fall back after a lookup:

```text
FindCtx(statusItems, 'value', status, 'label') ?? status
```

The expression first tries to resolve a friendly label; if the catalogue has no match it preserves the stored status value.

## 5. Nested functions

Functions can be arguments to other functions:

```text
StrFormat(
  'Valid until {0}',
  CalendarAddDuration(validFrom, validityDuration)
)
```

Evaluation resolves `validFrom` and structured `validityDuration`, performs calendar-aware addition, then formats the resulting date. If the calendar function returns `null`, `StrFormat` substitutes an empty value for that argument.

Dependencies are still the source paths (`validFrom`, `validityDuration`), not a hidden mutable temporary.

## 6. Date/duration inverse

A UI capability maintaining start/end/duration can derive duration with:

```text
CalendarDurationBetween(validFrom, validUntil)
```

and derive end with:

```text
CalendarAddDuration(validFrom, validityDuration)
```

The component/runtime must define which field is currently authoritative during user interaction to avoid a calculation loop. The expression functions themselves are pure calendar primitives; they do not choose UI ownership.

## 7. Context collection lookup

Given a CTX collection of option objects:

```text
FindCtx(options, 'value', selectedValue, 'icon')
```

returns the selected item's icon. This avoids hard-coding a switch on every enum value.

For a first-item default:

```text
FirstCtx(options, 'value')
```

Both functions operate on arrays or object maps and return `null` when no suitable member exists.

## 8. CTX hierarchy versus persisted hierarchy

These two expressions look similar but mean different things:

```text
TraverseCtx(parentId, entries, 'parentId', 'id')
TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')
```

`TraverseCtx` traverses the collection already present in CTX. It is appropriate only when that collection is the intended complete source.

`TraverseEntity` asks the injected resolver for persisted records and can cross records not loaded in the current UI list. Persisted hierarchy semantics therefore use `TraverseEntity`.

## 9. Active UI-level expressions

In a client evaluator with the UI CTX contract:

```text
CurrentUiLevel()
TraverseUiLevels()
```

can be combined with path access to inspect the active surface chain. For example:

```text
CurrentUiLevel().kind == 'selector'
```

is true when the deepest surface is a selector. Such expressions are client-context-dependent and should not be placed in canonical metadata that the API must evaluate.

## 10. Clock-aware expressions

Creation metadata can use:

```text
CurrentDay()
```

while runtime diagnostics/logic that genuinely needs a timestamp can use:

```text
GetTime()
```

Both use the evaluator's injected clock. This means tests can supply a known time instead of depending on wall-clock timing.

## 11. Telephone/email normalization as composition

A persisted calculation can normalize separate telephone inputs:

```text
TelephoneNbr(countryCode, number)
```

A field normalizer can use the special candidate `value` scope:

```text
EmailAddress(value)
```

The same function registry therefore supports field normalization, defaults and calculations without putting those rules in a component.

## 12. Dependency and reactivity implications

Expression evaluation and dependency tracking are connected:

```text
enabled ? StrFormat('{0}', name) : description
```

The engine records the observable paths actually required according to its evaluation semantics. When a relevant dependency changes, the reactive owner schedules recalculation and projects the new value/state back to CTX/components.

Do not manually copy all source values into a private "formula state" object. Observable CTX paths are the dependency contract.

## 13. Persisted complex expressions

When `calculation.persisted` is true, the API evaluates/materializes the canonical expression before commit. A browser can also calculate the value for immediate presentation, but browser execution is not the persistence authority.

A persisted formula must therefore avoid client-only functions such as UI-level traversal and use capabilities available to the API execution owner.

## 14. Unsupported assumptions

Do not assume arbitrary JavaScript is accepted. Expressions are parsed by the ManatOS grammar, function calls must exist in the registry, and supported operators/path forms are deliberately constrained.

When an example requires a new reusable primitive, register it deliberately as described in [Adding Expressions and Expression Functions](Adding-an-Expression.md) rather than smuggling browser JavaScript into metadata.
