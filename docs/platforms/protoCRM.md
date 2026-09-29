# protoCRM

protoCRM is the first concrete ManatOS platform. It demonstrates how a platform contributes its own Applications, navigation and product-specific surfaces while consuming the common ManatOS entity/runtime/security/storage foundation.

The currently implemented protoCRM-owned system scope centers on **Applications** and **Apps Playground**. Future protoCRM tools and application-defined entities will extend that platform scope.

Users/Account, Principals, Licenses, External Authentication Providers, organization hierarchy and Principal contact information belong to the **foundation-level Company domain**. protoCRM may reference or consume those concepts, but they are not platform-owned simply because they participate in protoCRM workflows.

See [protoCRM Design](protocrm/README.md) and [Company Domain](../company/README.md).
