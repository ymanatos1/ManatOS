# ManatOS

**ManatOS — the operational platform for ManatOS applications.**

ManatOS is a multi-platform application foundation built around canonical metadata, hierarchical runtime context (CTX), reusable entity infrastructure, declarative behavior, authorization capabilities and pluggable storage. The repository contains the shared contracts, API/runtime services and the current web client. The web UI is one client implementation of the platform contracts rather than the definition of those contracts.

## Repository structure

- `shared/` — contracts and metadata shared by API and clients.
- `api/` — Express/TypeScript API, authentication and authorization, entity services, storage adapters, configuration and request/runtime context.
- `ui/` — Express/TypeScript web application, metadata-driven pages, typed UI runtime, EJS presentation and thin browser host adapters.
- `docs/` — permanent subject-oriented architecture, design, development and reference documentation.
- `postman/` — API collection and local environment.
- `scripts/` — repository initialization, development, verification and data-reset tooling.
- `data/` — local runtime configuration and development data; contents depend on the configured storage adapter.

## Runtime architecture

ManatOS separates semantic runtime state from presentation and physical host behavior. The typed UI runtime owns semantic UI levels and their lifecycle. A `UiLevel` owns one canonical semantic CTX branch and can host a page, popup or embedded surface. Presentation components bind to that state; browser JavaScript is used as a thin DOM/host/transport adapter rather than as a second semantic runtime.

The intended runtime chain is:

`UiRuntime → UiLevel → Surface → semantic CTX → Binding → Component → View → Host`

Page, popup and embedded are presentation/hosting choices. They do not independently define entity semantics, persistence ownership or transaction ownership. Entry views use the same canonical entity metadata and runtime regardless of host.

## CTX

CTX is the hierarchical runtime context model used by both UI and API execution. UI levels receive their own context branches with explicit ownership and lifecycle; parent/root traversal provides access to enclosing semantic state without duplicating it. Runtime bookkeeping that is not application semantics remains private implementation state rather than being projected into CTX.

The API maintains its own process-local context hierarchy for request execution and subsystem levels. Optional API CTX snapshots and the debugger facilities provide observability without making diagnostics the owner of runtime behavior.

See [`docs/context/`](docs/context/) for the context model, ownership, mutation/event behavior and reference material.

## Metadata-driven entities and UI

Entity metadata is the canonical definition of entity fields, relationships and reusable behavior. UI metadata composes presentation from those canonical definitions rather than redefining the entity model. The entity infrastructure supports lists, entries, multiple keyed UI views, field components, validation, related collections, selectors and hierarchy-oriented surfaces.

An entity can expose multiple `ui-view`s for different interaction patterns while retaining one canonical entity definition. Full, quick and other views can select or override layout and presentation behavior without creating separate entity implementations.

SysBOs are system-owned business objects. The generic entity infrastructure is not limited to SysBOs and is intended to support application-defined entities as well.

See [`docs/metadata/`](docs/metadata/) and [`docs/entities/`](docs/entities/).

## Expressions and reactive behavior

Side-effect-free decisions that depend on CTX-observable state can be represented as declarative expressions. Expression source is parsed lazily and cached process-locally; dependencies and subscribers allow the runtime to reevaluate affected behavior without scattering equivalent imperative rules through views.

The UI process and API process maintain separate AST caches. ASTs are implementation artifacts and are not transferred between UI levels or between processes.

See [`docs/expressions/`](docs/expressions/).

## Entries, ownership and persistence

The Entry runtime is generic. Opening an Entry supplies invocation context such as host, UI view, caller rules and persistence strategy. Caller context can provide contextual initial/fixed values and presentation constraints without contaminating canonical entity metadata.

Persistence ownership is independent of host. A standalone Entry can persist through the repository/API path; an Entry owned by a larger aggregate can return a semantic contribution to that owner instead. Aggregate work uses a recursive heterogeneous workspace transaction capable of representing existing-record changes, new `draft:*` identities, relationships, related collections and nested mutations. Draft identities remain stable while work is staged or recovered and are resolved to persisted identities only at aggregate commit.

Normal closure follows one lifecycle authority. Dirty-state decisions, Save/Discard/Cancel and surface disposal flow through the canonical close mechanism rather than independent page/popup close engines.

## Organization workspaces

Organization editing is implemented as an aggregate hierarchy workspace over the generic entity, Entry, relationship and transaction facilities. The Organization surface coordinates hierarchy-specific rules while generic Entry and transaction infrastructure remain entity-agnostic.

An Organization workspace can contain persisted members with staged changes, new draft members, heterogeneous related records and relationships between persisted and draft identities. Owned Entry saves contribute semantic changes to the workspace; they do not independently commit those changes to application storage. Final aggregate commit is the persistence boundary.

Create Organization deliberately supports a browser draft across normal navigation. Abnormal interruption recovery is a separate mechanism and restores semantic workspace state rather than DOM/runtime implementation state.

See [`docs/company/`](docs/company/) and the hierarchy/entity material under [`docs/entities/`](docs/entities/).

## API and security

The API is authoritative for authentication, authorization and persisted entity operations. Authorization is capability-driven and combines platform/entity policy with row scope where required. Client presentation consumes projected capabilities but does not replace server enforcement.

Authentication supports local and configured external providers. Sensitive credentials are handled through trusted server-side commands and are not returned through ordinary entity CRUD contracts.

See [`docs/api/`](docs/api/) and [`docs/security/`](docs/security/).

## Storage

Storage is adapter-based. Metadata and entity semantics remain above the concrete storage implementation so the same application contracts can target supported storage families. Configuration tracks adapter capabilities and lifecycle/state independently of entity presentation.

Local development can use the configured in-memory, SQLite or other available adapter paths. Persistent binary content is treated as storage data and referenced by entities rather than embedded as UI-only state.

See [`docs/storage/`](docs/storage/).

## Platforms and applications

ManatOS separates company-level/system entities from platform/application composition. Applications, licenses and platform capabilities participate in the common metadata, authorization and entity infrastructure. `protoCRM` is an application/platform context built on ManatOS rather than a separate runtime architecture.

See [`docs/platforms/`](docs/platforms/) and [`docs/company/`](docs/company/).

## Diagnostics

Developer diagnostics include the CTX viewer, API Traffic inspection, request correlation and API/storage context information. Diagnostics observe canonical runtime state and request execution; they must not become competing owners of lifecycle or semantic state.

See [`docs/diagnostics/`](docs/diagnostics/).

## Development

The repository is an npm workspace. Use the Node.js version declared in `.nvmrc`, then install dependencies from the repository root.

Common commands:

```text
npm run dev
npm run build
npm run test
npm run verify
npm run verify-run
npm run format
npm run format:check
npm run reset:data
```

`npm run verify-run` is the normal full verification/startup gate used during development. Environment templates are provided under `api/.env.example` and `ui/.env.example`.

Detailed setup, coding principles, extension points and documentation rules are in [`docs/development/`](docs/development/).

## Documentation

[`docs/README.md`](docs/README.md) is the documentation map. Documentation is organized by subsystem/subject so each architectural fact has one detailed canonical home. The root README provides the system-level orientation; deeper documents own the detailed contracts and reference material.

Permanent documentation describes the system as it exists (and clearly identifies intended-but-not-yet-implemented direction where necessary). Patch history, migration checkpoints, baselines and delivery notes are not permanent system documentation.
