# Events and Reactivity

Reactive behavior follows mutation authority. A CTX mutation publishes a semantic change; dependency matching determines which calculations or dynamic UI policies are affected; recalculation proceeds until the relevant derived state reaches a stable result.

Dependencies are path-aware. Parent/descendant overlap is treated semantically rather than as unrelated string equality. A calculation does not become a writer of arbitrary state: its result is applied through the owning field/runtime boundary.

The browser evaluates UI-owned expressions. Server-owned calculations and resolver-backed operations execute where their required capabilities exist. This prevents the server from fabricating a browser CTX and prevents the browser from becoming a trusted business-policy host.

For exact mutation routes, dirty/validation aggregation and event behavior see [State, Mutation and Events](../design/State-Mutation-and-Events.md) and [Event Catalog](../reference/Event-Catalog.md).
