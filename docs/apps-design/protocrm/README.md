# protoCRM Design

protoCRM is the current CRM-oriented platform built on the reusable ManatOS foundation.

Its current implemented platform-owned system entity is **Applications**, with **Apps Playground** as the related platform surface. Future protoCRM tools and application capabilities belong here as they are developed.

Users/Account, Principals, organization hierarchy, Licenses, External Authentication Providers and Principal contact entities are **ManatOS company-level concerns**, not protoCRM-owned entities. protoCRM may consume them through common contracts.

## Reading map

- [Purpose and Scope](Purpose-and-Scope.md)
- [Domain Model](Domain-Model.md)
- [Navigation](Navigation.md)
- [Applications](Applications.md)
- [Business Rules](Business-Rules.md)

For company-owned identity, hierarchy, licensing and authentication-provider concepts, see [ManatOS Company Domain](../../company/README.md).
