# Storage

Current storage is deliberately replaceable:

```text
Service -> Repository/DataStore contract -> InMemoryDataStore -> JsonFilePersistence
```

Business code does not know the JSON filename.

Records are held in GUID-keyed Maps and persisted as JSON objects keyed by the same GUID.

Unique fields declared by BO metadata are enforced case-insensitively by the in-memory repository. Future database adapters should map these invariants to database UNIQUE constraints.

The demonstration transaction clones current Maps, executes the logical operation, atomically writes JSON and restores the snapshot if any stage fails. A SQL adapter would use a real transaction instead.

Sessions, reset tokens and verification tokens are outside business persistence by design.
