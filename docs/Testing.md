# Testing

The test suite is intentionally layered. The goal is strong coverage of architectural contracts and security-sensitive behavior without duplicating every endpoint permutation.

## API test stack

- **Vitest** is the test runner and assertion library.
- **Supertest** executes the real Express application without opening a TCP port.
- Every integration test uses a temporary `InMemoryDataStore` and a unique temporary JSON file.
- Tests never read or overwrite the development `data/database.json`.
- External Google/Facebook providers are not live CI dependencies; provider adapters should be faked when those flows are added to automated tests.

## Test layout

```text
api/
  test/
    test-helpers.ts
    storage.contract.test.ts
    api.integration.test.ts
    api.auth.integration.test.ts
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

## Running tests

From the repository root:

```bash
npm run test
```

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

- reusable datastore-contract runner for SQLite/MySQL adapters;
- license/relationship authorization scenarios;
- email verification/reset token one-time/expiry behavior;
- external-identity linking with fake providers;
- operation-trace pruning/masking tests;
- readiness failure tests using a deliberately unhealthy adapter;
- UI Supertest + Cheerio tests;
- a small Playwright E2E suite for only the most important browser workflows.
