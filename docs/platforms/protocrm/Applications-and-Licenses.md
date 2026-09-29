# Application Licensing — protoCRM Perspective

Licenses are **foundation-level Company-domain records**; protoCRM does not own the License entity. This document describes the platform-side integration: how protoCRM Applications participate in the company licensing model.

The canonical License model is documented in [Company Licensing](../../company/Licensing.md).

## Relationship

A company License identifies a Principal/customer scope and a Platform. It can optionally restrict that platform license to one Application.

```text
Company Principal
      |
      v
ManatOS License -----> Platform (protoCRM)
                           |
                           +---- optional restriction ----> Application
```

From protoCRM's perspective, the important fact is that an Application can be the target of a Company-domain license restriction. Application metadata/presentation can expose related Licenses without taking ownership of their lifecycle or authorization policy.

## Application catalogue restriction

When editing a License, the candidate Application catalogue can be constrained by the selected Platform. That is a generic reference-selection capability driven by metadata; protoCRM does not require an entity-specific selector implementation.

## Related Licenses on Applications

An Application entry can expose a read-only related Licenses tab/list. This is a generic related-record presentation of company data. The Application surface does not mutate License semantics merely because it can navigate to/display those relationships.

## Authorization boundary

The API derives platform/application access capabilities. A protoCRM client surface consumes those safe capability facts; it does not infer access by loading raw License rows and reimplementing policy.

This distinction is important:

- **License data ownership:** foundation-level Company domain;
- **Application ownership:** protoCRM/platform;
- **authorization decision:** API/server policy;
- **presentation:** whichever client is rendering the platform.

See [Company Licensing](../../company/Licensing.md), [Applications](Applications.md), and [Authentication and Authorization](../../security/Authentication-and-Authorization.md).
