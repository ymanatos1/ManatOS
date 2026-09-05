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

Canonical relationship metadata is also storage-neutral. Relationship integrity and delete-impact planning operate through metadata/repository boundaries, so cascade, unlink, set-null and restrict behavior can remain consistent when the current in-memory/JSON adapter is replaced by a relational implementation.

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

## Backward-compatible JSON loader normalization

The JSON adapter can evolve persisted records without requiring a separate migration command for additive model changes. `JsonFilePersistence.load()` normalizes older records while reconstructing the in-memory Maps.

For `SysExtAuthProvider`, databases written before the persisted `credentialsVerified` field existed are upgraded in memory during API startup. If the field is absent, the loader infers it from the legacy authoritative facts: a Client ID, encrypted Client Secret and `credentialsVerifiedAt` timestamp mean the stored pair was previously verified; otherwise the flag becomes `false`.

This normalization is automatic whenever the API initializes the datastore. It does **not** immediately rewrite `data/database.json`; the normalized property is written on the next normal persistence/flush operation. No `.env` flag or manual JSON edit activates it.

This mechanism is intentionally specific to the current JSON adapter. Future relational adapters should use explicit schema/data migrations for equivalent changes.
