# Client and UI Capabilities

ManatOS can be presented by more than one client implementation. The current web interface is the repository's Node.js/Express TypeScript client, but the system architecture permits other web frameworks, mobile clients and specialized interfaces.

What should remain familiar across capable clients is the **system behavior**, not necessarily the pixels or navigation layout: authenticated identity, available entities, organization scoping, read/write permissions, platform access, metadata-defined fields/actions, validation and API error semantics come from shared/server contracts.

## Role-visible behavior

- **Admin** has full administration access throughout the system, subject only to explicit safety invariants such as not deleting the currently authenticated Admin's own User record where that rule applies.
- **Superuser** is an inspection-oriented administrative role: it can inspect scoped Users/Principals/Licenses and protected Applications/External Authentication/System Configuration surfaces without generic entity mutation. It also has protoCRM Apps Playground execution access.
- **User** has operational access scoped to its own User identity/organization, including organization-scoped Principals and Licenses, but not protected platform/administration surfaces.
- **Guest** has the restricted baseline and does not receive those organization/platform administration surfaces.

A client may hide unavailable navigation or disable actions for usability, but the API independently enforces every protected operation.

## Client differences

A future Angular/React/mobile client may use routes, screens, drawers or native controls instead of the current web pages/popups. It may omit developer tooling entirely. Those differences do not change business authorization, storage semantics or entity contracts.

For the current built-in developer tools see [Developer Tools](Developer-Tools.md). For exact architecture see [Client and UI Architecture](../architecture/UI-Architecture.md).
