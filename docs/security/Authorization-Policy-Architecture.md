# Authorization Policy Architecture

Authorization is the decision that a particular authenticated actor may perform a particular operation on a particular resource **within a particular organizational and commercial scope**. It is not synonymous with a user role, a purchased license, a visible menu item, or possession of a valid API session. Those facts contribute to a decision; none, in isolation, grants unrestricted access.

This reference develops the policy architecture from the existing API implementation to the broader domain contract. It distinguishes *the authorization model*—the set of meanings a complete policy must express—from *the current enforcement surface*—the decisions actually executed by the TypeScript API. See [Authentication and Authorization](Authentication-and-Authorization.md) for concrete login and API session contracts and [License Entitlements and Rules](../company/License-Entitlements-and-Rules.md) for commercial scope.

## 1. The decision in one picture

```text
Authenticated User ──► linked Person Principal
       │                       │
       │                 organization tree
       │                       │
       ▼                       ▼
  Roles and policy      Organization entitlement
       │                 via relevant License
       │                       │
       └───────────┬───────────┘
                   ▼
          Resource policy
      operation · entity · record
        relationship · field
                   │
                   ▼
        API decision: allow/deny
                   │
                   ├──► enforce at each operation
                   └──► project safe capabilities
                                to the client
```

The central rule is **intersection, not accumulation of unchecked privileges**. Commercial entitlement establishes the maximum purchased scope; organizational delegation and assigned authority narrow what a Person may exercise; record and operation policy determine whether the requested action itself is permitted. Explicit system-wide administration is a separate, auditable exception rather than an implicit license bypass.

The evaluator's answer should depend on a *subject*, *action*, *resource*, and *decision context*. An illustrative conceptual tuple is:

```text
(subject User + Principal, organization, roles,
 licensed capability, resource kind + identity,
 operation, resource relationship, time)
               -> allow | deny
```

This tuple explains the intended policy model; it is **not** the signature of a currently exported TypeScript API.

## 2. Identities, organizations and boundaries

**User** (`SysBOUser`) is the authenticated account. **Principal** (`SysBOPrincipal`) models a Person or organizational identity. A Person may be linked to one User through `userId`; Principal hierarchy is represented by `parentId` and its calculated/materialized `rootId`. A customer Organization can therefore hold a license without each employee possessing or editing that license.

The organization root identifies a relevant organizational boundary; it is not, on its own, proof that every individual inside that boundary may administer every record. Parent/child membership, the user's organizational role, the resource's ownership relationship and a purchased entitlement have different meanings and must remain distinguishable.

A single Person's access should be derived from the authoritative organizational relationship at evaluation time. Merely displaying a Principal under an organization in the UI is not evidence of a valid server-side membership link. The `Company` identifier in source paths names this shared identity/licensing domain, not the software project's corporate status.

## 3. Five policy dimensions

| Dimension | Question answered | Authoritative facts |
|---|---|---|
| Authentication | Who is requesting the operation? | API session, User and linked Principal |
| Entitlement | Which capabilities has the relevant organization acquired? | License, platform/application scope, validity and rules |
| Delegation | Which organizational Persons may exercise those capabilities? | Principal links, organization policy, assigned roles |
| Resource access | May this actor act upon this particular resource? | Entity, operation, record relationships, ownership, optional field policy |
| Enforcement | Is the actual request permitted *now*? | API-side policy evaluation with current trusted facts |

Entitlement is **necessary where a capability is license-controlled**, but does not by itself imply every operation is allowed. Conversely, a privileged user role does not conjure an unpurchased commercial capability unless explicit system-administration policy provides an override. The architecture should make such overrides narrow, visible and testable.

## 4. Role-based authority

The current role vocabulary is `Guest`, `User`, `Superuser`, and `Admin`. These are not interchangeable levels in a simple numeric privilege ladder: `Superuser` has broader inspection/platform access while generic mutation remains restricted; `Admin` is the administration authority subject to explicit safety constraints. The TypeScript service evaluates four generic SysBO operations—`read`, `create`, `update`, `delete`—rather than using the UI's view/edit modes as authority verbs.

