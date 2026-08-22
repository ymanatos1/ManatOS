# Testing

## API

Vitest unit tests should cover services, validation and metadata rules. Supertest integration tests exercise route -> service -> data store -> persistence -> response without listening on a real port.

The storage contract test is intentionally reusable: future PostgreSQL/SQL Server/etc. adapters should pass the same CRUD, uniqueness, transaction and relationship behavior.

## UI

Recommended progression:

1. unit tests for navigation/scope/auth helpers;
2. Supertest + Cheerio tests for rendered EJS/forms;
3. a small Playwright E2E suite later.

Live Google/Facebook should not be a normal CI dependency; fake provider adapters should exercise account-linking rules.

High-value cases include duplicate user-name/email, GUID creation, password policy, password never returned, Guest registration, Guest->User promotion, session idle expiry, reset token expiry/one-time use, operation-trace pruning/masking, sorting/filtering/pagination and dirty-form behavior.
