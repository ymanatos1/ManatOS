# ManatOS

ManatOS is a metadata-driven application platform built with Node.js and TypeScript. The repository contains the shared domain/runtime contracts, the HTTP API, the server-rendered web UI, developer tooling, documentation, deployment material, and API test collections used to develop and operate the platform.

The current product includes the **protoCRM** application and a reusable system layer for metadata-driven entities/business objects, CTX-based UI/runtime state, expressions and reactive evaluation, authentication, hierarchy workspaces, reusable field/components, storage adapters, administration, and developer diagnostics.

## Repository layout

| Path       | Purpose                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/`  | Types, contracts, metadata definitions, expression infrastructure, and code shared by API and UI.                                                 |
| `api/`     | Express API, authentication/authorization, entity/system-BO services, storage adapters, OpenAPI generation, and server-side runtime services.     |
| `ui/`      | Express-hosted web UI, EJS presentation, browser runtimes, metadata-driven entity surfaces, field components, CTX/debugger tooling, and UI tests. |
| `docs/`    | Permanent architecture, design, development, usage, and reference documentation.                                                                  |
| `postman/` | Postman collections/environments for exercising the API.                                                                                          |
| `scripts/` | Repository development, verification, reset, and maintenance scripts.                                                                             |
| `deploy/`  | Deployment-related files.                                                                                                                         |
| `data/`    | Local runtime/bootstrap data. This directory is intentionally excluded from Git.                                                                  |

For a more detailed source map, see [`docs/development/Repository-Structure.md`](docs/development/Repository-Structure.md).

## Technology

The repository is an npm-workspaces monorepo targeting **Node.js 24** (see `.nvmrc`) and TypeScript. The principal runtime areas are:

- **Shared** — canonical contracts and cross-process metadata/expression infrastructure.
- **API** — Express-based HTTP API, current system-entity endpoints, authentication, storage and infrastructure services.
- **UI** — Express/EJS application with browser-side metadata-driven runtimes and reusable UI components.

The UI and API are deliberately separate processes. Runtime caches and process-local services remain process-local rather than being transferred between them.

## Getting started

### Prerequisites

- Node.js version specified by `.nvmrc`.
- npm with workspace support.
- Any external database/runtime prerequisites required by the storage adapter you intend to test.

Install dependencies from the repository root:

```powershell
npm install
```

Run the development processes:

```powershell
npm run dev
```

Or run individual workspaces:

```powershell
npm run dev:api
npm run dev:ui
```

See [`docs/development/Getting-Started.md`](docs/development/Getting-Started.md) and [`docs/development/Building-and-Running.md`](docs/development/Building-and-Running.md) for the complete setup and runtime workflow.

## Build, quality and tests

Common repository commands include:

```powershell
npm run lint
npm run format
npm run format:check
npm run build
npm run test
npm run verify
```

The repository verification scripts under `scripts/` combine the appropriate quality, build, and test stages for local development. The authoritative project testing guidance is documented in [`docs/development/Testing.md`](docs/development/Testing.md).

## Architecture at a glance

### Metadata-driven business objects

System and application entities are described through metadata rather than page-specific implementations wherever the behavior is reusable. Lists, entry forms, tabs, fields, validation, relationships, calculated values, selectors, related records, and actions are driven by the common metadata/runtime infrastructure.

Start with:

- [`docs/architecture/Metadata-Architecture.md`](docs/architecture/Metadata-Architecture.md)
- [`docs/design/Metadata-Model.md`](docs/design/Metadata-Model.md)
- [`docs/design/Entity-Model.md`](docs/design/Entity-Model.md)

### CTX runtime

CTX is the observable semantic context model used by UI surfaces and expression evaluation. Page/surface state, canonical field values, dependencies, reactive recalculation, and debugger visibility are modeled around CTX rather than ad-hoc DOM state.

Start with:

- [`docs/architecture/Context-Architecture.md`](docs/architecture/Context-Architecture.md)
- [`docs/design/Context-Model.md`](docs/design/Context-Model.md)
- [`docs/design/State-Mutation-and-Events.md`](docs/design/State-Mutation-and-Events.md)
- [`docs/reference/CTX-Catalog.md`](docs/reference/CTX-Catalog.md)

### Expressions and reactivity

Expressions are parsed/evaluated through the shared expression architecture and participate in CTX-observable dependency/reactivity semantics. Declarative expressions are preferred for side-effect-free decisions based on observable state.

See [`docs/architecture/Expression-Architecture.md`](docs/architecture/Expression-Architecture.md) and [`docs/design/Expressions.md`](docs/design/Expressions.md).

### Storage

Storage is adapter-based. The platform separates the active datastore from administrative preparation of prospective targets so an administrator can configure, validate, and prepare another target without changing the datastore serving the current API process.

Relational adapters are organized by deployment model:

```text
Relational
├─ Server RDBMS
│  ├─ SQL Server
│  ├─ MariaDB
│  └─ PostgreSQL
└─ Embedded RDBMS
   └─ SQLite
```

The default local JSON adapter remains available for local/bootstrap operation. Storage configuration is managed from **System settings** and becomes active according to the runtime/restart semantics described by the administration UI and storage documentation.

See [`docs/architecture/Data-and-Storage-Architecture.md`](docs/architecture/Data-and-Storage-Architecture.md) and [`docs/development/Storage-Adapters.md`](docs/development/Storage-Adapters.md).

## Development principles

When extending ManatOS, prefer reusable metadata/runtime infrastructure over entity-specific behavior. Changes to common behavior should be implemented at the appropriate shared layer and protected by regression/contract coverage so existing and future entities remain consistent.

Important development references:

- [`docs/architecture/Architectural-Principles.md`](docs/architecture/Architectural-Principles.md)
- [`docs/development/Coding-Principles.md`](docs/development/Coding-Principles.md)
- [`docs/development/Extension-Points.md`](docs/development/Extension-Points.md)
- [`docs/development/Security-Guidelines.md`](docs/development/Security-Guidelines.md)

## Documentation

The permanent documentation is organized by audience and purpose:

- [`docs/README.md`](docs/README.md) — documentation entry point.
- [`docs/Documentation-Map.md`](docs/Documentation-Map.md) — map of the documentation set.
- [`docs/architecture/`](docs/architecture/) — system architecture and architectural contracts.
- [`docs/design/`](docs/design/) — detailed design of CTX, entities, fields, components, relationships, popups, validation, and UI flows.
- [`docs/development/`](docs/development/) — setup, repository structure, extension guides, testing, tooling, and storage adapters.
- [`docs/reference/`](docs/reference/) — catalogs and developer reference material.
- [`docs/usage/`](docs/usage/) — user/administrator operating guides.
- [`docs/apps-design/`](docs/apps-design/) — platform/application design guidance.

Documentation in the repository describes the **current ManatOS architecture and behavior**. Patch notes, one-time migration instructions, and transient delivery information do not belong in the project README or permanent documentation tree.

## Local-only files

The repository intentionally ignores local runtime data and local ZIP helper utilities. They may exist in a developer working tree without being committed to Git:

- `data/`
- `ZIP_*.cmd`
- generated verification logs and other ignored runtime output

Do not delete local-only files merely because they are Git-ignored; ignoring them prevents publication to the repository while preserving their local purpose.
