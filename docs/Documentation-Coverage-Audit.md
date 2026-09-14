# Documentation Coverage Audit

## Purpose

This audit checks whether the major ManatOS infrastructures are documented as a coherent system for different audiences, rather than merely having files with matching names.

The documentation model used by this audit is:

- **Concepts / System Map** — common-reader orientation: what the subsystem is and why it exists;
- **Architecture** — authoritative system design, ownership boundaries, invariants and major flows;
- **Design** — detailed internal models and interaction contracts;
- **Development** — how to extend/implement the subsystem safely;
- **Reference** — exact catalogs, keys, endpoints, settings and stable semantics;
- **Usage** — administrator/end-user workflows where the subsystem is directly operated.

A subsystem is considered well covered only when readers can move between these layers without reconstructing missing architecture from source code.

## Executive result

Before this pass, documentation volume was uneven. Expression/CTX and parts of UI/design were strong, while several foundational infrastructures had only short architecture summaries or scattered implementation notes. Storage had useful capability prose but not the complete adapter/family/behavior/strategy/schema lifecycle. API, Runtime, Metadata and Platform/Application canonical architecture files were especially short relative to the amount of implemented infrastructure. Diagnostics existed mostly as source/tests and small usage/developer fragments without one canonical architecture narrative.

This pass strengthens the canonical architecture layer and adds explicit audience routes instead of duplicating the same prose everywhere.

## Coverage matrix

Legend: **Strong** = coherent and sufficiently detailed; **Improved** = materially strengthened in this pass; **Partial** = useful coverage exists but remains an area for future elaboration; **N/A** = not normally user-facing.

| Infrastructure                            | Concepts/System map | Architecture                       | Design           | Development             | Reference                | Usage           | Result after pass                     |
| ----------------------------------------- | ------------------- | ---------------------------------- | ---------------- | ----------------------- | ------------------------ | --------------- | ------------------------------------- |
| System/runtime ownership                  | good                | Improved                           | good             | good                    | partial                  | N/A             | strong core narrative                 |
| API/entity boundary                       | partial             | Improved                           | good             | good                    | good                     | indirect        | strong technical coverage             |
| Authentication/authorization              | good                | strong                             | good             | good                    | partial                  | good            | strong                                |
| CTX                                       | good                | strong                             | strong           | good                    | strong                   | developer usage | strong                                |
| Expression engine                         | good                | strong                             | strong           | strong                  | strong                   | indirect        | strong                                |
| Metadata/entity infrastructure            | good                | Improved                           | strong           | Improved links          | good                     | entity usage    | strong core narrative                 |
| UI surfaces/components                    | good                | strong                             | strong           | strong                  | good                     | strong          | strong                                |
| Events/reactivity                         | good                | good                               | strong           | good                    | good                     | indirect        | good                                  |
| Storage/adapters                          | partial             | **Major improvement**              | partial          | **Major improvement**   | **New Storage Catalog**  | admin config    | strong end-to-end coverage            |
| Relationships/aggregates                  | good                | metadata/storage cross-coverage    | strong           | entity guide            | entity/metadata catalogs | indirect        | good                                  |
| Platform/application composition          | partial             | Improved                           | app-design docs  | extension docs          | partial                  | navigation      | good; application runtime will evolve |
| Diagnostics/operation tracing/API traffic | partial             | **New canonical architecture doc** | error/CTX design | developer tools/testing | config/API refs          | developer tools | substantially improved                |
| Configuration/secrets                     | good                | security/storage coverage          | partial          | security/dev guides     | strong                   | admin config    | good                                  |
| Testing/verification                      | partial             | N/A                                | N/A              | strong                  | N/A                      | N/A             | strong developer coverage             |

## Storage findings

### Previous strengths

The existing `Data-and-Storage-Architecture.md` correctly described replaceable storage, capability inheritance, behavioral guarantees, persisted calculations, prospective SQL target preparation and semantic schema projection. `development/Storage-Adapters.md` also contained useful readiness-stage and target-workflow detail.

### Previous gaps

The material did not yet form one complete architecture. Important design decisions were either compressed or spread across source/tests:

- distinction between adapter definition, adapter family, configuration instance and active runtime provider;
- family inheritance/provenance as a first-class model;
- complete system-behavior → native-capability → adapter-strategy chain;
- semantic desired schema versus engine-specific physical schema;
- why native capability does not mandate native realization;
- relationship/uniqueness/atomicity as cross-adapter invariants;
- bootstrap selection versus prospective target administration;
- API CTX/storage diagnostic integration;
- maturity boundary between configured relational targets and runtime-ready adapters;
- explicit extension rules for a new adapter.

### Improvements

`architecture/Data-and-Storage-Architecture.md` is now the authoritative top-down narrative and preserves the useful earlier content while adding the missing foundation. `development/Storage-Adapters.md` is the implementation companion. `reference/Storage-Catalog.md` provides lookup-oriented facts. Configuration/usage docs remain the operational/admin view.

## API findings

### Previous state

The API architecture file accurately named major responsibilities but was too short to explain collection versus row authorization, generic entity APIs versus explicit commands, reference-catalogue behavior, capability projection, request correlation, relationship/transaction ownership and storage neutrality.

### Improvements