Roles are broad *starting policies*, not a complete substitute for organization- or record-sensitive evaluation. In a full model, roles may be combined with organizational delegation and entitlements but must not be interpreted locally by every client. One canonical authorization decision remains the objective.

### Current role policy — source-grounded

The current `api/src/auth/authorization-service.ts` implements role and selected relationship rules:

- `Admin` generally may administer entities, except special safety rules such as prohibiting self-deletion of a SysUser.
- `Superuser` is primarily inspection-only for generic SysBO mutation; a self-service account-update exception applies.
- `Guest` and `User` are limited by entity and record rules. Generic creation is Administrator-only; dedicated public registration uses separate commands.
- Non-admin User record reads are restricted to the authenticated user's own row; Principal and License reads use organization-root checks where applicable.
- Selected protected system entities and surveillance entities have additional explicit rules.
- For remaining related-record updates/deletes, matching `createdBy` **or** `updatedBy` to the user's name is an existing fallback. This is an *audit-field relationship heuristic*, not a comprehensive, immutable ownership or delegated-organization policy.

These describe real behavior, **not** a claim that all policy dimensions in this chapter are already enforced.

## 5. Ownership and related-record access

Three commonly confused relationships deserve separate treatment:

1. **Creator:** the Principal or User who originally created a record. This is useful provenance but not always its durable owner.
2. **Last editor:** the actor who last modified it. This is an audit fact; editing a record must not automatically confer permanent authority without an explicit policy.
3. **Owner:** the Person, Organization, or other domain identity formally responsible for the record. This may support inheritance and controlled delegation.

A robust policy distinguishes these relationships even when records also contain conventional `createdBy` and `updatedBy` fields. Shared organizational ownership must not be inferred by comparing user names alone. The authoritative evaluator needs explicit, trusted ownership and membership facts, and must handle moves between organizations or changes of membership without relying on old UI state.

**Current boundary:** the TypeScript authorization service implements organization-scoped visibility for Principals and Licenses and audit-related mutation fallback; a general-purpose explicit resource-owner/organizational-delegation policy engine is **not** established by this source.

## 6. Licensing is a first-class policy input

A License belongs to a Principal, identifies exactly one platform, and may optionally restrict a single Application. It also stores status, validity information, quantity and a textual `rules` field. These fields are commercial-domain data. Interpreting them as machine-enforced rights requires an explicit, versioned policy contract, not the mere presence of a row or a UI badge.

The architectural entitlement model should be able to represent: licensed application(s), authorized operations/capabilities, commercial quantity or seats, time and validity restrictions, qualifying organizations or Person groups, and resource-specific restrictions. A particular license may combine several limitations. The **effective set of entitlements** must be computed by the authoritative server and reconciled with role and resource permissions.

```text
License belongs to Organization Principal
    ├── platform/application(s) and product capabilities
    ├── time / status / quantity constraints
    └── policy terms (restricted, versioned meaning)
                   │
       organization membership + delegation
                   │
            Person Principal ─► User
                   │
       resource-specific permission check
                   ▼
             effective rights
```

An organization purchasing ten seats should not automatically make every associated Person a licensed seat. Nor should a license granting access to a platform automatically authorize editing a specific customer record. Seat assignment and record authority answer separate questions.

**Implementation boundary:** The current `rules?: string` field is bounded text metadata, and `platformCapabilities()` currently returns a role-derived `platformAccess` boolean. No parser or authoritative license-rule evaluation is established in the inspected API implementation. See [License Entitlements and Rules](../company/License-Entitlements-and-Rules.md).

## 7. Policy evaluation and non-bypassable enforcement

A sound complete evaluation has the following conceptual sequence:

```text
Authenticate the request
    │
    ├─ identify User and authorized organizational Principal
    ├─ resolve resource and operation (including ownership)
    ├─ establish applicable License entitlements
    ├─ intersect with delegation, role and record/field policy
    ├─ apply explicit safety and deny rules
    └─ authorize or reject *before* protected effects
```

The sequence is illustrative: ordering may be optimized, but no prerequisite may be silently bypassed. In particular, *visibility checks, query filtering, direct record access, mutations, binary-resource commits and privileged commands* must respect the same policy semantics.

