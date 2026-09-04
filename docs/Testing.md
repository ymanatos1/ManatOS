# Testing

The test suite is intentionally layered. The goal is strong coverage of architectural contracts and security-sensitive behavior without duplicating every endpoint permutation.

## Test stack

- **Vitest** is the test runner and assertion library for both API and UI workspaces.
- **Supertest** executes the real Express application without opening a TCP port.
- Every integration test uses a temporary `InMemoryDataStore` and a unique temporary JSON file.
- Tests never read or overwrite the development `data/database.json`.
- Real Microsoft/Google/Facebook/GitHub services are not live CI dependencies. Deterministic provider configuration/credential-state rules are tested locally, while browser/provider protocol flows should use fake adapters in automated coverage.

## Test layout

```text
api/
  test/
    test-helpers.ts
    storage.contract.test.ts
    api.integration.test.ts
    api.auth.integration.test.ts
    ext-auth-provider.integration.test.ts
    sys-configuration.integration.test.ts
```

### `test-helpers.ts`

Contains only reusable test infrastructure:

- isolated API/datastore construction;
- standard Admin bootstrap and login;
- Bearer-header helper;
- assertions for the global response-envelope convention.

Keeping these helpers out of the test cases makes each test read as a behavior specification rather than setup plumbing.

### `storage.contract.test.ts`

Tests datastore behavior that future adapters should preserve:

1. GUID generation and server-owned audit fields;
2. case-insensitive metadata-defined uniqueness;
3. filtering, sorting and pagination;
4. runtime protection of technical audit fields;
5. explicit `flush()` persistence semantics.

The storage contract is deliberately adapter-oriented. When SQLite, MySQL, PostgreSQL or SQL Server adapters are added, the same behavioral suite should be made reusable against each adapter. Adapter-specific tests may be added for engine-specific concerns such as migrations, connection pooling or SQLite checkpoint behavior.

### `api.integration.test.ts`

Covers representative end-to-end API behavior without exhaustively repeating identical generic CRUD tests for every SysBO:

- public `/health` and `/ready`;
- Admin-only `/flush-db`;
- authentication requirement for protected SysBO routes;
- Guest read access versus blocked generic creation;
- SysApplication metadata + representative CRUD;
- audit-field tampering protection;
- list filtering, sorting, pagination and `includeMetadata=true`;
- OpenAPI path smoke checks;
- global 404/failure response envelope.

`SysApplication` is used as the representative generic SysBO because all four generic resources share the same `createSysBORouter()` implementation. Domain-specific behavior should be tested in its own service/integration tests rather than copying the same CRUD assertions four times.

### `api.auth.integration.test.ts`

Covers the security-sensitive public authentication contract:

- Guest-only registration;
- password hash never returned;
- case-insensitive duplicate user-name/email handling;
- verified-email requirement;
- login by user-name and by email;
- multiple concurrent API sessions;
- session client-name tracking;
- current-session logout;
- logout-all;
- revoked-token behavior;
- password change and subsequent login behavior.

### External-provider and configuration integration tests

`ext-auth-provider.integration.test.ts` protects the complete credential lifecycle: secure storage of unverified pairs, persisted application-managed verification state, pairwise Client ID/secret replacement, encrypted secret storage, unrelated edits preserving credentials and verification state, atomic credential removal, callback-path ownership and public/runtime exposure only after verification.

`sys-configuration.integration.test.ts` protects Admin-only configuration updates, typed values and the rule that encrypted secret material is never returned through normal API projections.

## UI test coverage

The UI suite is a first-class part of normal verification. It combines deterministic TypeScript tests, EJS/Cheerio presentation tests and Supertest route/integration tests. It covers authentication, session handling, external-provider presentation, configuration pages, operation/error presentation and generic SysBO UI behavior.

Current generic-SysBO coverage also protects the metadata-driven renderer migration: canonical + UI metadata loading, evaluator-backed properties, CTX-path dependency/cascading calculated-field reactivity, `entryOriginal`/`entry` form state, reversible dirty/valid Save state, initial editable-field focus, all-readonly tab presentation, CTX-driven breadcrumbs/components, development-only calculated-expression diagnostics, relationship-aware delete confirmations, persisted canonical derived fields, SysUser own-record access rules and evaluator-backed navigation. Phase A/B1 coverage additionally protects generic dynamic values, platform capability facts, nested CTX field-node access (`permissions.create`), entry-action `visible/enabled/disabledReason`, list Add decisions, and the absence of duplicate renderer-side permission gates. These are engine contracts and must stay entity/field agnostic wherever possible; shared conventions are checked across all registered metadata-driven entities to prevent migration drift.