The expanded API architecture now describes these boundaries and explicitly documents organization-scoped collection behavior: a user may be authorized to open a collection while receiving only authorized rows. It also documents why inaccessible reference catalogues must not necessarily destroy an otherwise authorized parent page.

## Runtime findings

### Previous state

Runtime ownership was correctly summarized but did not provide enough detail about API/UI CTX independence, browser surface ownership, async request concurrency, metadata-to-runtime flow, expression-host behavior and diagnostics.

### Improvements

The expanded Runtime Architecture defines host ownership, independent CTX trees, API concurrency and browser state ownership, and links directly into diagnostics/storage/expression/UI architecture.

## Metadata/entity findings

### Previous state

Design documents were relatively strong, but the canonical Metadata Architecture was only a short summary. This forced readers to understand key distinctions by reading design files or source.

### Improvements

The architecture now explains canonical versus UI metadata, generic entity infrastructure versus SysBO terminology, defaults, relationships, calculations, internal entities, registries, platform contributions, expression placement and storage projection.

## Platform/application findings

### Previous state

The company/protoCRM ownership correction existed but the architecture narrative was small and easy to miss.

### Improvements

The platform/application architecture now makes scope ownership explicit and explains how company licensing, platform access, navigation and future application-defined entities reuse the common foundation without turning company entities into protoCRM features.

## Client/UI portability findings

### Previous state

The documentation correctly separated API authority from browser interaction in several places, but it often described the current `ui` package, UI server and browser as if those concrete hosts were the architectural UI itself. That could lead a reader to infer that ManatOS metadata, CTX, authorization presentation and diagnostics require Node.js/Express/EJS or the current BFF/browser topology.

### Improvements

The architecture now defines a portable **client/UI capability contract** first and identifies the current Node.js/Express TypeScript + EJS/Bootstrap/browser implementation as one realization. Dedicated development, reference and usage documents project that contract to client implementers, exact contract lookup and common-reader behavior. Runtime/API/security/diagnostics docs distinguish portable semantics from current-client implementation details.

This is now a documentation invariant: architecture must not make Express/EJS/DOM/session/filesystem details prerequisites of ManatOS UI semantics. Implementation guides may describe those details precisely when their scope is the current client.

The four-role authorization contract is also documented consistently: Admin full administration; Superuser read-only inspection plus Apps Playground execution; User organization-scoped operational access; Guest restricted baseline. Clients consume capability outcomes rather than rebuilding this matrix locally.

## Diagnostics findings

### Previous state

API Traffic, request IDs, logs, Operation Context, API CTX and snapshots were implemented and tested, but there was no single document explaining how they relate. Readers could easily assume multiple unrelated IDs or mistake CTX snapshots for another persistence system.

### Improvements

`architecture/Diagnostics-and-Observability-Architecture.md` now documents the one-ID correlation model, tool responsibilities, storage diagnostic levels, snapshot safety, local-filesystem limitation and deployment expectations.

## Areas already comparatively strong

The following areas already had unusually detailed documentation and were not rewritten merely for volume:

- Expression Architecture and expression reference;
- CTX architecture/design/reference runtime guide;
- Authentication and Authorization architecture;
- UI/component/list/entry/selector design;
- testing workflow.

Future edits should preserve this asymmetry where it reflects actual complexity rather than trying to make every document the same length.

## Remaining intentional gaps

Some documentation should evolve with implementation rather than pretending unfinished work exists:

- complete relational runtime adapter implementation details;
- versioned relational migration architecture;
- final datastore-native authorization predicate translation;
- application-defined entity packaging/lifecycle once the first real application-defined entity exists;
- remote diagnostics transport for split-server deployments;
- production diagnostics retention/access-control policy.

These are now marked as future/maturity boundaries in the relevant canonical documents rather than being silently absent.

## Documentation rules resulting from the audit

1. Every foundational infrastructure should have one canonical architecture narrative.
2. Design/development/reference documents should point to that narrative rather than restating a competing version.
3. Common-reader docs explain purpose/relationships, not implementation internals.
4. Reference catalogs optimize lookup and should not carry architectural rationale by themselves.
5. Usage docs explain operations and visible behavior, not internal class structure.
6. “SysBO” is not used as a synonym for generic entity infrastructure.
7. Company/platform/application ownership must remain consistent across architecture, application design and navigation documentation.
8. Documentation should distinguish implemented behavior, architectural contract and future work explicitly.

## Reading routes

### New contributor

[Concepts](Concepts.md) → [System Map](System-Map.md) → [Runtime Architecture](architecture/Runtime-Architecture.md) → subsystem architecture → development guide.

### Storage adapter implementer

[Data and Storage Architecture](architecture/Data-and-Storage-Architecture.md) → [Storage Adapters](development/Storage-Adapters.md) → [Storage Catalog](reference/Storage-Catalog.md) → storage contract tests/source.

### Entity/framework implementer

[Metadata Architecture](architecture/Metadata-Architecture.md) → [Entity/Metadata Design](design/Entity-Model.md) → [Adding an Entity](development/Adding-an-Entity.md) → [Entity Catalog](reference/Entity-Catalog.md).

### Runtime/debugging contributor

[Runtime Architecture](architecture/Runtime-Architecture.md) → [Context Architecture](architecture/Context-Architecture.md) → [Diagnostics Architecture](architecture/Diagnostics-and-Observability-Architecture.md) → [Developer Tools](development/Developer-Tools.md).
