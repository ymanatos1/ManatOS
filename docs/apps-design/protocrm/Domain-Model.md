# Domain Model

```text
Principal ── optional 1:1 ── User
   │
   ├── parent/root relationships → organization hierarchy
   ├── principal-email links ── EmailAddress
   ├── principal-telephone links ── TelephoneNumber
   └── principal-address links ── Address

Platform
   ├── Application
   └── License → customer Principal / Platform / optional Application
```

Principals provide a generalized person/organization identity. Users provide authentication/application-account identity and may link to a Person principal. Contact values are normalized into reusable value objects with link entities rather than duplicated free-form collections on every principal. Applications and Licenses participate in platform access/composition.

See [Entity Catalog](../../reference/Entity-Catalog.md) for exact registered entities.
