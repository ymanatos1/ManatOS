# Platform and Application Architecture

## Composition model

ManatOS separates company scope, platform scope and application scope so reusable infrastructure is not accidentally owned by one product surface.

```text
Company: ManatOS
├── company-owned entities/capabilities/navigation
└── Platforms
    └── protoCRM
        ├── platform-owned entities/capabilities/navigation
        └── Applications
            └── future application-defined entities/features
```

The composition model sits above individual entities. A platform contributes domain/presentation/navigation capability while reusing the same metadata, API, CTX, expression, security and storage foundations.

## Company scope

Current company-owned concerns include:

- Account / Users;
- Principals and organization hierarchy;
- contact information infrastructure;
- Licenses;
- External Authentication Providers;
- company-wide navigation/configuration/capabilities.

These are not protoCRM features merely because protoCRM consumes identity/licensing services.

## Platform scope

The current concrete platform is **protoCRM**. Its current system-owned entity is Applications, and Apps Playground is a platform-level surface. Future platform tooling belongs here when it is specific to protoCRM rather than the ManatOS company/application foundation.

## Application scope

An Application entry represents a platform application/business capability. Future application-defined entities should reuse the generic entity infrastructure but need not become system-owned `SysBO` objects.

Application-defined behavior should be composed through metadata, policies, APIs and runtime extension mechanisms rather than by copying the framework into each application.

## Licenses and platform access

Licenses are company-owned because they describe customer/principal entitlement to platforms/applications. Platform access is resolved by the API into a safe capability fact.

The UI should consume the resolved fact for navigation/presentation. It should not fetch all license/principal rows and reconstruct the authorization algorithm.

This keeps company licensing reusable across platforms and keeps sensitive authorization inputs server-owned.

## Navigation

Navigation is composed from company/platform contributions plus authoritative capability facts. Visibility is presentation; it does not replace API authorization.

A role may be allowed to see an entity surface while row-level policy filters its records. For example, a User can see Licenses but should receive only licenses belonging to the user's organization, possibly none.

## Shared foundation

All scopes reuse the same Application Foundation:

- canonical metadata and UI metadata;
- generic entity API/runtime;
- CTX/expression model;
- security/capability projection;
- storage adapter boundary;
- components, selectors and workspaces;
- diagnostics and testing contracts.

Scope ownership should therefore be represented in composition metadata/directories/docs, not by forking infrastructure implementations.

## Extension rules

- company-wide identity/licensing/configuration stays outside individual platforms;
- platform-specific system objects stay under the owning platform;
- generic infrastructure should not branch on `protoCRM` unless the behavior is genuinely platform-specific;
- application-defined entities reuse generic entity infrastructure without inheriting `SysBO` terminology automatically;
- navigation/capability composition should be declarative where possible;
- server authorization remains authoritative regardless of navigation visibility.

## Audience-specific follow-up

- [Application Design](../README.md)
- [Platform Model](Platform-Model.md)
- [Application Model](Application-Model.md)
- [ManatOS Company Domain](../company/README.md)
- [protoCRM Design](protocrm/README.md)
- [Metadata Architecture](../metadata/Metadata-Architecture.md)
- [Authentication and Authorization](../security/Authentication-and-Authorization.md)
