# Application Licensing — Platform Perspective

The `Company` domain owns License records; protoCRM owns its Application catalogue and can consume license facts through references and safe capability projections. A platform-specific Application is not authorized by its own rendering metadata.

```text
Organization Principal
      │ entitled party
      ▼
License ───► platformId = protocrm
      │
      └────► optional applicationId ──► Application
```

The present License type targets one platform and optionally one Application. Omission of `applicationId` means platform-wide scope **in the data model**. Validity fields, status, quantity and human-readable `rules` supply further commercial information; they are not yet an executable license-rule evaluator.

Application presentation may expose related Licenses, and the reference selector may filter Application choices based on the selected platform. These are generic metadata/UI capabilities, not a second license-management engine.

For a complete architectural entitlement system, application **design**, **test/run**, **publish** and **use** rights can be distinct purchased capabilities, subject to organization assignment and Person roles. The currently implemented platform-access projection is role-derived; the API does not yet evaluate the `rules` string into effective permissions. See [License Entitlements and Rules](../../company/License-Entitlements-and-Rules.md) and [Authorization Policy Architecture](../../security/Authorization-Policy-Architecture.md).

Application-definition and runtime implications are documented in [Application Design and Execution](Application-Design-and-Execution.md).
