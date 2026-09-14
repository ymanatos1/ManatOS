# UI Surfaces and Levels

A UI **level** is one node in the active recursive interaction topology. The root active level may be a list or system surface; opening an entry creates a child; opening a selector/popup creates another child.

```text
ctx.ui
└── level  list
    └── level  entry
        └── level  selector/popup
```

The same topology supports page-hosted and popup-hosted surfaces. Hosting determines presentation/lifecycle integration; it does not create a second public context model.

Each level owns its invocation, effective metadata, surface state and resources appropriate to its kind. Closing a child disposes that child and restores its parent as the active leaf. Parent runtimes retain their anchored ownership paths so child creation cannot redirect parent mutations.

See [Entity Lists](../entities/Entity-Lists.md), [Entity Entries](../entities/Entity-Entries.md), [Popups and Selectors](../entities/Popups-and-Selectors.md), and [CTX Catalog](../context/CTX-Catalog.md).
