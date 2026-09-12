# Context Architecture

CTX is the observable runtime context used by expressions, reactive policy and developer diagnostics. It separates global facts from the recursive active UI topology.

```text
ctx
├── system
├── entities
├── company
├── user
└── ui
    └── level
        └── level
            └── ...
```

Root branches have long-lived ownership; `ctx.ui.level` is recursively scoped to visible/active surfaces. Lists, entries, selectors and popups use the same nesting model rather than parallel context trees.

CTX is not persistence. Entry fields expose persisted values while editing, but the context also contains transient facts, permissions, UI state, paging, selection, component resources and aggregate workspaces. Each node therefore has an owner and lifecycle.

The architecture enforces a single scalar field authority: `fields.<key>.value` is live state and `fields.<key>.originalValue` is its baseline. `entry.current` and `entry.original` are read-only whole-record projections. Field dirty state derives from live versus baseline; aggregate surface dirty state may additionally include compound editors.

Related ownership rules follow the same principle:

- `fields.<key>.options` is the effective option domain for an entry field and is the selector/policy authority for that field; rendered `<option>` elements are presentation, not metadata storage.
- `resources.referenceData` is supporting factual resource data for consumers that genuinely need the resource; it is not a competing entry-field selector catalogue.
- `invocation.defaults` is caller provenance/input for a hosted create surface. Browser runtime reads it from CTX; hidden form values may transport it across HTTP boundaries but are not a second runtime authority.
- field mutations pass through the canonical field-mutation boundary so dirty state, option decoration, projections and dependent expressions observe one causal write.

See [Context Model](../design/Context-Model.md) for mechanics and [CTX Catalog](../reference/CTX-Catalog.md) for the path-by-path reference.

### Debugger resolution boundary

The CTX debugger is a diagnostic observer of the same browser context runtime used by expression lookup and mutation routing. It must use the runtime's canonical path APIs (for example `get()`, and `tokenize()` when tokenization is actually required) rather than carrying a private path parser or keyed-array resolver. Debug presentation may add aliases, icons, provenance, watch state and other non-semantic annotations, but those annotations never define an alternate CTX topology or resolution rule.
