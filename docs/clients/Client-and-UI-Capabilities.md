# Client and UI Capabilities

ManatOS can be presented by more than one client implementation. The TypeScript repository has three concrete web applications: the established `ui.EJS0` and the modern `ui.NG1` (Angular) / `ui.EJS1` (EJS) hosts. `shared.UI` provides reusable semantic UIS behavior, while `shared.UI.NG` and `shared.UI.EJS` provide presentation adapters. The architecture also admits other client technologies without moving business authority out of the API.

What should remain familiar across capable clients is the **system behavior**, not necessarily the pixels or navigation layout: authenticated identity, available entities, organization scoping, read/write permissions, platform access, metadata-defined fields/actions, validation and API error semantics come from shared/server contracts.

## Role-visible behavior

- **Admin** has full administration access throughout the system, subject only to explicit safety invariants such as not deleting the currently authenticated Admin's own User record where that rule applies.
- **Superuser** is an inspection-oriented administrative role: it can inspect scoped Users/Principals/Licenses and protected Applications/External Authentication/System Configuration surfaces without generic entity mutation. It also has protoCRM Apps Playground execution access.
- **User** has operational access scoped to its own User identity/organization, including organization-scoped Principals and Licenses, but not protected platform/administration surfaces.
- **Guest** has the restricted baseline and does not receive those organization/platform administration surfaces.

A client may hide unavailable navigation or disable actions for usability, but the API independently enforces every protected operation.

## Client differences

An additional React/mobile client may use routes, screens, drawers or native controls instead of the current web pages/popups. It may omit developer tooling entirely. Those differences do not change business authorization, storage semantics or entity contracts.

For the current built-in developer tools see [Developer Tools](../diagnostics/Using-Developer-Tools.md). For exact architecture see [Client and UI Architecture](Client-Architecture.md).

## Capabilities versus presentation state

A capability expresses what the authoritative API permits. A UI action may additionally be unavailable because the surface is loading, read-only, invalid, dirty, or waiting for another child surface. Those are interaction states rather than permissions. Presentation expressions can depend on both classes of facts, but only the API can grant a protected operation.

The `shared.UI/src/authorization/` projection consumes server-derived capability information. Lists and Entries should use these facts to choose available actions without inventing a parallel authorization policy in an Angular or EJS template. When a capability changes, the next protected request remains subject to fresh API enforcement.
