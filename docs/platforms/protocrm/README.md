# protoCRM Design

protoCRM is the current CRM-oriented platform built on the reusable ManatOS foundation.

Its currently implemented platform-owned system entity is **Applications**, with **Apps Playground** as the related platform capability. Users/Account, Principals, organization hierarchy, Licenses, External Authentication Providers and Principal contact entities are ManatOS **company-level** concerns. protoCRM may consume those capabilities but does not own their canonical semantics.

## Reading map

- [Purpose and Scope](Purpose-and-Scope.md) — ownership boundary between ManatOS Company and protoCRM.
- [Domain Model](Domain-Model.md) — platform-owned concepts and relationships to shared/company concepts.
- [Navigation](Navigation.md) — current protoCRM navigation and capability-driven visibility.
- [Applications](Applications.md) — the platform-owned Applications entity and related behavior.
- [Business Rules](Business-Rules.md) — protoCRM-specific rules and current scope.
- [Application Licensing — protoCRM Perspective](Applications-and-Licenses.md) — how protoCRM Applications participate in the company-owned License model without taking ownership of it.

Company-owned identity, organizations, contact information and licensing are documented canonically under [ManatOS Company Domain](../../company/README.md). Generic hierarchy/collection-editor mechanisms are documented under [Entities](../../entities/README.md).

This folder intentionally avoids duplicate `Users-and-Principals`, `Organizations-and-Hierarchies` and `Contact-Information` documents: those concepts are referenced from protoCRM where relevant but owned elsewhere.
