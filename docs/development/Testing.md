# Testing and Verification

Verification is organized by ownership boundary, not solely by feature screen. Tests establish semantic invariants independently of the UI technology, then exercise adapter and host integrations where the boundary makes behavior observable.

## Test architecture

```text
shared/test/              metadata · context · expression language · domain
api/test/                 authorization · HTTP · auth · storage · integration
shared.UI/test/           UIS surfaces · components · Lists/Entries · Flows
shared.UI.NG/test/        Angular adapter integration
shared.UI.EJS/test/       EJS adapter integration
ui.EJS0/test/             established EJS routes, behavior and rendering
ui.NG1/test/              Angular shell and Node host
ui.EJS1/test/             EJS host integration
```

The repository uses **Vitest** as its TypeScript test runner. API and host integration tests use HTTP-level request testing where appropriate; presentation tests can inspect rendered markup or component behavior. Source-code checks and browser acceptance serve different purposes.

The exact test filenames are defined by each workspace, not by an earlier flat naming convention. Examples in the inspected source include:

- `shared/test/expression-async.test.ts` and `shared/test/runtime-context.test.ts`;
- `api/test/auth/authorization-service.test.ts`, `api/test/auth/native-oauth.test.ts` and `api/test/storage/storage.contract.test.ts`;
- `api/test/integration/entity-authorization-matrix.integration.test.ts` and `api/test/integration/explicit-transaction.integration.test.ts`;
- `ui.EJS0/test/metadata/ui-view-presentation.test.ts` and `ui.EJS0/test/presentation/documentation-browser-presentation.test.ts`.

## Behavioral invariants

**Metadata and expressions:** Parser grammar, typed evaluation, strict versus optional CTX traversal, resolver scope, authorization capabilities, defaults, enum resolution and calculated fields.

**CTX and UIS:** Surface ownership, one active child per parent, namespace initialization, identity-checked disposal, field actions, stale response handling, change tracking, nested selectors and consistency between semantic state and rendering adapters.

**API and security:** Authentication/session lifecycle, safe external identities, privilege enforcement on the server, record-scoped rules, read/write distinctions, protected configuration, Native OAuth attempt state and replay resistance.

**Storage and persistence:** Reference/uniqueness rules, transactional commit, draft identities, derived fields and provider-neutral behavioral semantics. The tests of a desired relational schema do not by themselves prove that a relational adapter is live.

**Presentation:** Accessible text, language changes, focus and popup lifetimes, localization, controls, responsive behavior and Documentation Viewer navigation. Unit tests cannot replace actual browser inspection for overlays, sizing and focus.

## Verification commands

```sh
npm run build
npm run test
npm run verify
npm run verify-run
```

The authoritative root scripts are defined in `package.json`. `npm run verify-run` is the *hyphenated* command. `npm run quality:check` performs lint and format checks without changing source.

## Evidence and limits

Passing tests supports only the contracts those tests actually exercise. In particular, a registered license `rules` field does not prove license-entitlement evaluation; an available adapter descriptor does not prove successful database operation; and a generated native OAuth response does not prove a live external-provider deployment. Keep assertions tied to actual test evidence and API enforcement.

See [Security Architecture](../security/Security-Architecture.md), [Expression Architecture](../expressions/Expression-Architecture.md) and [UIS Components](../clients/UIS-Component-Contracts.md).
