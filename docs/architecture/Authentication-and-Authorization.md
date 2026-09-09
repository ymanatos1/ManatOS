# Authentication and Authorization

Registration creates SysUser role Guest. A customer relationship later promotes an ordinary Guest to User. Admin is not automatically changed by commercial relationships.

Every authenticated user may access and update their own `SysUser` record through the generic SysBO entry surface, subject to field-level security metadata. This does **not** grant administrative access to other users: role assignment remains Admin-only, another user record is not writable without the applicable authorization rule, and self-deletion remains prohibited.

## Email registration

Requires unique user-name, unique email and local password.

## External registration

Microsoft, Google, Facebook and GitHub authenticate first. Before creating the account, the UI checks email uniqueness. If available, it displays the provider email read-only and asks for a unique user-name and an optional password. Provider profile data may supply a normalized user-name suggestion, but the user remains free to change it before account creation.

Provider subject + provider name identifies the external identity. Matching email alone never silently links two accounts.

## External-provider configuration

Provider definitions and callback paths are code-defined. Admins configure one record per supported provider through **Configuration > External authentication**. Client ID and Client Secret are treated as one credential pair. Admins may save the pair before successful provider verification; it is encrypted at rest and persisted with `credentialsVerified=false`. The provider is treated as not configured for sign-in until the stored pair successfully completes the real OAuth test, which persists `credentialsVerified=true` and `credentialsVerifiedAt`. Client secrets are never returned in plaintext by normal provider reads after storage.

### External-provider API presentation and access

The implementation keeps the full provider/credential/verification domain model, but presents it in four clear layers:

| Layer                  | Typical operations                                                                                            | Access                                                                 | Intended caller                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| Provider configuration | list/create/update/delete provider records; provider definitions                                              | **Admin only** with API Bearer token                                   | Admin tools / ManatOS UI                  |
| Credential management  | store/replace an encrypted credential pair; remove credentials                                                | **Trusted Admin/BFF**: Admin Bearer token **and** `x-internal-api-key` | ManatOS UI server/BFF                     |
| Verification workflow  | obtain a stored pair for testing; persist successful verification; temporary OAuth test state/callback/status | **Internal UI workflow only**                                          | ManatOS UI server and OAuth callback flow |
| Runtime availability   | anonymous-safe providers currently usable for sign-in                                                         | **Public/anonymous**                                                   | Sign-in / registration UI                 |

The internal verification workflow is deliberately not a general-purpose client API. In particular, API clients must not mark `credentialsVerified` directly: it is persisted, read-only, application-managed state and becomes `true` only after the real provider OAuth test succeeds. Swagger groups these operations separately and Postman places routine provider/credential-management examples with the provider collection while keeping verification mechanics documented as internal infrastructure.

## Password

A local password is optional for external-only accounts. Sign-in accepts either email or user-name when a password exists.

Policy: minimum 9 characters, at least one alphabetic, one numeric and one symbol character. Passwords use Argon2id.

## Welcome + verification

Welcome and verification are one email. A provider-verified email can be marked verified immediately; otherwise the combined email contains a verification link.

## Forgot or set password

The public request takes email/user-name but always responds generically. A random one-time token is generated and only a SHA-256 hash is retained in the transient token store. A successful set/reset sends a password-change notification email.

## Customer-first onboarding scaffold

`SysUserInvitation` is included for the case where a customer/principal exists before a website account. It stores customer relationship intent plus a **hashed** activation token and expiry. The complete purchase/provisioning UI is intentionally deferred, but the data boundary is already available.

## API login and access-token sessions

