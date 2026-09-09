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

See [Context Model](../design/Context-Model.md) for mechanics and [CTX Catalog](../reference/CTX-Catalog.md) for the path-by-path reference.
