# Architecture

## Public shape

A reverse proxy can expose both processes as one site:

```text
/       -> UI process (3001)
/api/*  -> API process (3000)
```

Development runs them separately. The UI API base URL is configuration-driven, so moving either process later does not change page/business code.

## SysBO metadata

A BO definition key (`sys-users`, `sys-principals`, ...) is a stable hard-coded source identifier. Record IDs are unrelated storage-generated GUIDs.

Canonical field metadata is keyed by canonical property name for fast lookup. UI metadata is a second category layered on top only by UI clients.

## Company and platform composition

`CompanyInfo` owns Company-wide capabilities and a code-defined catalogue of enabled `SysPlatform` entries. The selected platform contributes its own SysBO capabilities and navigation entries on top of the Company baseline. The current implementation ships with mCRM, but horizontal navigation and platform landing pages are catalogue-driven so additional platforms do not require a separate shell design.

Each platform can provide branding/hero artwork, descriptive copy and capability cards. The UI exposes the current platform both through the top-header badge and the horizontal **Platform** entry.

## Runtime configuration

`SysConfiguration` stores typed/grouped application settings in the business datastore. Missing settings are seeded from code/environment defaults. Sensitive configuration values are encrypted through the existing secrets-encryption service and normal reads expose only a configured/not-configured projection. Root trust material (`SECRETS_ENCRYPTION_KEY`, `INTERNAL_API_KEY`, `SESSION_SECRET`) intentionally remains outside the datastore.

## Scope tree

Every EJS page gets `app.version`, `app.scopes`, `app.sysBO` and `app.navigation` through `res.locals`. The scope tree contains at least session, user, request and workspace; selecting Play on a SysApplication adds the selected application to workspace scope.

Scope state is runtime context, not business persistence.

## Security domains

- SysUser: website/security account.
- SysPrincipal: customer/commercial identity.
- SysUserPrincipal: bridge between them.
- SysLicense: owned by a principal for a SysApplication.

This avoids making customer type/hierarchy and website authentication the same concept.


## API response boundary

The HTTP layer applies a consistent envelope independently of business services:

```text
GET/query success       -> success + data
command success         -> success + message + data
failure                 -> success:false + message + error [+ optional data]
```

The root failure `message` mirrors `error.message`. Generic SysBO collection responses use `data.items` plus `data.paging`; metadata remains separate through `/$metadata` and optional `includeMetadata=true`.

## Server operations

Operational routes are grouped in `createServerRouter()` and remain outside `/api/v1` because they describe or manage the running API service rather than versioned business resources:

```text
GET  /health
GET  /ready
POST /flush-db
```

Health is liveness-oriented. Readiness evaluates required dependencies, currently the datastore. Database flush is authenticated/Admin-only and delegates to the storage adapter.

## Storage adapter boundary

The current `InMemoryDataStore` is an adapter rather than a business-service dependency on JSON. Its explicit `flush()` writes the current in-memory state to JSON. A future transactional database adapter can implement the same capability according to its engine, including reporting that no explicit flush is required when commits are already durable.
