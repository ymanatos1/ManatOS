# Licensing

A License is a shared-domain business record connecting a customer Principal to one platform and, optionally, an Application. Its structure captures commercial relationships and validity information. Its interpretation as effective authorization depends on the server's entitlement and resource-policy model.

## Current entity structure

```text
License
├─ principalId ───────► Person / Organization Principal
├─ platformId ────────► one platform
├─ applicationId? ────► optional single-application restriction
├─ licenseKey? / rules? (human-readable text)
├─ status / quantity
├─ validFrom / validityDuration / validUntil
└─ description
```

The canonical License metadata defines reference relationships, enum status, calendar-aware validity calculations and defaults. `rules` is a bounded text field, not a compiled policy language. `quantity` exists as an integer quantity fact but has no source-established generic seat-allocation engine.

Application choices can be filtered by platform through generic reference-selection metadata. Principal and Application entries may display related Licenses without taking ownership of License data. A related List is a UI projection, not proof of a right to change those records.

## Effective entitlement is a separate decision

The broader licensing model distinguishes an organization's purchased product scope, how that organization assigns privileges to its Person Principals, and resource-specific authorization. A License can make a capability commercially available without granting every related User permission to exercise it.

```text
Organization + purchased License
               │
       eligible entitlement
               │
      Person delegation / role
               │
       resource permission
               ▼
       effective API decision
```

The current API's platform capability is role-derived; server evaluation of license `rules`, organizational seats or per-application purchased actions is not established. Neither the browser nor metadata text should interpret the License as sufficient access authority.

The detailed commercial policy vocabulary, safety boundaries and implementation distinctions are in [License Entitlements and Rules](License-Entitlements-and-Rules.md). For the full decision intersection see [Authorization Policy Architecture](../security/Authorization-Policy-Architecture.md).

## Domain-level license evaluation

The shared domain already implements basic license predicates in `shared/src/domain/company-platform.ts`:

- `licenseIsEffective(license, at)` requires an enabled, active license with positive quantity and a valid time interval.
- `licenseGrantsPlatformAccess(license, platformId, at)` additionally matches the selected platform.
- `licenseGrantsApplicationAccess(license, platformId, applicationId, at)` additionally permits the requested application; a missing `applicationId` means the license covers that platform's applications at the *license-data* level.

Date-only `validUntil` is inclusive through the end of its UTC calendar day; invalid supplied date boundaries fail the predicate. These are meaningful, implemented **domain helpers**, but they are not a full server-side entitlement authorization service. In particular, the API's `AuthorizationService.platformCapabilities()` currently resolves platform access from the authenticated role and does not consult the License `rules` text. The intended intersection of organizational license, Person delegation, role and resource policy remains a distinct architectural concern.

