# Developer Guide

## Development model

The repository is an npm workspace. `api` and `ui` are independent applications and can be developed separately. `shared` contains only genuinely common contracts and runtime helpers.

```text
shared -> domain + BO metadata + AppError + OperationContext
api    -> REST + storage + services + Swagger
ui     -> EJS + sessions + external auth + generic CRUD
```

The UI uses the API over HTTP. It never reads `data/database.json` directly.

## Commands

```bash
npm run dev
npm run dev:api
npm run dev:ui
npm run build
npm run test
npm run verify
npm run lint
npm run format
npm run reset:data
```

### Verification and lint policy

`npm run verify` is the preferred full validation command before committing significant work. It builds `shared`, `api` and `ui`, runs both automated test suites, and prints a compact final summary with API, UI and total passed-test counts. A failed build or test step makes verification fail and identifies the failed stage.

`npm run lint` remains deliberately separate. ESLint is a development diagnostic, not a target to satisfy by suppression. Fix findings when they expose a genuine code-quality improvement. If an intentional construct is currently preferable and no rational improvement is at hand, keep the finding visible (and, where useful, leave a future-improvement comment) rather than weakening the rule or adding a cosmetic bypass.

## Package guide

### Shared/core development

- **TypeScript** — compile-time contracts, strict typing and adapter compatibility.
- **tsx** — executes/restarts TypeScript during development without a manual build loop.
- **dotenv** — loads local `.env` configuration.
- **zod** — runtime validation of environment/external input.
- **helmet** — defensive HTTP headers.

### API

- **express** — Express 5 HTTP server, middleware and REST routing.
- **argon2** — Argon2id password hashing/verification.
- **swagger-ui-express** — interactive API explorer at `/api-docs/`.

OpenAPI is generated programmatically from the canonical BO metadata; no separate swagger-jsdoc dependency is required. The raw specification is available at `/api/openapi.json`.

### UI

- **express** — separate UI HTTP process.
- **ejs** — server-side HTML templates.
- **bootstrap** — responsive layout, forms, modals, dropdowns and tables.
- **bootstrap-icons** — consistent icons for user/SysPrincipal, applications, actions, warnings, etc.
- **express-session** — server-side browser session state. Sessions never enter business JSON.
- **http-errors** — basic UI HTTP/navigation errors that deserve full error pages.
- **passport** — external-provider protocol mechanics only.
- **passport-google-oauth20** — Google browser registration/sign-in.
- **passport-facebook** — Facebook browser registration/sign-in.

### Testing

- **vitest** — unit/integration test runner.
- **supertest** — calls Express applications without opening a TCP port.
- **cheerio** — parses rendered HTML for structural UI assertions.

### Quality/tooling

- **ESLint / typescript-eslint** — static code-quality checks.
- **Prettier** — formatting only; eliminates formatting debates.
- **concurrently** — runs shared/API/UI watchers together for a full-stack developer.
- **EditorConfig** — consistent line endings/indentation across Windows, Linux and macOS.

Playwright, Husky/lint-staged and Testcontainers are intentionally deferred until they provide immediate value.

## Environment and runtime configuration

Copy:

```text
api/.env.example -> api/.env
ui/.env.example  -> ui/.env
```

The `INTERNAL_API_KEY` values must match.

Environment files now form the **bootstrap/default layer**, not the only application-configuration source. Admin-maintainable runtime settings are represented by persisted `SysConfiguration` records. Missing records are seeded from environment/default values on API startup. Sensitive settings such as `SMTP_PASSWORD` are encrypted before persistence; root trust secrets (`SECRETS_ENCRYPTION_KEY`, `INTERNAL_API_KEY`, `SESSION_SECRET`) stay outside the datastore.

### Session idle timeout

```text
SESSION_IDLE_TIMEOUT_MINUTES=30
```

This is a rolling inactivity timeout. The value is intentionally specified in minutes for maintainability.

## Email development

`ConsoleEmailService` prints verification/reset URLs in the UI terminal. This lets a developer test all flows without SMTP.

## External authentication providers

Microsoft, Google, Facebook and GitHub provider definitions are code-defined, while Admin-supplied Client ID/Client Secret pairs are stored by the API. Secrets are encrypted at rest. New or replacement credential pairs may be persisted securely without successful verification. They are marked `credentialsVerified=false` and remain unavailable to sign-in/registration until the stored pair successfully completes the real provider OAuth flow. Successful verification persists `credentialsVerified=true` together with `credentialsVerifiedAt`. The UI owns Passport/browser redirects; the API owns provider configuration and normalized external-identity persistence.

For API consumers, keep the surface mentally separated into **Admin provider configuration**, **trusted Admin/BFF credential management**, **internal UI verification workflow**, and the **public runtime provider projection**. The Swagger descriptions state the required access for each operation. Endpoints requiring `x-internal-api-key` are server-to-server/BFF operations and are not intended for browser or third-party clients; where bearer authentication is also required, the bearer subject must be an Admin.

## VS Code

Recommended extensions and workspace defaults live in `.vscode/`. They are recommendations, not a requirement to use VS Code.

## Commenting approach

Source comments explain **why**: security invariants, ownership, metadata contracts, persistence semantics, operation tracing and extension points. Trivial syntax is deliberately left uncommented.


## API response convention

The REST API uses one global response-envelope rule:

- successful GET/query operations return `success + data`;
- successful command operations (`POST`, `PUT`, `PATCH`, `DELETE`) return `success + message + data`;
- failures return `success: false` plus a root `message` and an `error` object. The root message mirrors `error.message` so clients have one predictable user-facing message location.

Generic SysBO list responses place the collection in `data.items` and pagination information in `data.paging`. BO metadata is available through `GET /$metadata` or can be included in a list with `?includeMetadata=true`.

## Server operational endpoints

Server-level endpoints are grouped separately from versioned business resources:

```text
GET  /health
GET  /ready
POST /flush-db
```

`/health` is a public liveness check. `/ready` is a public readiness check and currently verifies the active datastore. `/flush-db` requires an authenticated Admin and delegates persistence semantics to the active storage adapter.

## Automated API testing

The API test suite is intentionally split by architectural concern:

```text
api/test/test-helpers.ts
api/test/storage.contract.test.ts
api/test/api.integration.test.ts
api/test/api.auth.integration.test.ts
```

`storage.contract.test.ts` exercises persistence behavior intended to remain stable across future datastore adapters. `api.integration.test.ts` uses `SysApplication` as the representative generic SysBO instead of repeating identical CRUD tests for every resource. `api.auth.integration.test.ts` concentrates the security-sensitive registration, login, password and multi-session flows.

Each integration test constructs the real Express application with a temporary in-memory datastore and temporary JSON persistence file; it does not require a listening server and never touches the development database.

See `docs/Testing.md` for the coverage policy and detailed test responsibilities.

## API presentation and access groups

Swagger and Postman use the same responsibility order: **Server**, **Authentication**, **System Business Objects**, **System Configuration**, **Public UI**, **External Authentication**, **External Authentication Credentials**, then **Internal External Authentication Workflow**. The former untagged/default SysConfiguration operations are explicitly presented as **System Configuration**.

Access remains operation-specific: public endpoints explicitly say so; Admin-only operations require an Admin Bearer token; trusted external-provider credential commands require both Admin Bearer authentication and `x-internal-api-key`; credential-test workflow endpoints are internal UI/BFF mechanics rather than routine client operations.