Developer-tool presentation tests protect the one-dock/two-tab architecture, exact CTX formula/value inspection targets, API Traffic route filtering/bypass toggle/counters and sequential polling. Connectivity tests protect the rule that HTTP errors are responses (not connection failures), while three consecutive transport failures stop polling and surface the local System unavailable workspace.

These tests deliberately stop short of pretending to be a real browser. Playwright remains the planned complementary layer for a small number of high-value end-to-end browser workflows.

Aggregate workspace coverage also verifies the atomic Commit contract: temporary `draft:*` identities are mapped to persisted ids, same-entity draft references are rewritten before persistence, owner baselines drive update/delete detection, and the resulting persisted derived hierarchy fields settle inside the same transaction. UI presentation tests separately protect browser-only Close/draft-checkpoint behavior and ensure `recordQuick`/owner child edits do not cross the API boundary.

## Global API response contract

Tests use common assertions for the API envelope.

Successful GET/query:

```json
{
  "success": true,
  "data": {}
}
```

There is no root success `message`.

Successful command (`POST`, `PUT`, `PATCH`, `DELETE`):

```json
{
  "success": true,
  "message": "Human-readable confirmation.",
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "message": "User-safe message.",
  "error": {
    "code": "ERROR_CODE",
    "message": "User-safe message.",
    "retryable": false
  }
}
```

The root failure `message` must mirror `error.message`.

## Coverage philosophy

Prefer one strong test at the correct abstraction boundary over several nearly identical tests.

High-value invariants include:

- authentication and authorization boundaries;
- unique business keys;
- passwords never returned in API output;
- audit fields controlled by the server;
- transaction/rollback behavior;
- storage adapter contract;
- query filtering/sorting/pagination;
- response-envelope consistency;
- session creation/revocation;
- readiness and persistence behavior.

Avoid excessive tests for:

- framework internals already covered by Express/Vitest;
- identical CRUD permutations for every SysBO when they use the same generic router;
- exact timestamp values;
- implementation-private Maps or token hashes;
- live third-party identity-provider availability.

## Running tests and verification

Run both API and UI test suites from the repository root:

```bash
npm run test
```

For the preferred full pre-commit validation pass:

```bash
npm run verify
```

`npm run verify` builds `shared`, `api` and `ui`, runs both test suites, and finishes with a compact PASS/FAIL summary containing API, UI and total test counts. `npm run lint` remains separate and is used as a code-quality diagnostic rather than a target to satisfy by suppression.

`npm run verifyrun` first performs that same verification and starts ManatOS only if it passes.

For the API workspace only, if the workspace package exposes the normal test script:

```bash
npm run test --workspace api
```

Useful during focused development:

```bash
npm run test --workspace api -- storage.contract
npm run test --workspace api -- api.integration
npm run test --workspace api -- api.auth.integration
```

The exact Vitest filter syntax can also be used directly through the API workspace script if desired.

## Future additions

Add tests when the corresponding functionality becomes real rather than pre-building a large speculative suite. Likely next additions are:

- reusable datastore-contract execution against future SQL adapters;
- license/relationship authorization scenarios;
- broader external-identity/provider browser flows using fake provider adapters;
- operation-trace pruning/masking tests;
- readiness failure tests using a deliberately unhealthy adapter;
- a small Playwright E2E suite for only the most important browser workflows.


Platform organization has a presentation contract test (`platform-feature-organization.test.ts`) that prevents protoCRM playground handlers from drifting back into generic page/SysBO routers and verifies the platform-owned view/style paths. External-provider adapter coverage requires every canonical provider key to have exactly one executable adapter used by both live sign-in and credential testing.

Entry-representation contract tests cover canonical name/type sources, formula-driven names with lazy derived-field dependencies, relationship expressions through `relations.<relationshipKey>`, enum/reference type icons, and the separation between entity/page icons and entry-instance icons.

## Hierarchy selection/list reuse contracts

Hierarchy workspace regression coverage verifies that the existing-entry picker reuses the canonical metadata-driven list toolbar, filters, table header and paging partials; publishes its transient runtime under the owner page `selections` branch; keeps persisted-entry baselines in `entriesOriginal[]`; filters existing-node candidates by metadata-valid relationship rules; and requires Commit confirmation before the aggregate persistence request is issued.
