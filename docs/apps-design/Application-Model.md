# Application Model

An application is a first-class business capability contributed by a platform. It is represented as system data rather than as a separate runtime or duplicated technical stack. This allows platform navigation, licensing, relationships and administrative behavior to refer to applications through the same entity, metadata, authorization and presentation contracts used elsewhere.

## Responsibilities

An application definition provides stable identity and presentation and participates in platform-specific relationships. The current model uses applications in licensing and administration, and exposes their related Licenses through the generic related-collection mechanisms. Application-specific behavior may add pages, components or metadata, but should consume the common runtime contracts rather than bypassing CTX, authorization or canonical entity semantics.

## Boundary with platforms

A platform is the larger product/domain contribution. Applications sit within that platform and describe capabilities that can be independently identified, administered or licensed. Platform-level concerns such as navigation contribution, overall access and product-specific assets therefore remain platform-owned; application-level identity and relationships remain application-owned.

```text
Company
└── Platform
    ├── platform navigation / access / presentation
    └── Applications
        ├── identity and canonical entry representation
        ├── application-specific relationships
        └── related Licenses
```

## Design invariants

- application identity must remain stable independently of one UI page;
- ordinary application fields and relationships use canonical SysBO metadata;
- authorization remains server authoritative;
- related records reuse generic relationship/list presentation;
- application-specific UI should extend common composition rather than create a parallel framework.

See [Platform Model](Platform-Model.md), [Application Design Principles](Application-Design-Principles.md), and [protoCRM Applications and Licenses](protocrm/Applications-and-Licenses.md).