The REST API provides public registration/login endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
```

API login accepts either user-name or email plus local password. The account must have a verified email address before an API access token is issued.

The API deliberately supports multiple concurrent sessions. Each successful login creates a separate opaque Bearer token/session. Session tracking can retain non-security-critical client information when available, including `x-client-name`, user agent and client IP.

Authenticated session endpoints are:

```text
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
PUT  /api/v1/auth/password
```

`GET /sessions` lists the current user's active API sessions. `POST /logout` revokes only the current session. `POST /logout-all` revokes every active API session for that user, including the session making the request.

API access-token sessions are separate from Express/EJS browser sessions and are not business data.

## Authentication response convention

Registration, login, logout, logout-all and password changes are commands, so successful responses include a root `message` alongside `success` and `data`. Read endpoints such as `/me` and `/sessions` return `success + data` without a success message. Failures expose the user-facing message at the root and inside the `error` object.

---

# Authorization model and Capability Projection

This document describes the current ManatOS authorization architecture and runtime contracts.

## 1. Security authority

`api/src/auth/authorization-service.ts` is the authoritative SysBO and platform authorization service. Authorization is evaluated on the API side against the authenticated subject and, when required, persisted records and relationship/license data.

The browser and Express UI server never grant access. They may consume resolved capability facts for presentation, but every API read or mutation is independently authorized again when the operation executes.

The canonical SysBO authorization actions are:

```text
read
create
update
delete
```

`view` and `edit` are UI modes only; they are not authorization action names.

## 2. Authenticated subject

Authorization operates on a transport-neutral subject:

```text
userId
userName
role
```

The API authentication layer supplies this subject to `AuthorizationService`. The service does not depend on Express request objects.

## 3. Current SysBO policy

The policy is centralized in `AuthorizationService.can()` and reused by direct operation enforcement, list visibility, and capability projection.

### External authentication providers

`sys-ext-auth-providers` is Admin-only for normal SysBO access because provider configuration contains security-sensitive settings.

### SysBOUser deletion

Deletion of `sys-users` is stricter than the generic relationship policy:

- only Admin may delete a SysBOUser;
- an Admin may not delete their own SysBOUser record.

### Admin baseline

After explicit security exceptions such as SysBOUser self-delete and external-provider protection, Admin may perform the normal SysBO actions.

### Non-Admin reads

- `sys-users`: collection access may enter the list pipeline, but record visibility is restricted to the authenticated user's own row; direct record reads enforce the same rule.
- `sys-applications`: protoCRM visibility requires an effective license reachable through a Principal linked to the user. An application-restricted license narrows access to its named application; a platform-wide license covers all protoCRM applications.
- `sys-licenses`: only licenses owned by Principals linked to the user are visible.
- other Company-owned SysBOs currently use the generic readable baseline unless a more specific rule exists.

### Non-Admin creation

Generic SysBO creation is Admin-only. Public Guest registration is a separate trusted workflow and does not use generic SysBOUser create authorization.

### Non-Admin update/delete relationships

For update/delete, a record may be related to the current user through its server-owned audit identity (`createdBy` / `updatedBy`). Entity-specific relationships are then evaluated where applicable:

- `sys-users`: own SysBOUser record;
- `sys-principals`: an enabled User↔Principal relationship;
- `sys-licenses`: the license's owning Principal is linked to the user;
- `sys-applications`: a current application/platform license links the user to the application, then the application permission policy determines whether the definition may be modified.

Unknown/future SysBOs do not receive an implicit write grant; after the generic audit relationship check they fail closed unless a specific policy is added.

## 4. License and application entitlement

License validity is defined by the shared domain helpers in `shared/src/domain/company-platform.ts`:

- license must be enabled;
- status must be `Active`;
- quantity must be greater than zero;
- current time must be within the inclusive validity interval;
- `platformId` must match;
- an optional `applicationId` restricts the license to one application.

Authorization traverses enabled User↔Principal relationships to determine whether a current user owns the relevant entitlement. These relationship/license inputs remain API-private.

## 5. Capability projection APIs

Capabilities are safe preflight/presentation facts derived from the same policy used for enforcement.

### SysBO collection capabilities

```http
GET /api/v1/<SysBO>/$capabilities
```

Conceptual response:

```json
{
  "sysBOKey": "sys-users",
  "scope": "collection",
  "capabilities": {
    "read": true,
    "create": false,
    "update": false,
    "delete": false
  }
}
```

Collection `update` and `delete` are false because those decisions require a concrete record. The endpoint may return `read: false`; this allows the UI/BFF to discover that a SysBO is unavailable without reconstructing role policy.

### SysBO record capabilities

```http
GET /api/v1/<SysBO>/:id/$capabilities
```

The API loads the persisted row, requires read authorization for that row, and then resolves record-sensitive capabilities. Requiring read before projection prevents the endpoint from revealing the existence of an unreadable record.

### Platform capabilities

```http
GET /api/v1/platforms/:platformId/$capabilities
```

Current projection:

```json
{
  "platformId": "protocrm",
  "capabilities": {
    "platformAccess": true
  }
}
```

The API owns Admin bypass, Principal traversal, license validity and platform matching. Clients receive only the boolean outcome.

## 6. API enforcement

Capability projections are never bearer permissions. The API still calls `AuthorizationService.assertCan()` / `can()` for the actual operation.

A stale, modified, or fabricated client capability cannot authorize an API request.

The same rule applies to browser CTX: capability facts may control visibility, enabled state and navigation, but posted CTX is never trusted as authorization evidence.

## 7. List authorization and storage boundary

List authorization must remove unauthorized rows before client-visible filtering, sorting and paging.

The current Map-backed/in-memory implementation materializes candidate rows and applies the same record-level `read` policy through `AuthorizationService.filterListItems()` before client query operations.

A future RDBMS storage adapter must preserve the same semantic boundary by translating the authorization predicate into database selection (`WHERE`, joins, EXISTS predicates, etc.) rather than fetching unauthorized rows and filtering them in the browser or after paging.

This is the same end-to-end rule used by canonical list-exception predicates: selection semantics belong in the query/storage pipeline, not in UI-only post-filtering.

## 8. UI/CTX projection

`ui/src/sysbo/permissions.ts::resolveUIEntityPermissions()` is a capability client, not a policy engine. It requests collection or record `$capabilities` and exposes the canonical shape:

```text
permissions.read
permissions.create
permissions.update
permissions.delete
```

Persisted records use record-scoped projection. Owner-managed `draft:*` records do not yet exist in the API, so their temporary editor `update` capability is derived from the authoritative collection `create` capability. This is lifecycle adaptation, not local policy reconstruction.

Platform capability projection is loaded by `ui/src/middleware/page-context.ts` and copied to:

```text
ctx.user.permissions.platforms.<platform>.capabilities.platformAccess
```

`ctx.user.permissions.userRole` remains available as an identity fact for genuinely role-specific presentation. Generic infrastructure must not use it to recreate CRUD or platform authorization policy.

## 9. Metadata and navigation

Metadata expressions consume already-resolved CTX facts. Examples include:

```text
permissions.update === true
permissions.delete === true
user.permissions.platforms.protocrm.capabilities.platformAccess === true
```

Those expressions decide presentation only. Generic renderers must not add entity-specific role or entitlement branches after metadata has been resolved.

Navigation evaluates dynamic `visible` values against the request CTX. Capability-backed navigation fails closed when authoritative request CTX is unavailable; it does not infer platform access from an Admin role.

## 10. Architectural invariants

The following are current ManatOS security contracts:

1. API `AuthorizationService` is the authorization-policy authority.
2. Clients receive resolved capabilities, not enough raw policy inputs to reconstruct security decisions.
3. Every API operation is independently re-authorized at execution time.
4. Record-sensitive capabilities are resolved against the persisted target record.
5. Unauthorized list rows are removed before client filtering/paging; database adapters must push equivalent predicates into selection.
6. Metadata consumes capability facts from CTX; generic UI renderers do not rebuild role/license policy.
7. Missing or malformed access facts fail closed for capability-backed presentation.
8. Secrets, credential material, license-policy internals and unnecessary relationship data are not exposed through capability projections.
9. Datastore access, persistence side effects, relationship mutation and security enforcement remain outside browser expression evaluation.

## 11. Server-side declarative policy expressions

The current authoritative policy is implemented directly in `AuthorizationService`; ManatOS does not currently translate API authorization rules into evaluator expression strings.

That separation is intentional. The evaluator already serves declarative presentation and deterministic calculations over resolved facts. Moving server authorization policy into expressions would add value only when ManatOS needs configurable policy metadata or several independently authored policy sets. Until such a requirement exists, the centralized typed authorization service is the simpler and more explicit security implementation.
