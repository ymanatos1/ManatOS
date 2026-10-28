# protoCRM — Multi-Application Platform

protoCRM is the application-design and multi-application platform of the shared TypeScript foundation. Its purpose is to turn coherent declarative business models into reusable application behavior, including presentation, interaction and authoritative execution. It also supports CRM-oriented application vocabulary; the system is not limited to one set of CRM entities.

The central separation is between **a platform that defines and hosts applications** and **an application with its own business model and runtime requirements**.

```text
protoCRM
├─ Application catalogue
│  └─ identities / versions / descriptive resources
├─ Apps Playground
│  └─ application entry and execution/test surface
└─ Application design architecture
   ├─ canonical entities / relationships / expressions
   ├─ named UI Views / UIS / Flows
   ├─ API authorization / licensing
   └─ application/runtime portability contract
```

The currently implemented `SysBOApplication` catalogue, UI Views, platform/navigation metadata and Playground entry points support this model. A full graphical designer and independently deployable application host are architectural capabilities, not established executable facilities in the inspected TypeScript source.

## Reading map

- [Application Design and Execution](Application-Design-and-Execution.md) — **principal reference** for multi-application design, interaction/runtime composition and independent hosting architecture.
- [Purpose and Scope](Purpose-and-Scope.md) — platform identity, boundaries and application-design objectives.
- [Domain Model](Domain-Model.md) — relationship of Applications to shared entities and common runtime.
- [Applications](Applications.md) — current Application entity, presentation and metadata contracts.
- [Application Licensing](Applications-and-Licenses.md) — commercial scope and platform integration.
- [Business Rules](Business-Rules.md) — where application design rules and authoritative constraints belong.
- [Navigation](Navigation.md) — platform contributions and capability-derived visibility.

## Related architecture

[Platform and Application Architecture](../Platform-and-Application-Architecture.md) · [Metadata-Driven Application Design](../Metadata-Driven-Application-Design.md) · [UIS](../../clients/UIS-Architecture.md) · [License Entitlements](../../company/License-Entitlements-and-Rules.md) · [Authorization](../../security/Authorization-Policy-Architecture.md).

The shared `Company` metadata domain owns Users, Principals, Organizations and Licenses. Platform consumption of those records does not transfer canonical ownership.
