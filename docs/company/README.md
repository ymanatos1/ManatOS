# Company Domain

The **Company domain** is the foundation-level business domain shared by platforms and applications. It includes authenticated Users/accounts, Principals, organization hierarchies, reusable contact information, Licenses and external authentication-provider configuration. `Company` here is a technical scope in the ManatOS domain model; it does not describe ManatOS as a legal company. These concepts remain Company-scope even when a platform such as protoCRM consumes them.

A User represents system/authentication identity; a Principal represents the richer business identity of a person, organization or other principal type. Linking them allows organization-scoped authorization without collapsing authentication and business-domain concerns into one record model.

Licenses connect Principals/organizations to platform or application entitlement but remain foundation-level Company-domain records. External authentication providers are likewise authentication infrastructure rather than protoCRM application data.

## Reading map

- [`Users-and-Principals.md`](Users-and-Principals.md) — account/business-identity relationship and principal semantics.
- [`Organizations-and-Hierarchies.md`](Organizations-and-Hierarchies.md) — organization structure, roots and hierarchy behavior.
- [`Contact-Information.md`](Contact-Information.md) — reusable email, telephone and address information.
- [`Licensing.md`](Licensing.md) — platform/application-aware licensing and entitlement data.
- [`External-Authentication-Providers.md`](External-Authentication-Providers.md) — provider definitions, credentials, verification and external identities.

Related subjects: [`security/`](../security/), [`platforms/`](../platforms/), [`entities/`](../entities/) and [`api/`](../api/).

Return to the [documentation map](../README.md) or [repository overview](../../README.md).
