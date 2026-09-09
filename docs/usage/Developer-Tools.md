# Developer Tools

When developer mode is enabled, the Developer Tools surface provides live runtime inspection without becoming another application-state authority. Its main areas are CTX Viewer, API Traffic and debugging CLI/context inspection.

## CTX Viewer

CTX Viewer exposes the current root context and nested UI levels. It can inspect semantic nodes, pin targeted paths, follow field/state values and help distinguish a variable's definition from its current calculated value. Targeted views remain bound to canonical paths rather than copying runtime values into a second model.

## API Traffic

API Traffic correlates browser actions with HTTP activity. It is useful for detecting duplicate calls, understanding list/entry loading and seeing which operation follows a UI action. Traffic records are diagnostic data, not application persistence.

## Workspace behavior

The tool surface can be docked or detached while remaining attached to the same live page/runtime instance. Presentation preferences such as tabs, width, expansion state or detached-window geometry may persist as developer workspace preferences. Live CTX values and captured API responses do not become persisted business state.

See [Development / Developer Tools](../development/Developer-Tools.md) for implementation-oriented details and [CTX Catalog](../reference/CTX-Catalog.md) for the context paths being inspected.
