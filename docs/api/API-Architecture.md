# API Architecture

## Purpose and authority

The API is the authoritative boundary for protected business data, business operations and security-sensitive decisions. The UI may help a user understand what actions appear available, but the API independently authenticates and authorizes every protected operation.

The API is not merely a persistence façade. It coordinates HTTP contracts, authentication, authorization, application services, metadata, relationships, storage, audit/configuration and diagnostics.

## Layering

The normal request path is conceptually:

```text
HTTP request
   |
   v
middleware / request context
   |
   v
route / transport adapter
   |
   v
application service / named command
   |
   +--> authorization/policy
   +--> metadata/relationship rules
   +--> expressions/calculations
   +--> storage
   |
   v
standard response envelope
```

Responsibilities are deliberately separated:

- **middleware** establishes transport/security/request context;
- **routes** adapt HTTP input/output and select application operations;
- **services** own reusable application/business operations;
- **authorization** owns authoritative permission decisions;
- **metadata/relationship infrastructure** owns canonical entity semantics;
- **storage** owns persistence mechanics and adapter strategy;
- **operation/CTX diagnostics** record semantic/runtime execution context.

A route should not become a second service layer, and a storage adapter should not become the owner of business policy.

## Generic entity API

Metadata-driven entities use a reusable entity HTTP contract for common operations such as:

- canonical metadata;
- UI metadata projection;
- collection query/list;
- record read;
- create/update/delete where authorized;
- collection/record capability projection;
- picture-field transport;
- relationship-aware generic behavior.

The current system-owned entities use the `SysBO` naming convention, but the generic entity infrastructure beneath those routes is not conceptually limited to future SysBO-prefixed objects. Application-defined entities are expected to reuse the same entity infrastructure without becoming system objects merely because they use it.

## Explicit commands

Not every operation should be expressed as generic CRUD. Named protected commands are preferable when an operation has semantics that deserve an explicit boundary, for example:

- authentication/session commands;
- password/credential operations;
- verification operations;
- configuration commands;
- storage target preparation;
- relationship/aggregate workflows whose transaction semantics are broader than a scalar record update.

A named command makes security, validation, auditing and transaction intent visible instead of hiding it inside a generic PATCH convention.

## Metadata endpoints

Canonical entity metadata is exposed through the API so consumers use the same domain contract rather than maintaining UI-server copies.

Typical entity metadata endpoints include:

```text
GET /api/v1/<Entity>/$metadata
GET /api/v1/<Entity>/$metadata-ui
```

Canonical metadata is UI-neutral. UI metadata is framework-neutral presentation metadata; it still does not contain EJS/Bootstrap-specific rendering code.

UI-capable clients consume these API contracts to construct presentation/runtime state. The current Express UI server uses them for initial server-rendered composition and browser bootstrap; future clients may consume them directly through another approved client topology.

## Query/list contract

Collection queries preserve structured query semantics for filtering, sorting and paging. The long-term direction is that predicates remain sufficiently structured for capable storage adapters to translate them into datastore selection rather than forcing all filtering to happen after materialization.

Authorization is part of list semantics. A collection may be generally readable while individual rows are restricted. The current Map-backed implementation materializes rows and applies `filterListItems()` before user filters and paging. A relational adapter should translate equivalent row visibility into a SQL predicate where possible.

This distinction is important for organization-scoped entities: “the user may open this collection” and “the user may read this record” are separate decisions.

## Collection versus record authorization

A collection-level authorization decision answers whether a subject may enter/query the entity surface at all. A record-level decision answers whether a concrete row is visible or mutable.

For example, a normal User can open company Licenses but should receive only licenses within that user's organization, possibly zero. A Guest may be denied the collection entirely. The same record predicate must govern direct `GET /:id` access so a hidden row cannot be fetched by guessing its ID.

This is a reusable policy pattern, not a Licenses-page special case.

## Reference catalogues

Metadata-driven UI surfaces often need reference catalogues to render names or selectors. Access to a parent entity does not imply access to every entity referenced by its metadata.

Therefore reference loading is presentation-support behavior, not a privilege escalation path. If a referenced catalogue is forbidden, the generic UI layer may expose no options/labels from that catalogue while preserving the authorized parent page. Unexpected server failures must still propagate rather than being silently hidden.

The API itself remains authoritative: a missing UI reference option does not grant or revoke access to the referenced record.

## Capability projection

Clients need to present actions correctly without duplicating security policy. Capability endpoints project safe results such as `read/create/update/delete` facts.

