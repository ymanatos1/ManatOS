# Domain Model

protoCRM currently owns the Application system entity and its platform surfaces. It consumes company-owned identity/licensing relationships where required.

```text
ManatOS Company
├── Principal
├── License ───────────────┐
└── other company entities │
                           v
protoCRM Platform ──> Application
                     └── Apps Playground
```

A License may optionally restrict access to a protoCRM Application, but License remains a company-owned entity.

See [ManatOS Company Domain](../../company/README.md) and [Entity Catalog](../../entities/Entity-Catalog.md).
