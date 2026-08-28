# Storage

Current storage is deliberately replaceable:

```text
Service -> Repository/DataStore contract -> InMemoryDataStore -> JsonFilePersistence
```

Business code does not know the JSON filename.

Records are held in GUID-keyed Maps and persisted as JSON objects keyed by the same GUID.

`SysConfiguration` records use the same persistence boundary. Sensitive configuration values are stored only in encrypted form; normal configuration projections do not return plaintext or ciphertext. The encryption root/key itself is deployment configuration and is deliberately not stored in the datastore it protects.

Unique fields declared by BO metadata are enforced case-insensitively by the in-memory repository. Future database adapters should map these invariants to database UNIQUE constraints.

The demonstration transaction clones current Maps, executes the logical operation, atomically writes JSON and restores the snapshot if any stage fails. A SQL adapter would use a real transaction instead.

Sessions, reset tokens and verification tokens are outside business persistence by design.


## Storage adapter flush contract

Storage adapters expose an explicit asynchronous `flush()` capability and return provider/persistence information plus whether a physical flush occurred.

For `InMemoryDataStore`, flushing writes the complete current state through `JsonFilePersistence` to `data/database.json`.

A traditional transactional SQL adapter may implement the same contract as a successful no-op because committed database writes are already durable. The HTTP layer therefore does not contain database-engine-specific flush logic.

The Admin-only server command is:

```text
POST /flush-db
```

This design keeps persistence behavior inside the storage adapter, where future SQLite, MySQL, PostgreSQL or SQL Server implementations can provide engine-appropriate semantics.

## Health and readiness

The current in-memory adapter exposes a lightweight, non-mutating health check. Server liveness is available at `GET /health`; readiness is available at `GET /ready` and currently includes datastore readiness.
