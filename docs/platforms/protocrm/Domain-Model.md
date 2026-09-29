# Domain Model

protoCRM currently owns the Application system entity and its platform surfaces. It consumes foundation-level Company-domain identity/licensing relationships where required.

```text
Company domain
├── Principal
├── License ───────────────┐
└── other Company-domain entities │
                           v
protoCRM Platform ──> Application
                     └── Apps Playground
```

A License may optionally restrict access to a protoCRM Application, but License remains a Company-domain entity.

See [Company domain Domain](../../company/README.md) and [Entity Catalog](../../entities/Entity-Catalog.md).