A collection permission does not imply that every row in the collection is readable. Query filtering must remove unauthorized records **before** filters, counts, sorting or pagination expose sensitive information. Field visibility cannot replace API response shaping and field-mutation policy if field-level authorization is part of a deployed policy.

Default-deny is the safe interpretation of absent membership, unknown entitlement, unrecognized action, expired license or missing resource identity. Public enrollment and administrative maintenance are explicit policies, not loopholes through generic CRUD.

## 8. API capability projections and UIS

The API exposes bounded capability projections for entity collections, individual readable records and platforms. They allow navigation and UIS actions to display what the current actor *appears* eligible to do, without transporting all policy inputs into the browser.

```text
API policy + trusted domain data
         │
         ├── enforcement: authoritative, every operation
         └── projection: read-only capability facts
                          │
                          ▼
                    client CTX
                          │
              UIS navigation / actions
```

An enabled button is not authorization. Cached projections can become stale when roles, licenses, memberships or target records change. The API must still reject the actual request whenever the current policy does not allow it; the client then reconciles state and presents an appropriate error.

For a record-capability endpoint, the API must first establish that the actor may read that record. Otherwise the projection itself could disclose whether an inaccessible record exists. Data returned by permission endpoints must not expose internal license secrets, other users' relationships or raw policy internals.

## 9. Policy engineering considerations

**Determinism and provenance.** For identical subject, resource and trusted policy inputs, authorization should produce the same decision. Operational diagnostics may record a safe decision category and policy version, not secrets or unrestricted personal records.

**Revocation.** Revoking a role, removing a Person from an organization, suspending a License or changing ownership must affect subsequent operations. A client refresh is not a security revocation mechanism.

**Consistency across storage providers.** In-memory row filtering and SQL predicate lowering must implement equivalent semantics. A storage optimization cannot return records that the canonical policy would deny.

**Race boundaries.** Between checking a permission and committing a mutation, resource or membership facts may change. Transactions, optimistic concurrency and authoritative rechecking must ensure policy decisions apply to the state being modified.

**Commercial isolation.** Customer-to-customer organization boundaries are security boundaries. Generic navigation, relationship selectors, autocomplete, exports and error messages must not reveal cross-organization data.

**Auditability.** Separate login/audit facts from authorization reasoning. Record which authenticated subject attempted an operation, which resource policy was considered, and the outcome, while respecting data minimization.

## 10. Verification contract

Authorization tests should cover successful and denied operations across role, Person/organization membership, record ownership, different organizations, license validity, capability scopes and changes during a session. They should also prove API behavior with forged/stale client projections and ensure list/detail/selector/export/binary-operation consistency.

This is an architectural testing matrix, **not a declaration that every test or policy dimension already exists**. Present TypeScript service behavior remains the source of truth for currently executable rules.


## Domain-level license evaluation

The shared domain already implements basic license predicates in `shared/src/domain/company-platform.ts`:

- `licenseIsEffective(license, at)` requires an enabled, active license with positive quantity and a valid time interval.
- `licenseGrantsPlatformAccess(license, platformId, at)` additionally matches the selected platform.
- `licenseGrantsApplicationAccess(license, platformId, applicationId, at)` additionally permits the requested application; a missing `applicationId` means the license covers that platform's applications at the *license-data* level.

Date-only `validUntil` is inclusive through the end of its UTC calendar day; invalid supplied date boundaries fail the predicate. These are meaningful, implemented **domain helpers**, but they are not a full server-side entitlement authorization service. In particular, the API's `AuthorizationService.platformCapabilities()` currently resolves platform access from the authenticated role and does not consult the License `rules` text. The intended intersection of organizational license, Person delegation, role and resource policy remains a distinct architectural concern.

## Related references

- [Authentication and Authorization](Authentication-and-Authorization.md) — accounts, sessions and concrete API authorization.
- [Security Architecture](Security-Architecture.md) — broader threat and trust model.
- [License Entitlements and Rules](../company/License-Entitlements-and-Rules.md) — license structure, commercial authority and Person delegation.
- [Users and Principals](../company/Users-and-Principals.md) and [Organizations and Hierarchies](../company/Organizations-and-Hierarchies.md).
- [UIS Architecture](../clients/UIS-Architecture.md) — presentation uses capability projections, never becomes an authority.
