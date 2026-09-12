# Developer Tools

When developer mode is enabled, the Developer Tools surface provides live runtime inspection without becoming another application-state authority. Its main areas are CTX Viewer, API Traffic and debugging CLI/context inspection.

## CTX Viewer

CTX Viewer exposes the current root context and nested UI levels. It can inspect semantic nodes, pin targeted paths, follow field/state values and help distinguish a variable's definition from its current calculated value. Tree nodes keep their structural names, while path captions/properties use the universal preferred notation: `#`-anchored forms first when possible, `$`-anchored forms otherwise. Targeted views remain bound internally to canonical absolute paths rather than copying runtime values into a second model.

## CLI execution context

The debugging CLI evaluates expressions relative to its current CTX execution context, shown in the prompt. Use `cd <path>` to change that context. `$` / `ctx...` paths are absolute, ordinary child paths are relative to the current context, and `cd ..` moves to the parent. After navigation the prompt is re-described using the same universal rule as the CTX Viewer: prefer `#level...` / `#...` when representable, otherwise use `$...`. Canonical CTX selectors and aliases such as `#level` or `$entity` are resolved by the canonical expression compiler rather than by a separate CLI parser.

## API Traffic

API Traffic correlates browser actions with HTTP activity. It is useful for detecting duplicate calls, understanding list/entry loading and seeing which operation follows a UI action. Traffic records are diagnostic data, not application persistence.

## Workspace behavior

The tool surface can be docked or detached while remaining attached to the same live page/runtime instance. Presentation preferences such as tabs, width, expansion state or detached-window geometry may persist as developer workspace preferences. Live CTX values and captured API responses do not become persisted business state.

See [Development / Developer Tools](../development/Developer-Tools.md) for implementation-oriented details and [CTX Catalog](../reference/CTX-Catalog.md) for the context paths being inspected.
