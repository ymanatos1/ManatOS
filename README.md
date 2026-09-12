# ManatOS

ManatOS is a metadata-driven multi-platform application foundation built as an npm workspace. The repository contains a shared semantic layer, an Express API, and a server-rendered/browser UI runtime. `protoCRM` is the current concrete platform built on that foundation.

## Repository

```text
shared/   shared domain, metadata, CTX, expression and policy contracts
api/      REST API, authentication/authorization, services and persistence
ui/       server-rendered host, browser CTX/runtime, metadata-driven UI and developer tools
docs/     architecture, design, development, usage and reference documentation
postman/  maintained API collection and local environment
diagrams/ architecture diagrams and generated reference PDFs
data/     local development persistence
```

The API is authoritative for protected business operations and persisted data. The browser is authoritative for interactive UI state. Metadata and the shared expression language connect those boundaries without creating a second business-state authority in the UI.

## Start here

For a technical overview, begin with [docs/README.md](docs/README.md) and [docs/System-Map.md](docs/System-Map.md). Contributors should continue with [docs/development/Getting-Started.md](docs/development/Getting-Started.md) and [docs/development/Repository-Structure.md](docs/development/Repository-Structure.md).

The running Swagger UI/OpenAPI document is the executable endpoint reference. The maintained Postman collection under `postman/` follows the same API contracts for interactive testing.

## Development

```bash
npm install
npm run dev
```

Primary validation commands:

```bash
npm run verify
npm run verifyrun
npm run lint
npm run format:check
```

`npm run verify` performs the repository quality, build and automated-test gate. `npm run verifyrun` performs the same verification and starts the normal development processes only after the complete gate passes.

Local environment templates are provided in `api/.env.example` and `ui/.env.example`. See [Getting Started for Developers](docs/development/Getting-Started.md) for setup, runtime boundaries and development conventions.

## Documentation contract

Repository documentation describes the current product and architecture, not patch history or migration diaries. Architectural decisions, CTX ownership, metadata behavior, UI runtime contracts, security boundaries and extension rules are maintained under `docs/`.
