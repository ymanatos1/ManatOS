# Events and Reactivity

Reactivity connects canonical CTX mutations to dependent calculations and presentation updates. The central invariant is that one logical state change has one authoritative mutation path and one causal event story.

## Dependency flow

A canonical field mutation enters through the CTX mutation boundary. Dependency matching identifies calculations/dynamic policy affected by the changed path, evaluates them, writes derived results through their canonical authority and notifies presentation consumers.

```text
canonical mutation
      |
      v
CTX change event
      |
      v
dependency matching
      |
      v
calculation / dynamic policy
      |
      v
canonical derived mutation
      |
      v
presentation refresh
```

Reactive queues prevent duplicate work from becoming competing semantic writers. Path-overlap rules and queue keys are shared policy rather than page-specific string matching. Aggregate form/workspace state can observe the resulting changes while retaining ownership of its own non-scalar transaction semantics.

See [State, Mutation and Events](../design/State-Mutation-and-Events.md) and [Event Catalog](../reference/Event-Catalog.md).

### One event-to-dependency matching boundary

Reactive consumers must not reinterpret `value:changed` or `ctx:changed` independently.
`dependencyChangePathsForEvent()` is the canonical event-to-identity projection and
`reactiveEventMatchesDependencies()` is the canonical invalidation predicate. This keeps
calculated values/UX, validation, tab visibility, and future metadata consumers aligned on
local, inherited-surface, and root CTX ownership semantics. The production browser uses the
same shared `reactivePathsOverlap()` policy for metadata components such as hierarchy views;
components must not embed their own path-overlap implementation.

### Validation uses the same initialization and event boundary

Reactive validation is gated by the same entry lifecycle as calculated values and declarative UX: `value:changed` and `ctx:changed` do not evaluate validators until `entry:initialized`. The initialization event performs one complete validation pass. After that boundary, each canonical runtime event is matched once through `reactiveEventMatchesDependencies()`; local projection aliases therefore cannot cause duplicate validation of the same target.

### Declarative UI policy starts after entry initialization

Dynamic tab visibility follows the same lifecycle boundary as calculations and validation. Field and CTX events emitted while an entry is still assembling its server values, metadata defaults, invocation defaults, and fixed caller values do not evaluate tab policy against that partial snapshot. `EntityEntryRuntime` performs one deterministic visibility refresh immediately after entry initialization completes; subsequent canonical events remain reactive through the shared event-to-dependency matcher.
