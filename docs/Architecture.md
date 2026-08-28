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

### Persisted application-managed fields

Field metadata can mark a property `readOnly: true` and `applicationManaged: true`. Such a field is genuine persisted business state, but normal generic Admin CRUD must not accept client-supplied changes to it. Application/service commands own its transitions.

`SysExtAuthProvider.credentialsVerified` is the first example. It is persisted and queryable, while only the credential-verification lifecycle may change it. This differs from a generated field, whose value is derived only when a response/view is produced and is not stored.

### External-authentication API layering

External authentication deliberately keeps its rich internal lifecycle while exposing a simpler conceptual API:

1. **Provider configuration** — Admin-only SysBO configuration and provider definitions.
2. **Credential management** — trusted Admin/BFF commands for encrypted credential storage/removal.
3. **Verification workflow** — internal UI/BFF OAuth-test mechanics; not a general client contract.
4. **Runtime projection** — anonymous-safe provider availability used by sign-in/registration.

This is a presentation/ownership boundary, not a reduction of domain behavior. It keeps secret handling and verification invariants intact while making Swagger, Postman and documentation easier to understand.

## API presentation order

Swagger, Postman and the developer documentation present API responsibilities in one consistent top-to-bottom order:

1. **Server** — liveness/readiness are public; datastore flush is Admin-only.
2. **Authentication** — registration, sign-in, sessions and related trusted authentication commands; access is documented per operation.
3. **System Business Objects** — metadata-driven SysBO resources; authorization depends on the BO and operation.
4. **System Configuration** — Admin-only persisted runtime configuration; sensitive values are never returned as plaintext.
5. **Public UI** — anonymous-safe bootstrap/runtime projections used before sign-in.
6. **External Authentication** — Admin provider configuration and supported-provider metadata.
7. **External Authentication Credentials** — trusted Admin/BFF secret lifecycle; requires Admin Bearer authentication plus `x-internal-api-key`.
8. **Internal External Authentication Workflow** — UI/BFF-only OAuth credential-test mechanics, not a general client API.

The ordering is presentation-only: it does not collapse domain boundaries or weaken authorization rules.
