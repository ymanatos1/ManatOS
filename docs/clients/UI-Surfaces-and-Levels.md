# UI Surfaces and Levels

A UI **level** is one node in the active recursive interaction topology. The root level is page-hosted. A level may own one child level, allowing popup and embedded interactions to extend the same semantic tree rather than creating parallel context models.

```text
ctx.ui
└── level  page: list/entry/system
    └── level  popup: entry/selector/...
        └── level  popup or embedded child
            └── ...
```

## Three hosts

ManatOS has three fundamental UI hosts:

- **page** — the root routed surface;
- **popup** — a child surface that temporarily owns interaction over its parent;
- **embedded** — a child UI level rendered/edited locally inside its owning surface.

`host` answers where the level is mounted and how parent activation behaves. `kind` describes what the level means, such as `entry`, `list`, `selector` or another interaction. `mode` describes operation semantics such as `view`, `edit` or `create`.

A popup is not a separate context architecture, and an embedded entry is not a second entity framework.

## One browser host authority

The current browser implementation uses one UI-host runtime to create, update and dispose UI levels. Browser-created popup and embedded children both call the canonical `uiHost.openSurface(...)` / `uiHost.closeSurface(...)` lifecycle; neither host owns a parallel CTX-opening mechanism. Routed page roots are materialized from server bootstrap through the same canonical surface model.

The architectural contract is the important part: surface host (`page`, `popup`, `embedded`) and semantic purpose (`entry`, `selector`, `list`, ...) are orthogonal. Browser-created child surfaces use one recursive opener; page roots use the same surface model at bootstrap rather than pretending that navigation is a child operation.

## Parent activation

Popup and embedded children intentionally differ in parent activation:

- opening a **popup** deactivates its parent while the child is active and reactivates the parent when the child closes;
- opening an **embedded** child leaves its parent active because the child is part of the parent's local interaction/composition.

Both still have their own UI-level identity, lifecycle, invocation and semantic ownership path.

## Lifecycle

A created child becomes active. Disposal is explicit and passes through the closing lifecycle before the child node is removed. Surface-owned browser runtimes are notified before deletion so subscriptions can retire while their lexical CTX scope still exists.

Closing a popup restores the immediate parent rather than searching for or reconstructing another page state. Closing an embedded child does not require parent reactivation because the parent was never deactivated.

## Ownership

Each level owns its own invocation, control/lifecycle state, effective presentation identity and resources appropriate to its kind. Entry levels own their field/current/baseline semantics. A child never takes ownership of its parent's fields merely because it is the deepest level.

Parent runtimes retain anchored CTX ownership paths. This is important when nested children open: a mutation intended for the parent must not be redirected merely because the global leaf changed.

## UI views are a separate dimension

An entity **UI view** (`main`, `quickView`, `quick`, etc.) selects a named presentation of the same canonical record. `viewType` (`full`, `quick`, ...) describes the view family. Neither concept is a host.

Consequently:

```text
host       = page | popup | embedded
kind       = entry | selector | list | ...
UI view    = main | quickView | quick | ...
viewType   = full | quick | ...
```

A `quick` UI view can therefore be hosted in a popup without “quick popup” becoming a fourth runtime surface.

See [Entity UI Views](../metadata/UI-Views.md), [Entity Entries](../entities/Entity-Entries.md), [Popups and Selectors](../entities/Popups-and-Selectors.md), and [CTX Catalog](../context/CTX-Catalog.md).
