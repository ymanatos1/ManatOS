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

The API exposes both layers independently through `/$metadata` and `/$metadata-ui`. List calls may request `includeMetadata=true` and/or `includeMetadataUI=true`; requesting UI metadata also includes canonical metadata so clients receive a coherent pair.

### Metadata-driven decisions and expression evaluation

Metadata can carry decisions as expressions rather than hard-coded renderer branches. Canonical `derivedFields` own reusable calculated business/display values, while UI metadata can make properties such as tab/action visibility, field editability and presentation decoration evaluator-backed. Derived fields are calculation-only by default; `persisted: true` opts a canonical derived value into generic pre-commit materialization. Persisted derived state remains metadata-driven rather than caller-driven, so direct API/background creation follows the same calculation as the UI.

Expression source is parsed by the shared engine into a typed AST when context metadata is materialized. The runtime evaluator resolves variables through the ManatOS CTX lexical scope. The metadata-driven browser renderer receives the AST and performs dependency-aware reevaluation without reparsing the expression source. This keeps one expression contract usable by EJS rendering, browser reactivity, diagnostics and future clients. Entry pages keep `dataOriginal` (immutable normalized baseline) and `dataCurrent` (live working record), while list pages expose a keyed `dataList` contextual collection. AST dependencies subscribe to CTX value changes, and calculated mutations re-enter the same CTX setter/event path as user mutations so cascades settle generically. `TraverseCtx(...)` is a registry function for reusable keyed-context hierarchy traversal; SysPrincipals use it to calculate persisted `rootPrincipalId`.

Delete behavior follows the same metadata-first principle: canonical relationships describe cascade/unlink/set-null/restrict semantics, the service builds a non-mutating `$delete-impact` plan, and the UI displays that plan before a destructive operation.

## Company and platform composition

`CompanyInfo` owns Company-wide capabilities and a code-defined catalogue of enabled `SysPlatform` entries. The selected platform contributes its own SysBO capabilities and navigation entries on top of the Company baseline. The current implementation ships with mCRM, but horizontal navigation and platform landing pages are catalogue-driven so additional platforms do not require a separate shell design.

Each platform can provide branding/hero artwork, descriptive copy and capability cards. The UI exposes the current platform both through the top-header badge and the horizontal **Platform** entry.

## Runtime configuration

`SysConfiguration` stores typed/grouped application settings in the business datastore. Missing settings are seeded from code/environment defaults. Sensitive configuration values are encrypted through the existing secrets-encryption service and normal reads expose only a configured/not-configured projection. Root trust material (`SECRETS_ENCRYPTION_KEY`, `INTERNAL_API_KEY`, `SESSION_SECRET`) intentionally remains outside the datastore.

## Runtime context and scope trees

Every rendered page receives a typed ManatOS `ctx` evaluation tree in addition to the older `app.scopes` shell/workspace structure. Root CTX order is intentionally:

```text
ctx
  system
    server
    client
  entities
  company
  user
    fields
    permissions
  page
```

`ctx.system` contains safe runtime/host facts, `ctx.entities` is the canonical metadata registry, `ctx.user.permissions` is the evaluator-visible authorization fact branch, and `ctx.page` contains the active lexical page chain. This makes UI decisions increasingly declarative without exposing server secrets.

The older `app.scopes` tree still carries session/request/workspace shell state; selecting Play on a SysApplication adds the selected application to workspace scope. Scope/CTX state is runtime context, not business persistence. A future consolidation can remove duplicated facts from `app.*` once all consumers read CTX consistently.

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

For platform-owned entities, authorization may also be license scoped. `SysApplication` belongs to mCRM: Admin has unrestricted access; non-Admin collection and record reads require a current effective mCRM `SysLicense` reached through a linked `SysPrincipal`, and an optional `applicationId` restriction narrows visibility to that application. The current in-memory adapter filters materialized rows before client filtering/paging; future RDBMS adapters should push the same predicate into the database query.
4. **System Configuration** — Admin-only persisted runtime configuration; sensitive values are never returned as plaintext.
5. **Public UI** — anonymous-safe bootstrap/runtime projections used before sign-in.
6. **External Authentication** — Admin provider configuration and supported-provider metadata.
7. **External Authentication Credentials** — trusted Admin/BFF secret lifecycle; requires Admin Bearer authentication plus `x-internal-api-key`.
8. **Internal External Authentication Workflow** — UI/BFF-only OAuth credential-test mechanics, not a general client API.

The ordering is presentation-only: it does not collapse domain boundaries or weaken authorization rules.
