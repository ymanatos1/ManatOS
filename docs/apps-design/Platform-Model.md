# Platform Model

A platform is a product/domain contribution inside the company context. It provides a stable identity together with platform-specific navigation, presentation, entity availability and application capabilities while reusing the common runtime, security and persistence foundations.

## What a platform owns

Platform definitions own concerns that are genuinely product-specific: platform identity, navigation contributions, assets/presentation and the set of applications or capabilities exposed by that product. They do not own generic SysBO behavior, CTX semantics, authentication infrastructure or persistence mechanics simply because those facilities are used by the platform.

```text
Company context
└── Platform
    ├── stable id / code / name
    ├── presentation
    ├── navigation contributions
    ├── entity/application requirements
    └── server-resolved access capability
```

Platform definitions live beside their domain contribution rather than in a monolithic company module. This keeps product-specific behavior out of the reusable core and lets additional platforms be introduced without expanding a central switch statement.

## Access and navigation

The UI may use a safe server-resolved platform capability to decide whether platform navigation should be visible. That fact is a presentation input, not the authorization boundary. Protected API operations still enforce their own policy independently of whether a menu item is currently shown.

The current platform identifier is `protocrm`. It provides the concrete CRM-oriented application/design example documented under [protoCRM](protocrm/README.md).
