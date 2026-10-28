# Security

Authentication, authorization, role semantics, row scoping, capability projection, external identity/provider behavior and secure implementation guidance.

## Reading map

- [`Authentication-and-Authorization.md`](Authentication-and-Authorization.md) — Authentication and Authorization.
- [`Security-Architecture.md`](Security-Architecture.md) — trust and security boundaries.
- [`Authorization-Policy-Architecture.md`](Authorization-Policy-Architecture.md) — **layered roles, organization/Person delegation, record ownership and License-entitlement policy**.
- [`Authentication-and-Account.md`](Authentication-and-Account.md) — Authentication and Account.
- [`Security-Guidelines.md`](Security-Guidelines.md) — Security Guidelines.

## Related subjects

This subject deliberately links to, rather than duplicates, the full detail owned by adjacent subjects: [`api/`](../api/README.md), [`company/`](../company/README.md), [`clients/`](../clients/README.md).

Return to the [documentation map](../README.md) or the [repository overview](../../README.md).

## Authentication and threat boundaries

- [Security Architecture](Security-Architecture.md) — topology, principal/trust boundaries and threat-oriented review.
- [Authentication and Authorization](Authentication-and-Authorization.md) — operational roles, sessions, API enforcement and capability projection.
- [Authorization Policy Architecture](Authorization-Policy-Architecture.md) — the complete layered authorization model and its present implementation boundary.
- [License Entitlements](../company/License-Entitlements-and-Rules.md) — commercial grants and organizational delegation.
- [Native OAuth](Native-OAuth.md) — API-mediated protocol and explicit approval/security requirements.
- [Authentication and Account](Authentication-and-Account.md) — credential and recovery semantics.
- [Security Guidelines](Security-Guidelines.md) — extension rules.

Browser cookie sessions and API Bearer sessions have separate owners; identity proof and permission to mutate a record are different decisions.
