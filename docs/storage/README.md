# Storage

Provider-neutral persistence architecture: adapters, families, inherited capabilities, behavior strategies, semantic/physical schema, persisted calculations, configuration lifecycle and adapter development.

## Reading map

- [`Data-and-Storage-Architecture.md`](Data-and-Storage-Architecture.md) — Data and Storage Architecture.
- [`Storage-Catalog.md`](Storage-Catalog.md) — Storage Catalog.
- [`Storage-Adapters.md`](Storage-Adapters.md) — Storage Adapters.
- [`InMemory-JSON-Transactions.md`](InMemory-JSON-Transactions.md) — In-memory/JSON transactions, compensation and persistence guarantees.

## Related subjects

This subject deliberately links to, rather than duplicates, the full detail owned by adjacent subjects: [`metadata/`](../metadata/README.md), [`entities/`](../entities/README.md), [`diagnostics/`](../diagnostics/README.md).

Return to the [documentation map](../README.md) or the [repository overview](../../README.md).

## Storage contracts and implementation

- [Data and Storage Architecture](Data-and-Storage-Architecture.md) — semantic guarantees, transactions, queries and calculation materialization.
- [Storage Adapters](Storage-Adapters.md) — provider/family/capability distinction and availability.
- [Storage Catalog](Storage-Catalog.md) — concrete configuration and adapter reference.
- [In-Memory/JSON Transactions](InMemory-JSON-Transactions.md) — snapshot boundaries, explicit compensation, JSON durability and failure handling.
- [Workspace Commit](../entities/Workspace-Commit-and-Recovery.md) — dependency ordering and pending binary resources at the API boundary.

Provider declarations alone do not prove a runnable backend. Separate semantic requirements from available mechanisms and verify the active implementation.
