# Context Architecture

CTX is ManatOS's **system-wide observable semantic runtime context model**. It provides structured, scoped runtime state for system execution, expressions, reactivity and diagnostics. CTX is not defined by one host: the API and interactive clients maintain independently owned trees with common semantics where appropriate. They are not synchronized copies.

At the generic level, CTX provides hierarchical ownership, lexical/scoped resolution, observable mutation and deterministic lifecycle. Host-specific topology is then built from those semantics:

```text
ManatOS CTX semantics
├── Client CTX
│   ├── system / entities / company / user
│   └── ui
│       └── level
│           └── level ...
└── API CTX
    ├── system / entities / company
    └── api
        └── level-<request>
            └── level-<subsystem> ...
```

CTX is not persistence and it is not a second domain model. Semantic runtime state belongs in CTX when it needs the model's ownership, scoping, observability or lifecycle. Private implementation bookkeeping should remain private runtime state unless there is a deliberate architectural reason to expose it semantically.

### Client CTX

The current web client uses long-lived `system`, `entities`, `company` and `user` branches plus a recursive `ui` surface chain. Lists, entries, selectors and popups use the same nesting model rather than parallel context trees.

The client architecture enforces a single scalar field authority: `fields.<key>.value` is live state and `fields.<key>.originalValue` is its baseline. `entry.current` and `entry.original` are read-only whole-record projections. Field dirty state derives from live versus baseline; aggregate surface dirty state may additionally include compound editors.

Related ownership rules follow the same principle:

- `fields.<key>.options` is the effective option domain for an entry field and is the selector/policy authority for that field; rendered `<option>` elements are presentation, not metadata storage.
- `resources.referenceData` is supporting factual resource data for consumers that genuinely need the resource; it is not a competing entry-field selector catalogue.
- `invocation.defaults` is caller provenance/input for a hosted create surface. Browser runtime reads it from CTX; hidden form values may transport it across HTTP boundaries but are not a second runtime authority.
- field mutations pass through the canonical field-mutation boundary so dirty state, option decoration, projections and dependent expressions observe one causal write.

See [Client Context Model](Client-Context-Model.md) for client mechanics, [API Context Model](API-Context-Model.md) for server/request mechanics, and [CTX Catalog](CTX-Catalog.md) for the path-by-path reference.

### Debugger resolution boundary

The CTX debugger is a diagnostic observer of the same browser context runtime used by expression lookup and mutation routing. It must use the runtime's canonical path APIs (for example `get()`, and `tokenize()` when tokenization is actually required) rather than carrying a private path parser or keyed-array resolver. Debug presentation may add aliases, icons, provenance, watch state and other non-semantic annotations, but those annotations never define an alternate CTX topology or resolution rule.

## API CTX

The API process owns one global CTX tree. Long-lived semantic branches (`company`, `system`, `entities`) coexist with `api`, whose children are short-lived request levels:

```text
$
├── company
├── system
├── entities
└── api
    ├── level-<call-id>
    │   ├── user
    │   └── level-<subsystem>
    └── level-<parallel-call-id>
```

Each request creates a unique call level and its own request-scoped user context. Major subsystem work can create nested levels beneath that call; STORAGE uses this mechanism and persisted-calculation work may nest further. Recursive lexical CTX lookup lets nested work resolve request/ancestor context without a process-global mutable “current level”.

Execution-local `AsyncLocalStorage` carries only the pointer to the current call/level; semantic state remains in the single API CTX tree. Parallel requests and parallel nested operations therefore keep independent identities. Request and nested levels are removed deterministically after execution.

The API and UI CTX trees are independently constructed from authoritative sources. They share semantic contracts where appropriate but are not synchronized copies.
