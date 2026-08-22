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
npm run lint
npm run format
npm run reset:data
```

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
- **swagger-ui-express** — interactive API explorer at `/api/`.

OpenAPI is generated programmatically from the canonical BO metadata; no separate swagger-jsdoc dependency is required.

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

## Environment

Copy:

```text
api/.env.example -> api/.env
ui/.env.example  -> ui/.env
```

The `INTERNAL_API_KEY` values must match.

### Session idle timeout

```text
SESSION_IDLE_TIMEOUT_MINUTES=30
```

This is a rolling inactivity timeout. The value is intentionally specified in minutes for maintainability.

## Email development

`ConsoleEmailService` prints verification/reset URLs in the UI terminal. This lets a developer test all flows without SMTP.

## Google/Facebook

Provider buttons are included only when the related ID/secret values exist. External providers are a UI concern; the API merely stores normalized external-identity links.

## VS Code

Recommended extensions and workspace defaults live in `.vscode/`. They are recommendations, not a requirement to use VS Code.

## Commenting approach

Source comments explain **why**: security invariants, ownership, metadata contracts, persistence semantics, operation tracing and extension points. Trivial syntax is deliberately left uncommented.