The important rule is:

> clients receive the resolved authorization result, not the sensitive inputs or policy algorithm used to derive it.

For example, platform access may depend on role, principal relationships and licenses. The UI consumes the final platform-access capability rather than fetching all license rows and reimplementing the policy.

Collection capability endpoints remain queryable even when `read=false` so the UI can discover that a surface is unavailable without using HTTP failure as its presentation model. Actual operations still re-authorize.

## Authentication and internal trust

In the current web/BFF topology, browser JavaScript does not hold the API Bearer token directly: the Express UI-server session holds it and makes server-to-server requests. This is a security property of the current client implementation, not a requirement that every future client use Express. Other client types require an explicitly supported authentication topology.

Internal UI→API endpoints may additionally use a trusted internal key, but that key is not a substitute for ordinary user authorization. Internal trust proves process identity; it does not automatically grant business permission to the current user.

Public, authenticated and internal routes must remain explicit because they have different threat models.

## Response envelopes

Successful query and command responses use consistent envelopes so callers do not invent per-route decoding rules.

Query shape:

```json
{
  "success": true,
  "data": {}
}
```

Command shape may additionally include a message:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Failures are mapped from transport-neutral `AppError` semantics into HTTP status/envelope form by the HTTP error boundary.

## Error semantics

Application/service code throws semantic errors such as validation, not-found or forbidden errors. HTTP mapping belongs to the transport layer.

This separation permits the same application semantics to be reused by another transport in the future.

Operation Context may attach a semantic operation trace to an error. The API error envelope can expose a sanitized trace for developer tooling while preserving a concise user-facing message.

## Request correlation

Every API request has one request/correlation ID. UI→API calls send it as `x-request-id`; the API request context, logs, API CTX and snapshot directory reuse that identity.

The request ID is diagnostic correlation, not authorization identity. It should never be trusted as proof of who the caller is.

See [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).

## API CTX

The API process owns a global CTX tree with parallel request branches. Each request creates a unique `$.api.level-<request-id>` branch containing request user context and nested subsystem levels.

Async-local execution state identifies the current request/level safely across concurrent asynchronous work. There is no global mutable “current API level.”

Storage operations can create nested `STORAGE` levels containing adapter/capability/behavior resources. The branch is disposed deterministically after the request, optionally after diagnostic snapshot capture.

API CTX is not synchronized with client CTX/context state.

## Relationship and aggregate operations

Canonical relationship metadata is enforced on the API side. Client components may present relationship editors, but integrity/delete semantics cannot depend on any client having behaved correctly.

Operations that affect multiple records should execute as one logical transaction when required by the relationship/aggregate contract. The active storage strategy is responsible for preserving atomicity.

## Storage neutrality

API services do not select behavior based on adapter IDs. They depend on storage-neutral repositories/contracts and canonical metadata.

Storage capabilities and implementation strategies remain below the service boundary. A service can rely on uniqueness, relationship integrity, atomicity and persisted calculations because they are system behavioral guarantees.

See [Data and Storage Architecture](../storage/Data-and-Storage-Architecture.md).

## OpenAPI

The API publishes OpenAPI documentation for public/generic operations. System business-object operations are grouped so consumers can navigate endpoints by object rather than by one undifferentiated generic router.

OpenAPI describes the HTTP contract; it does not replace architecture/reference documentation for authorization, metadata or storage semantics.

## Extension rules

When adding API behavior:

1. decide whether it is generic entity behavior or a named command;
2. keep canonical semantics in service/metadata/policy layers rather than route conditionals;
3. define authorization independently from UI visibility;
4. preserve standard envelopes/error mapping;
5. preserve correlation/Operation Context/CTX behavior;
6. keep structured query semantics when introducing new filters/predicates;
7. add capability projection only for safe resolved facts;
8. avoid leaking secrets or policy inputs in metadata/capability responses;
9. add integration/contract tests at the API boundary.

## Audience-specific follow-up

- **Architecture:** [Runtime Architecture](../system/Runtime-Architecture.md), [Authentication and Authorization](../security/Authentication-and-Authorization.md), [Data and Storage Architecture](../storage/Data-and-Storage-Architecture.md).
- **API implementers:** [Adding an API Capability](Adding-an-API-Capability.md).
- **Reference:** [API Catalog](API-Catalog.md), [Entity Catalog](../entities/Entity-Catalog.md).
- **Diagnostics:** [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).
