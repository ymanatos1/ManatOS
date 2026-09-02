# Expression Parsing and Evaluation Mechanics

This document describes the ManatOS expression engine as an architectural subsystem: parsing, AST construction, lexical value resolution, evaluation ownership, function capabilities, remote capability delegation, EntityResolver, persistence-backed traversal, caching, diagnostics and the browser/API split.

## 1. Core rule: the expression is declarative

Metadata owns the expression text. Renderers, services and entity-specific code must not reproduce the formula in imperative branches. The same canonical expression can be evaluated by different owners with different execution contexts.

For example, `SysPrincipal.rootPrincipalId` is declared as:

```text
parentId == null
  ? null
  : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')
```

The formula does not know whether it is running in a browser entry page, an API save, a background process, a test or a CLI.

## 2. Parse once: source -> typed AST

`compileExpression()` tokenizes and parses source text into the shared AST. Function-call nodes are annotated from the canonical registry with the capability declared by that function. The compiled expression also records the union of capabilities that may be needed by the AST.

Static capability presence is planning information only. It does **not** mean that every such function will execute. Runtime lazy semantics remain authoritative.

## 3. Evaluation owner

Every evaluation has an owner: the host responsible for producing the final result. Typical owners are:

- browser metadata entry runtime;
- page or CTX-viewer CLI;
- API/domain save pipeline;
- future background/workflow jobs;
- tests.

The owner keeps responsibility for the full expression. It evaluates every part for which it has the required capability and delegates only reached work that requires a capability it does not possess.

A delegated server call therefore does not transfer ownership of the whole formula.

## 4. Execution context: scope versus ambient capabilities

An evaluation execution context contains:

- `owner` - identity of the evaluation host;
- `root` - lexical root available to variable resolution;
- `scope` - current lexical value container;
- `capabilities` - capabilities available locally;
- optional providers such as `EntityResolver`.

This separates the formula from the source of its parameter values.

### Browser entry example

The entry page owns the calculation. Bare `parentId` resolves from the live current entry/CTX field state, including unsaved changes.

### API/background example

The server process can use the same expression with a candidate or persisted entity as its scope. `parentId` then comes from that record rather than from browser CTX.

Canonical entity formulas should therefore prefer entity-local field names (`parentId`) rather than hard-coded UI paths (`ctx.page.page.dataCurrent.parentId`).

## 5. Function capabilities

Registry functions declare the capability needed to execute them. Phase 1 uses these categories:

- `pure` - deterministic/local scalar or value operations;
- `clock` - requires the evaluator clock;
- `ctx` - operates on materialized CTX/value structures;
- `entityResolver` - requires canonical persisted entity access.

Examples:

| Function | Capability | Meaning |
|---|---|---|
| `SqRoot` | `pure` | local numeric operation |
| `StrFormat` | `pure` | local formatting |
| `CurrentDay` / `GetTime` | `clock` | owner-provided clock |
| `FirstCtx` | `ctx` | materialized context lookup |
| `TraverseCtx` | `ctx` | hierarchy traversal inside an already-materialized collection |
| `TraverseEntity` | `entityResolver` | canonical persisted hierarchy traversal |

Capabilities describe requirements, not hard-coded deployment locations. Today the API supplies `entityResolver`; a future trusted worker may also supply it.

## 6. Lazy semantics are preserved across capability boundaries

The evaluator preserves lazy behavior for `?:`, `&&`, `||` and `??`.

For Root Principal:

```text
parentId == null ? null : TraverseEntity(...)
```

when the browser's live `parentId` is null, the false branch is never reached. The result becomes null immediately and no API/resolver request occurs.

Static parsing may mark the expression as *potentially* requiring `entityResolver`; only runtime reachability activates delegation.

## 7. Browser-owned hybrid execution

The browser has local scalar/CTX capabilities but no database resolver. When it reaches an AST function node annotated with `entityResolver`:

1. the browser evaluates that function's arguments locally;
2. unsaved local values therefore remain authoritative inputs;
3. the browser sends only the reached function name and evaluated arguments through the authenticated UI/API boundary;
4. the API executes the function with an authorization-aware `EntityResolver`;
5. only the function result is returned;
6. the browser resumes and completes its own AST evaluation.

Phase 1 delegates reached resolver function calls individually. A later planner may combine compatible reached subtrees/batches while preserving the same owner and lazy semantics.

## 8. Server-owned execution

A server-side owner can provide `EntityResolver` directly in its execution context. The same AST then runs entirely on the server, with no HTTP delegation.

