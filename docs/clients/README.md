# Clients and UI

Implementation-neutral TypeScript client contracts plus the current web realization. Covers client CTX, surfaces/levels, entries/lists, navigation, actions, diagnostics and implementation guidance.

## Reading map

- [`Client-Architecture.md`](Client-Architecture.md) — Client and UI Architecture.
- [`Client-Contracts.md`](Client-Contracts.md) — Client Contract Catalog.
- [`UI-Surfaces-and-Levels.md`](UI-Surfaces-and-Levels.md) — UI Surfaces and Levels.
- [`UI-Flows.md`](UI-Flows.md) — UI Flows.
- [`Navigation.md`](Navigation.md) — Navigation.
- [`Client-and-UI-Capabilities.md`](Client-and-UI-Capabilities.md) — Client and UI Capabilities.
- [`Client-Implementations.md`](Client-Implementations.md) — Client Implementation Guide.

Errors can be hosted in nested UIS `ErrorInfo` surfaces. The API operation trace and its optional formatted presentation are defined in [Error Model](../system/Error-Model.md).

## Related subjects

This subject deliberately links to, rather than duplicates, the full detail owned by adjacent subjects: [`context/`](../context/README.md), [`metadata/`](../metadata/README.md), [`api/`](../api/README.md), [`security/`](../security/README.md), [`diagnostics/`](../diagnostics/README.md).

Return to the [documentation map](../README.md) or the [repository overview](../../README.md).

## UIS and client architecture

- [UIS Framework Architecture](UIS-Architecture.md) — semantic runtime layers, hosts, adapters and component composition.
- [UIS Surface Composition](UIS-Surface-Composition.md) — detailed List/Entry/Popup ownership, CTX levels, actions, resources and adapters.
- [UI Surfaces and Levels](UI-Surfaces-and-Levels.md) — CTX ownership, nested invocation and disposal.
- [UIS Components and Ownership](UIS-Component-Contracts.md) — reusable field/component declarations and adapter boundaries.
- [Flow Execution](Flow-Execution.md) — multi-step orchestration under `ctx.flow`.
- [UI Preferences and Windows](UI-Preferences-and-Windows.md) — font scale, focus, window and detached presentation.
- [Client Architecture](Client-Architecture.md) and [Client Contracts](Client-Contracts.md) — portable client semantics.

The TypeScript code contains Angular and EJS adapters over the shared semantic model. A native technology can implement analogous presentation boundaries without introducing another domain authority; this reference does not specify native implementations.
