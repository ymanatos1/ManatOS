# Storage Adapters

Storage adapters translate canonical persistence/query contracts into a concrete datastore implementation. They should not redefine entity metadata, authorization or presentation semantics.

## Responsibilities

An adapter owns datastore-specific create/read/update/delete mechanics, paging, ordering and supported predicate translation. Structured query and exception predicates should remain structured until this boundary so a future relational adapter can translate them into native `WHERE` conditions rather than receiving rows already filtered by browser code.

## Boundary

```text
API/service/domain policy
          |
          v
canonical storage/query contract
          |
          v
storage adapter
  ├── in-memory / file implementation
  └── future relational implementation
          |
          v
physical datastore
```

Relationship integrity and business authorization remain above raw storage. An adapter can enforce physical constraints required by its datastore, but it should not become the only place where a business rule is understood.

When adding an adapter, implement the storage contract tests first and document any unsupported predicate/operator capability explicitly.
