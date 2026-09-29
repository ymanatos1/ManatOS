# Developer Tools

In the **current Express/browser client**, when developer mode is enabled, the Developer Tools surface provides live runtime inspection without becoming another application-state authority. Its main areas are CTX Viewer, API Traffic and debugging CLI/context inspection.

## API Traffic logs

Selecting an API Traffic row shows Request and Response details. When the UI and API share the same local filesystem layout, additional tabs appear for each available API log file containing that request's API-call ID. No tab is shown for a log source with no matching records.

The local lookup uses the Storage **Debug output directory** System Setting to locate the shared logs area. This is a development convenience rather than a deployment contract; a UI running on another server may not be able to read API files directly.

## CTX Viewer

CTX Viewer exposes the current root context and nested UI levels. It can inspect semantic nodes, pin targeted paths, follow field/state values and help distinguish a variable's definition from its current calculated value. Tree nodes keep their structural names, while path captions/properties use the universal preferred notation: `#`-anchored forms first when possible, `$`-anchored forms otherwise. Targeted views remain bound internally to canonical absolute paths rather than copying runtime values into a second model.

## CLI execution context

The debugging CLI evaluates expressions relative to its current CTX execution context, shown in the prompt. Use `cd <path>` to change that context. `$` / `ctx...` paths are absolute, ordinary child paths are relative to the current context, and `cd ..` moves to the parent. After navigation the prompt is re-described using the same universal rule as the CTX Viewer: prefer `#level...` / `#...` when representable, otherwise use `$...`. Canonical CTX selectors and aliases such as `#level` or `$entity` are resolved by the canonical expression compiler rather than by a separate CLI parser.

## API Traffic

API Traffic correlates browser actions with HTTP activity. It is useful for detecting duplicate calls, understanding list/entry loading and seeing which operation follows a UI action. Traffic records are diagnostic data, not application persistence.

## Workspace behavior

The tool surface can be docked or detached while remaining attached to one live Developer Tools DOM/runtime instance. Detaching moves that instance; it does not clone CTX or create a second subscriber set. During ordinary main-page navigation the detached window reconnects to the newly loaded page. A changed UI boot id indicates a server/system restart, so the live detached window closes instead of retaining stale runtime observations.

The current persistence lifetimes are intentionally not all the same:

- CTX Viewer coordinates such as selected/expanded paths, scroll position, Properties layout, width, history and watched path are developer-workspace preferences in `localStorage`; they survive navigation/reload and currently survive UI-server restart.
- API Traffic pause/filter/selection state and route counters are boot-scoped in `sessionStorage`; they survive navigation during one UI boot and reset when the boot id changes.
- API Traffic route visibility/catalog preferences, Developer Tools tab/visibility choices, CLI histories and detached-window geometry are durable browser-local developer preferences.
- live CTX values, traffic entries, subscribers and captured runtime objects are not persisted as debugger workspace state and never become business/application persistence.

When a persisted CTX path no longer exists on the next page, the viewer recovers selection to the nearest surviving parent rather than manufacturing the missing node.

These tools are a development capability of the current client, not a requirement that every future Angular/React/mobile client reproduce this exact dock. Portable diagnostic semantics are described in [Diagnostics and Observability Architecture](Diagnostics-and-Observability-Architecture.md).

See [Development / Developer Tools](Developer-Tools.md) for implementation-oriented details and [CTX Catalog](../context/CTX-Catalog.md) for the context paths being inspected.
