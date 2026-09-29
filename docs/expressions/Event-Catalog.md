# Event Catalog

ManatOS distinguishes **semantic CTX mutation events** from **browser lifecycle/coordination events**. They must not be treated as interchangeable event buses.

| Event / class                                                                 | Owner                            | Meaning / principal consumers                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `manatos:ctx-change`                                                          | browser CTX runtime              | canonical semantic CTX mutation; debugger, reactive calculations, field/aggregate state and declarative policy may observe it |
| `manatos:ctx-ready`                                                           | browser CTX runtime              | document CTX runtime has been created                                                                                         |
| `manatos:ctx-diagnostic`                                                      | expression/runtime diagnostics   | parse/evaluation diagnostic surfaced to developer tooling                                                                     |
| `manatos:form-initialized`                                                    | entry reactive runtime           | deterministic entry initialization boundary; starts the first complete reactive/policy pass                                   |
| `manatos:form-initialization-changed` / `manatos:form-initialization-settled` | entry initialization coordinator | component initialization bookkeeping/coordination; not CTX mutations                                                          |
| `manatos:form-baseline-captured`                                              | entry state runtime              | baseline/dirty-state coordination after authoritative baseline promotion                                                      |
| contributor-state events                                                      | entry/component runtimes         | private aggregate form-state coordination for compound editors                                                                |
| popup/surface lifecycle events                                                | UI host/popup runtime            | presentation/host coordination; not a parallel semantic CTX mutation model                                                    |

## `manatos:ctx-change` detail

The current browser CTX runtime emits a detail shaped conceptually as:

```text
operation
path
relatedPaths[]
oldValue
newValue
cause.source
cause.eventId
cause.rootEventId
cause.triggerPath
```

`path` is the canonical changed CTX path. `relatedPaths` may identify projections/consequences relevant to observers but are not additional mutation authorities. `rootEventId` preserves causal ancestry across calculated cascades; each concrete mutation still receives its own `eventId`.

## Reactive consumption

The entry reactive scheduler does not consume an abstract `value:changed` / `ctx:changed` dispatcher. It consumes the actual `manatos:ctx-change` stream, queues `path` plus `relatedPaths`, deduplicates by the shared reactive queue-key policy, and matches against canonical dependency paths resolved from compiled AST variable nodes.

Browser custom-event names remain implementation contracts unless deliberately promoted to an external integration API. New code should prefer semantic ownership over adding another event name: if the fact is CTX state, mutate its canonical owner and let `manatos:ctx-change` describe the transition.
