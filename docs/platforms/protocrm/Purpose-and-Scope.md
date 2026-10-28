# Purpose and Scope

protoCRM is a multi-application platform for describing business application structure in metadata and interpreting that structure through common runtime services. The platform also provides CRM-oriented domain concepts and navigation, but its application-design architecture is not limited to one CRM workflow or fixed set of forms.

## Design premise

An application author should define **business meaning once**: entity identities and fields, enums, calculations, relationships, UI Views, and operational permissions. The foundation supplies shared realization through the TypeScript API, metadata services, CTX, expressions, UIS, storage and diagnostics. Where business behavior cannot safely be declared, it belongs in an explicit trusted service or API operation, not a client-only metadata workaround.

## Platform, application and host

```text
Multi-application platform
       │
       ├── application identity / catalogue
       ├── domain and presentation modelling
       └── run / test interactions
                    │
                 runtime
       API · UIS · CTX · storage · security
                    │
       ┌────────────┴────────────┐
       integrated host       independent compatible host
                            (architectural model)
```

The **integrated environment** allows an application model to be composed and exercised using the shared foundation. A **compatible independent host** is an architectural execution form: it must carry the required runtime, definitions, resources, authorization and configuration, not simply render exported HTML.

## Current implementation boundary

`shared/src/platforms/protocrm/platform.ts` declares stable platform identity, CRM-oriented presentation features, Application and Playground navigation and a platform-access expression. `SysBOApplication` declares an application catalogue with metadata-driven Entry and List representations. The current source does not establish a general-purpose application compiler, publishing pipeline or separate standalone host as completed runtime behavior.

## Ownership

The shared `Company` technical domain owns account identity, Person/Organization Principals, contact data, external identity configuration and Licenses. protoCRM owns the Applications catalogue and its platform presentation. The API remains the authoritative security and persistence boundary regardless of which platform or application renders a record.

See [Application Design and Execution](Application-Design-and-Execution.md) for the complete application architecture, [License Entitlements](../../company/License-Entitlements-and-Rules.md) for the commercial model and [Platform and Application Architecture](../Platform-and-Application-Architecture.md) for overall composition.
