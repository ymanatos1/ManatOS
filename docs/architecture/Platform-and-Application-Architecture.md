# Platform and Application Architecture

The composition model is deliberately above individual entities:

```text
Company
├── company-wide entity/capability contributions
└── Platforms
    ├── entity contributions
    ├── navigation
    ├── presentation
    └── Applications
```

A platform contributes domain/presentation/navigation capabilities while reusing the same runtime, security, metadata and storage foundations. Applications are platform-level business capabilities rather than copies of the framework.

The current concrete platform is **protoCRM**. Platform access is represented as a safe server-resolved capability and can drive declarative navigation/presentation. Licensing participates in that model rather than being reduced to a client-side menu check.

See [Application Design](../apps-design/README.md), [Platform Model](../apps-design/Platform-Model.md), and [protoCRM Design](../apps-design/protocrm/README.md).
