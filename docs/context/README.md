# CTX / Context

CTX is the system-wide observable semantic runtime context model. The generic architecture is shared, while API and interactive clients own independent trees shaped around their own execution lifecycles.

## Reading map

- [`Context-Architecture.md`](Context-Architecture.md) — host-neutral CTX model, ownership, lookup and invariants.
- [`Client-Context-Model.md`](Client-Context-Model.md) — client roots, recursive UI levels, fields/resources, invocation and surface lifecycle.
- [`API-Context-Model.md`](API-Context-Model.md) — API process tree, concurrent request branches, request-owned user context, nested subsystem levels, concurrency, cleanup and snapshots.
- [`State-Mutation-and-Events.md`](State-Mutation-and-Events.md) — canonical mutation/event semantics and reactive propagation.
- [`CTX-Reference.md`](CTX-Reference.md) — compact CTX reading/reference guide.
- [`CTX-Catalog.md`](CTX-Catalog.md) — catalog of public semantic paths/contracts.
- [`CTX-and-Expression-Runtime-Guide.md`](CTX-and-Expression-Runtime-Guide.md) — runtime/evaluator integration, dependencies and debugging-oriented detail.

## Related subjects

The CTX documents define context semantics and ownership. They deliberately link to, rather than duplicate, the complete expression language, client architecture, API architecture and diagnostics material in [`expressions/`](../expressions/README.md), [`clients/`](../clients/README.md), [`api/`](../api/README.md) and [`diagnostics/`](../diagnostics/README.md).

Return to the [documentation map](../README.md) or [repository overview](../../README.md).

## CTX implementation references

- [Context Architecture](Context-Architecture.md) — canonical tree and observation semantics.
- [Client Context Model](Client-Context-Model.md) — interactive UI root and owned levels.
- [API Context Model](API-Context-Model.md) — concurrent request branches.
- [CTX Reference](CTX-Reference.md) — paths, aliases and lexical addressing.
- [State Mutation and Events](State-Mutation-and-Events.md) — notifications and causal updates.

The UI `ctx.flow` and nested `ctx.ui.level` trees are distinct; neither is a debugger-specific state copy.
