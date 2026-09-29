# System Overview

ManatOS is a **technology foundation** for building and operating metadata-driven, multi-platform business applications, and this repository contains its current implementation. The design targets business systems in which domain entities, UI composition, runtime context, declarative decisions, security and persistence can share explicit contracts instead of being repeatedly encoded in page-specific logic.

The implementation is a TypeScript workspace with `shared`, `api` and `ui` packages. Shared contracts define the semantic vocabulary. The API owns business/security authority and persistence operations. The UI server/browser compose interaction from metadata and safe facts; the browser owns live CTX and reactive UI state.

The first concrete platform is **protoCRM**. Its current platform-owned system scope centers on Applications and Apps Playground. Users/Account, Principals, Licenses, normalized Principal contact information, organization hierarchy and authentication-provider administration belong to the foundation-level technical Company domain and are reusable across platforms.

The central design objective is not “no code”. It is **code at the correct semantic layer**: canonical metadata for entity structure, UI metadata for presentation, expressions for pure observable decisions, server policy for authorization, components for reusable interaction, commands for side effects and storage adapters for persistence mechanics.

For a quick technical model read [Concepts](Concepts.md) and [System Map](System-Map.md). For deep responsibility boundaries read [Architecture](../README.md).

## Identity versus technical Company scope

Documentation uses **ManatOS** to mean the technology foundation and its architecture/software ecosystem. `Company` is retained as an implemented technical catalog/composition concept, including `ctx.company`; it must not be read as a statement that ManatOS is a company, corporation, or other particular legal organization.