This is how persisted calculated fields are materialized during API create/update and how future background recalculation jobs can execute the same formula.

If a caller asks an owner to execute a formula requiring a capability that neither the owner nor an allowed delegate provides, evaluation must fail explicitly. The evaluator must never fabricate a browser/UI value or silently weaken the formula.

## 9. EntityResolver

`EntityResolver` is the expression engine's storage-independent canonical entity lookup capability. Expression functions never import a concrete datastore, repository, SQL driver or entity-specific service.

Phase 1 contract:

```text
getById(entityKey, id) -> entity | null
```

The current API implementation uses the Map-backed datastore. Future adapters may translate the same operation into indexed database lookups, batched requests, recursive CTEs or other optimized queries without changing expression metadata or registry functions.

### Security boundary

Browser-requested resolver execution uses an authorization-aware resolver. Resolver records are projected through canonical SysBO metadata before expression functions see them: sensitive fields are excluded even when the authenticated user may read the entity. Intermediate entity records used during traversal are not exposed as raw storage objects, and only the permitted expression-function result crosses the boundary. A future calculation that genuinely needs sensitive material must use a separate explicitly privileged capability rather than weakening `EntityResolver`.

### Evaluation-scoped cache

The current resolver caches canonical `entityKey:id` reads for the lifetime of one resolver/evaluation request. This avoids repeated storage work during a traversal without introducing stale global expression caches.

## 10. TraverseCtx versus TraverseEntity

`TraverseCtx()` remains valid and intentionally unchanged. Use it when the collection being traversed is genuinely part of the current materialized execution context.

`TraverseEntity()` is for canonical persisted hierarchy traversal. It must not depend on a list page, filtering, pagination or navigation history.

This distinction fixes the earlier Root Principal limitation where `ctx.page.dataList` accidentally acted as if it were the complete Principal database.

## 11. Root Principal end-to-end

Assume:

```text
Root A (parentId = null)
  Parent B (parentId = A)
    Child C (parentId = B)
```

The Child entry's live scope contains `parentId = B`.

### Browser owner

1. browser resolves `parentId` from live entry scope;
2. condition `parentId == null` is false;
3. browser reaches `TraverseEntity(B, ...)`;
4. that node requires `entityResolver` and is delegated;
5. API resolver gets B, then A;
6. A has no parent, so the function returns A's id;
7. browser resumes and sets live `rootPrincipalId = A`.

The current list may be filtered, paged, empty or absent. None of that affects the result.

If the user changes Parent to null before saving, step 2 is true and the browser returns null with zero resolver/API interaction.

### API/domain owner

During create/update, the candidate Principal record supplies the same local field scope. Because the API owner already has `entityResolver`, it executes `TraverseEntity()` locally and persists the identical result.

## 12. CLI behavior

Both developer CLIs use the same expression ownership rules.

- Entry-page CLI scope comes from its current entry/CTX path.
- CTX Viewer CLI scope is the selected CTX node.
- A bare variable must exist in that scope or evaluation fails before remote resolver work.
- Explicit literal arguments can invoke `TraverseEntity()` from any scope.

The CLIs are therefore diagnostics clients of the canonical evaluator model, not separate expression languages.

## 13. Declarative UI decision pipeline: before and after

The evaluator originally entered the UI primarily through calculated CTX values: metadata declared a formula, CTX supplied values, and the renderer displayed the result. Presentation and access decisions still commonly had a second imperative path in routes/templates, for example checking role, entitlement or `permissions.create` directly before rendering a navigation item or button.

That produced two decision mechanisms:

```text
calculation: metadata expression -> evaluator -> CTX/rendered value
UI policy:   route/template if/else -> rendered visibility/enabled state
```

The current architecture converges both onto one declarative mechanism:

```text
trusted/runtime facts in CTX
        ↓
metadata dynamic value (`T` or `{ expression }`)
        ↓
shared compile/typed AST
        ↓
generic evaluator against the current lexical CTX scope
        ↓
resolved presentation property
        ↓
generic renderer
```

### 13.1 Facts are not policy

CTX contains already-resolved facts. Examples include:

```text
mode = 'create' | 'edit' | 'view'
permissions.create
permissions.edit
permissions.delete
ctx.user.permissions.userRole
ctx.user.permissions.mcrm.capabilities.platformAccess
addConstraintReached
```

A fact answers a question about the current request/runtime. It should not encode a renderer decision such as `showAddButton` or `hideApplicationsMenu`.

Metadata owns the policy that consumes those facts. Examples include:

