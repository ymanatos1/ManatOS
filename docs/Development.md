# Developer Guide

## Development model

The repository is an npm workspace. `api` and `ui` are independent applications and can be developed separately. `shared` contains only genuinely common contracts and runtime helpers.

```text
shared -> domain + BO metadata + AppError + OperationContext
api    -> REST + storage + services + Swagger
ui     -> EJS + sessions + external auth + generic CRUD
```

The UI uses the API over HTTP. It never reads `data/database.json` directly.

The metadata-driven UI and the shared expression engine are core platform infrastructure rather than SysUser-specific code. Canonical and UI metadata may contain expressions; server-side context construction compiles them to ASTs and the browser consumes the compiled representation with dependency-aware refresh. Do not add renderer special cases for one SysBO when the behavior can be represented as metadata or a generic evaluator rule. Treat these rules as universal across already-migrated and future entities: a common feature added while working on one SysBO must be checked against all registered metadata-driven SysBOs. Live entry state belongs in CTX (`entryOriginal` baseline, `entry` working record); collection-owning pages expose `entriesOriginal[]` and `entries[]`; calculated mutations use the same CTX setter/events as user changes. Canonical field calculations may opt into generic persistence with `calculation.persisted: true`; entity-specific service/UI hardcoding is not an acceptable substitute.

## Commands

```bash
npm run dev
npm run dev:api
npm run dev:ui
npm run build
npm run test
npm run verify
npm run verifyrun
npm run lint
npm run format:check
npm run quality:check
npm run format
npm run reset:data
```

### Verification and quality policy

`npm run verify` is the preferred full validation command before committing significant work. It runs the repository quality gate first (`npm run lint`, then `npm run format:check`), builds `shared`, `api` and `ui`, runs both automated test suites, and prints a compact final summary covering quality checks, builds, API/UI tests and total passed-test counts. Verification stops at the first failing stage, so later stages are reported as `NOT RUN` rather than masking the original failure.

`npm run verifyrun` performs that same complete quality/build/test verification and starts the normal development processes only when every stage passes. It is useful for the normal development/regression loop because a failed lint, formatting, build or test stage cannot accidentally start a stale runtime.

`npm run lint` and `npm run format:check` remain available as focused checks during development. `npm run quality:check` runs them in the same order as the quality portion of `verify`. Keep ESLint findings meaningful: fix the implementation when a rule exposes a genuine problem rather than weakening the rule or adding a cosmetic suppression. `format:check` is deliberately non-mutating; use `npm run format` when you intentionally want Prettier to rewrite supported files.

Source and documentation files use LF as their canonical repository line ending. `.editorconfig` guides editors and `.gitattributes` makes the Git representation platform-independent, so Windows development does not introduce CRLF-only diffs or repeated line-ending warnings.

## Package guide

### Shared/core development

- **TypeScript** — compile-time contracts, strict typing and adapter compatibility.
- **tsx** — executes/restarts TypeScript during development without a manual build loop.
- **dotenv** — loads local `.env` configuration.
- **zod** — runtime validation of environment/external input.
- **helmet** — defensive HTTP headers.
- **expression engine** (`shared/src/expressions`) — parser, typed AST, lexical CTX resolver, evaluator, built-in function registry and structured diagnostics used by canonical/UI metadata decisions.

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

Microsoft, Google, Facebook and GitHub provider definitions are code-defined/declarative, while the UI isolates unavoidable executable OAuth differences behind the shared `ui/src/auth/providers/` adapter registry. Admin-supplied Client ID/Client Secret pairs are stored by the API. Secrets are encrypted at rest. New or replacement credential pairs may be persisted securely without successful verification. They are marked `credentialsVerified=false` and remain unavailable to sign-in/registration until the stored pair successfully completes the real provider OAuth flow. Successful verification persists `credentialsVerified=true` together with `credentialsVerifiedAt`. The UI owns Passport/browser redirects; the API owns provider configuration and normalized external-identity persistence.

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

Swagger and Postman use the same responsibility order: **Server**, **Authentication**, **System Business Objects**, **System Business Objects (Aux)**, **System Configuration**, **Public UI**, **External Authentication**, **External Authentication Credentials**, then **Internal External Authentication Workflow**. The former untagged/default SysConfiguration operations are explicitly presented as **System Configuration**. Within the Aux Postman folder, reusable contacts are grouped by domain (email, telephone, postal address) and then split into canonical-value requests versus Principal-link requests; this mirrors the domain ownership boundary rather than flattening six supporting SysBOs into one long list.

