# Events and Reactivity

Reactivity connects canonical CTX mutations to calculations, validation and presentation policy. The production browser contract is deliberately small: **one canonical CTX mutation authority, one `manatos:ctx-change` notification stream, resolved canonical dependency paths, and one shared path-overlap/queue-key policy.**

## Production dependency flow

```text
authored expression source
        |
        v
UI compile boundary -> cached canonical AST
        |
        v
resolve variable nodes against the owning entry CTX scope
        |
        v
register canonical dependency paths
        |
canonical CTX mutation
        |
        v
manatos:ctx-change
        |
        v
queue path + causal identity
        |
        v
shared path-overlap match
        |
        v
reevaluate affected calculation / UX policy
        |
        v
canonical derived mutation (when applicable)
```

The AST is not reparsed to discover dependencies. `form-runtime.js` walks the already compiled AST and resolves each variable through the same CTX variable resolver used by evaluation. Dependencies are therefore **materialized canonical CTX paths for the entry runtime that owns the expression**, not a second abstract dependency namespace.

## One semantic change stream

The browser CTX runtime publishes `manatos:ctx-change` after a canonical mutation. The event carries the changed `path`, optional `relatedPaths`, old/new values, and causal data including `source`, `eventId`, `rootEventId` and `triggerPath`. `relatedPaths` are observable consequences/aliases, not additional writable authorities.

Entry modules also use form/component DOM events for lifecycle and coordination. Those events are not a competing semantic CTX bus. In particular, the deterministic initial reactive pass is tied to the actual `manatos:form-initialized` browser boundary.

## Dependency matching and queueing

The shared production policy is `shared/src/policies/reactive-runtime-policy.ts`:

- `reactivePathsOverlap(left, right)` — paths match when equal or when either is an ancestor of the other;
- `reactiveDependencyMatchesChange(...)` — the shared dependency/change predicate;
- `reactiveChangeQueueKey(changedPath, cause)` — deduplicates the same changed path within one causal event identity.

The entry runtime queues both the canonical event `path` and any `relatedPaths`, deduplicates them by queue key, and evaluates only registered entries whose resolved dependency paths overlap the queued path. Feature code must not invent another path-overlap algorithm for the same semantics.

A calculated field writes its result with `runtime.updateField(...)`. If that value changes, the normal CTX event is emitted and downstream calculations wake naturally. Cascades therefore use the same mutation/event path as user edits rather than a private calculation channel.

## Initialization

Reactive entries are registered while the form is being assembled, but the runtime performs one deterministic full pass only after entry initialization has settled. This ensures calculations and declarative UX see server values, metadata defaults, invocation defaults and fixed caller values as one coherent starting snapshot. Later changes are incremental and dependency-driven.

Validation and tab/action policy have their own owning modules but follow the same architectural rule: do not evaluate policy against a partially initialized entry, and consume canonical CTX state rather than reconstructing business state from DOM controls.

## Async capability ownership

One reactive queue drain owns one explicit evaluation pass. Resolver-backed calls such as `TraverseEntity()` may be deduplicated by promise **inside that pass only**. The promise map is not global state and is not shared between independent events. This prevents concurrent reactive events from accidentally sharing persistence results while still avoiding duplicate remote work within one settlement pass.

## Runaway protection

The current browser scheduler stops a drain after more than **512 reactive-entry executions** and reports a possible dependency cycle. This is a safety guard, not a cycle-resolution algorithm. Metadata calculations should still form understandable terminating dependency relationships.

See [State, Mutation and Events](../context/State-Mutation-and-Events.md), [Expression Architecture](Expression-Architecture.md), and [Event Catalog](Event-Catalog.md).