```text
navigation.visible:
  user.permissions.mcrm.capabilities.platformAccess === true

list.addAction.visible:
  permissions.create === true

list.addAction.enabled:
  addConstraintReached !== true

entryActions.delete.visible:
  mode !== 'create' && permissions.delete === true

entryActions.save.visible:
  mode !== 'view' &&
  (permissions.create === true || permissions.edit === true)
```

This keeps facts reusable. `addConstraintReached`, for example, only says that the generic enum-coverage constraint has been reached; metadata decides that the Add action should then be disabled and supplies its disabled reason.

### 13.2 `ManatOSDynamicValue<T>`

The framework-neutral dynamic-value contract is:

```ts
T | { expression: string }
```

and is named `ManatOSDynamicValue<T>`. UI metadata's `SysBOUIDynamicValue<T>` aliases this type instead of owning a separate expression concept. Navigation/platform metadata can therefore use the same contract without depending on SysBO UI types.

Static values remain valid and require no evaluation. Expression-backed values are compiled/evaluated by the common engine.

### 13.3 CTX field-node transparency

CTX deliberately stores entity/page facts in inspectable field/pointer nodes such as `{ value, option, expression, ast }`. Ordinary policy expressions should nevertheless read naturally:

```text
permissions.create
permissions.edit
```

The resolver therefore treats a field node's `value` as transparent when a requested nested member is not an explicit CTX member. Explicit introspection still wins, so these remain distinct and valid:

```text
principalType.option.canHaveParent
rootPrincipalId.expression
rootPrincipalId.value
```

This allows one CTX representation to support both concise policy expressions and precise debugger inspection.

### 13.4 Navigation and action migration

Navigation visibility now evaluates `ManatOSDynamicValue<boolean>` against the authoritative request CTX, with compiled expressions cached by source string. Legacy authentication/role contribution properties remain as a compatibility path for navigation items not yet migrated, but platform entitlement is no longer a parallel input: `ctx.user.permissions.<platform>.capabilities.platformAccess` is the single UI decision fact used by navigation and the platform route guard.

Metadata-driven entry actions resolve `visible`, `enabled` and `disabledReason` generically. Standard Save/Delete rules therefore live in metadata rather than an entity renderer. List Add resolves the same style of dynamic `visible`, `enabled` and `disabledReason` properties. Renderers receive resolved action models and do not add a second permission gate.

### 13.5 UI policy is not server authorization

Evaluator-backed visibility/enabled state is presentation policy. It improves consistency, debuggability and reuse, but it is not a security boundary. API/domain services still enforce authentication, authorization, relationship constraints and command invariants independently. A malicious or outdated client must still be unable to perform an operation that the API denies.

### 13.6 Why the split matters

The separation is intentional:

- **CTX** says what is true now;
- **metadata** says what the UI policy is;
- **the evaluator** applies that policy consistently;
- **the renderer** presents the resolved result;
- **the API/domain layer** remains authoritative for security and persistence.

That structure makes decisions inspectable in the Debugging tab/CTX Viewer, removes duplicated renderer branches, and lets future renderers (Angular, React, mobile, etc.) consume the same metadata contract.

The Debugging inventory itself now follows the same separation. A reusable presentation-model builder discovers formulas, provenance, definition CTX paths and current-value CTX paths from canonical/UI metadata; EJS only renders the resulting rows. Likewise, generic option/value presentation is resolved by a shared metadata presentation helper rather than by domain-specific formatter branches. These boundaries are deliberately renderer-independent so Apps Designer/Playground and future Angular/mobile clients can reuse the same semantics.

## 14. Diagnostics

Evaluation diagnostics retain caller/source/target provenance and should eventually include delegated capability provenance. Capability failures are explicit, for example when an API-owned expression requires a browser-only capability that was not supplied.

## 15. Phase 1 versus later optimization

Phase 1 establishes ownership, execution context, capability annotations, EntityResolver and `TraverseEntity()`.

Later phases can add:

- dependency plans listing local fields and persisted entity fields;
- maximal capability-compatible AST fragment delegation;
- batching of several reached resolver operations in one request;
- relationship-metadata-driven `TraverseRelation()` / `RootOf()`;
- richer query/aggregate functions such as `EntityById`, `FindEntity`, `ExistsEntity`, `CountEntity`, `Lookup` and aggregates;
- adapter-specific query planning and recursive database execution.

Those optimizations must not change the golden semantics: declarative metadata remains authoritative, evaluation ownership remains with the caller, lazy branches stay lazy, and persistence access remains behind capability providers.
