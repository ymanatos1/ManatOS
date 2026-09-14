# Adding Expressions and Expression Functions

There are two different extension tasks:

1. **authoring another expression** using the existing language/function registry;
2. **extending the language** by registering a new function in code.

Do not confuse them. Most business/UI rules should only need the first.

## Authoring an expression

Use an expression for a side-effect-free decision or calculation over observable/declared inputs.

Before adding one, ask:

- Does the rule depend only on CTX/metadata/explicit evaluator inputs?
- Is evaluation free of side effects?
- Is this a declarative rule rather than a command/workflow?
- If the required fact is absent from CTX, should an appropriate owner safely expose it?
- Is the expression valid in every host that must execute it, including API persistence for persisted calculations?

Then:

1. identify canonical inputs and expected output;
2. place the expression in canonical entity metadata or UI metadata according to ownership;
3. use registered functions rather than ad-hoc JavaScript;
4. ensure dependencies are observable by the reactive runtime;
5. test initial evaluation and every dependency transition;
6. for persisted calculations, test API/background materialization and cascades.

Security decisions should consume server-derived capabilities; do not recreate authorization policy as a browser expression.

## Adding a registered function

The canonical registry is:

```text
shared/src/expressions/functions/registry.ts
```

The parser and evaluator both import this registry. A registered function name is therefore part of the ManatOS metadata-language contract.

A normal new function is added as a keyed `checked({...})` definition. `checked` centralizes arity/type validation so the function body can focus on semantics.

### 1. Decide ownership/capability

Choose the narrowest execution capability:

- `pure` — only arguments;
- `clock` — needs the evaluator's injected `context.now()`;
- `ctx` — reads generic CTX/root state;
- `entityResolver` — needs authoritative persistence-backed entity access.

Do **not** import a storage adapter into a resolver-backed function. The evaluation owner injects the resolver capability.

If a proposed function depends on one browser widget/entity, it probably does not belong in the shared language. Prefer a reusable semantic primitive or keep the behavior in the appropriate component/service.

### 2. Define signature

A definition declares human-readable signature plus parser/runtime validation:

```ts
Double: checked({
  name: 'Double',
  capability: 'pure',
  signature: {
    text: 'Double(value: number)',
    minArguments: 1,
    maxArguments: 1,
    argumentTypes: ['number'],
  },
  evaluate: ([value]) => (value as number) * 2,
}),
```

Supported registry argument-type descriptors intentionally form a small runtime vocabulary. Use the narrowest useful type. Variadic functions can set `maxArguments: null` and `variadicType`.

### 3. Keep semantics deterministic

A pure function must not read global time, DOM, process state or mutable services. A clock function uses `context.now()`. CTX functions query the supplied root. Persistence functions consume an injected capability.

Expression source must remain portable across the hosts that are expected to evaluate it. Process-local AST caches are implementation detail and require no function-specific transport.

### 4. Handle null/error semantics explicitly

Document and test:

- empty/null input;
- invalid argument shape;
- missing CTX member;
- missing injected capability;
- cycles/depth limits for traversals;
- invalid domain values.

Return `null` when absence is a legitimate semantic result; throw `ExpressionEvaluationError` when the expression itself is invalid or cannot satisfy its contract.

### 5. Async/capability-backed example

`TraverseEntity` demonstrates the persistence-backed pattern. Its normal `evaluate` path rejects synchronous execution, while `evaluateAsync` requires `context.entityResolver` and performs entity-agnostic traversal.

A new resolver-backed function should follow the same principle: depend on the abstract capability, not SQL/JSON/storage-specific code.

### 6. Tests

Add evaluator/parser tests that cover:

- parse-time name/signature checks;
- normal result;
- null/empty behavior;
- invalid type/arity diagnostics;
- lazy conditional behavior where relevant;
- missing capability;
- deterministic clock injection for time functions;
- async result/error behavior for resolver-backed functions.

If browser runtimes provide a local implementation of shared functions, update/cover those host implementations consistently rather than letting the language diverge silently.

### 7. Documentation

Update [Expression Function Catalog](Expression-Catalog.md) with:

- exact signature/overloads;
- every argument;
- return value;
- capability/host requirement;
- null/error behavior;
- realistic example.

If the function enables a new composition pattern, add an example to [Complex Expressions](Complex-Expressions.md).

## When not to add a function

Do not register a function merely to avoid writing a service or to hide entity-specific branching. Registered functions are durable metadata-language primitives. Commands, mutations, authorization and external side effects belong to their owning service/runtime instead.
