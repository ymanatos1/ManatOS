# System Overview

ManatOS is a metadata-driven application foundation and the repository that contains it. The design targets business systems in which domain entities, UI composition, runtime context, declarative decisions, security and persistence can share explicit contracts instead of being repeatedly encoded in page-specific logic.

The implementation is a TypeScript workspace with `shared`, `api` and `ui` packages. Shared contracts define the semantic vocabulary. The API owns business/security authority and persistence operations. The UI server/browser compose interaction from metadata and safe facts; the browser owns live CTX and reactive UI state.

The first concrete platform is **protoCRM**. It exercises the foundation with Principals, Users, Applications, Licenses, normalized contact information, organization hierarchy, authentication-provider administration and related system capabilities.

The central design objective is not “no code”. It is **code at the correct semantic layer**: canonical metadata for entity structure, UI metadata for presentation, expressions for pure observable decisions, server policy for authorization, components for reusable interaction, commands for side effects and storage adapters for persistence mechanics.

For a quick technical model read [Concepts](Concepts.md) and [System Map](System-Map.md). For deep responsibility boundaries read [Architecture](architecture/README.md).
