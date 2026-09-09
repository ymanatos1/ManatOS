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
