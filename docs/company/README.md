# Shared Identity and Licensing Domain

The `Company` domain is the source-defined technical namespace for shared identity, organization, contact and licensing information. It is not the identity of the overall software foundation.


This domain supplies business identity and commercial records shared by platforms and applications. It includes authenticated Users/accounts, Principals, organization hierarchies, reusable contact information, Licenses and external authentication-provider configuration. These concepts remain company-level even when a platform such as protoCRM consumes them.

A User represents system/authentication identity; a Principal represents the richer business identity of a person, organization or other principal type. Linking them allows organization-scoped authorization without collapsing authentication and business-domain concerns into one record model.

Licenses connect Principals/organizations to platform or application entitlement but remain company-owned records. External authentication providers are likewise authentication infrastructure rather than protoCRM application data.

## Reading map

- [`Users-and-Principals.md`](Users-and-Principals.md) — account/business-identity relationship and principal semantics.
- [`Organizations-and-Hierarchies.md`](Organizations-and-Hierarchies.md) — organization structure, roots and hierarchy behavior.
- [`Contact-Information.md`](Contact-Information.md) — reusable email, telephone and address information.
- [`Licensing.md`](Licensing.md) — License entity and presentation contracts.
- [`License-Entitlements-and-Rules.md`](License-Entitlements-and-Rules.md) — multi-layer commercial entitlement, organization assignment, license-rule semantics and API boundary.
- [`External-Authentication-Providers.md`](External-Authentication-Providers.md) — provider definitions, credentials, verification and external identities.

Related subjects: [`security/`](../security/README.md), [`platforms/`](../platforms/README.md), [`entities/`](../entities/README.md) and [`api/`](../api/README.md).

Return to the [documentation map](../README.md) or [repository overview](../../README.md).