Access remains operation-specific: public endpoints explicitly say so; Admin-only operations require an Admin Bearer token; trusted external-provider credential commands require both Admin Bearer authentication and `x-internal-api-key`; credential-test workflow endpoints are internal UI/BFF mechanics rather than routine client operations.

### Platform-owned UI code

Keep generic routers/templates platform-neutral. Platform catalogue metadata belongs under `shared/src/platforms/<platform>/`; platform-specific feature routes belong under `ui/src/platforms/<platform>/`, pages under `ui/views/pages/platforms/<platform>/`, assets under `ui/public/assets/platforms/<platform>/`, and platform-specific CSS under `ui/public/css/platforms/<platform>.css`. Register feature routers through `ui/src/platforms/routes.ts`; do not add protoCRM-specific branches to `page-routes.ts`, `sysbo-routes.ts` or the shell. The platform catalogue/presentation metadata should select platform assets/styles where practical.

The protoCRM Apps Playground has two related surfaces: `app-playground.ejs` is the platform-level Apps Playground landing/workspace; `application-playground.ejs` is the selected-`SysBOApplication` playground reached by `/bo/sys-applications/:id/play`. Both are protoCRM-owned and therefore live under the protoCRM platform folder.

## Expression/debugging regression expectations

Changes to the expression grammar, precedence, registered functions, CTX path resolution, field normalization, dynamic-value resolution, navigation/action policy, or Debugging CLI must include regression coverage. Numeric and semantic indexing of CTX collections are both contracts. The browser reactive evaluator must consume server-compiled ASTs and remain behaviorally aligned with the canonical evaluator; UI components must not hardcode registered normalization function names. Tests should protect the ownership split: CTX provides facts, metadata provides policy, the evaluator resolves it, and renderers must not add duplicate permission/entitlement gates.

### In-place metadata entry Save

For an existing metadata-driven record, the primary **Save** action uses the normal UI save route but requests an in-place JSON completion. The route persists through the same API/domain path, then returns the authoritative persisted record. The browser promotes its current form snapshot to the new baseline and reconciles `entry`/`entryOriginal` in CTX without replacing the document. **Save and Close** and first-save create flows retain navigation semantics. This behavior belongs to shared form infrastructure and must not be reimplemented per entity.

### Child-editor lifecycle contract

Reusable inline/collection editors must register through the generic child-editor DOM/event contract (`data-entry-child-editor` plus `manatos:child-editor-state`). Opening an editor sets the page's internal-editing state; Add/Update or child Cancel clears it. Parent Save controls must consume that state in addition to ordinary dirty/valid state. Do not add entity-specific Save guards for collections.

## Adding expression functions

Every registered expression function must document and declare the narrowest capability it requires (`pure`, `clock`, `ctx`, or `entityResolver`). Functions must remain entity-agnostic and must never import storage adapters directly. Persistence-backed behavior belongs behind `EntityResolver`; browser-owned formulas delegate only reached unavailable-capability calls and then resume locally. See [Expression Parsing and Evaluation Mechanics](Expression-Evaluation-Mechanics.md).

## API traffic diagnostics

`ui/src/debug/api-traffic-store.ts` is the development-only **UI-server** sanitized trace buffer for the ManatOS UI -> API boundary. `ApiClient` records requests centrally so entity routes and individual features must not implement their own traffic logging. This is intentionally different from the CTX Viewer: live CTX state is browser-owned and therefore has no corresponding UI-server trace store. Both visual tools are tabs of the one shell-owned Developer Tools dock; do not reintroduce independent CTX/API dock panels or an internal split divider. The traffic viewer is transport-generic; future expression/resolver diagnostics may enrich entries without coupling the panel to `TraverseEntity` or any particular SysBO.

The browser diagnostic poll must remain singleton-safe and sequential. Route-pattern show/hide choices may persist as user preferences, while route counters are scoped to the current UI-server boot. The shared connectivity watchdog owns consecutive transport-failure handling; after three sequential transport failures, automatic polls stop until explicit user refresh/navigation.

Never add raw authentication headers, cookies, tokens, credentials or secrets to developer traces. Sanitization must happen before a trace is stored, not only when it is rendered.
