# In-Memory/JSON Transaction Semantics

The active business-data adapter keeps records in typed in-memory Maps and persists complete snapshots as JSON. Its transaction guarantees are implemented in application code, not provided by a database engine. This distinction matters when an operation updates multiple records, when several API requests participate in one explicit transaction, and when persistence or rollback fails.

This reference describes the implemented adapter contract. [Data and Storage Architecture](Data-and-Storage-Architecture.md) owns the provider-independent behavioral requirements; [Workspace Commit](../entities/Workspace-Commit-and-Recovery.md) owns the entity-graph transaction contract.

## Transaction model at a glance

```text
API / authorized domain service
            |
            v
      StorageAdapter
            |
            v
   InMemoryDataStore
       |          |
       |          +-- explicit transaction journal
       |              owner, operation lease, commit/rollback actions
       v
  executeTransaction()
       |
       +-- capture complete state snapshot
       +-- execute nested business operations
       +-- persist JSON snapshot on successful outermost operation
       +-- on failure restore the original Maps in place
       |
       v
 JsonFilePersistence.save()
       |
       +-- serialize collections
       +-- write database.json.tmp
       +-- rename over database.json
```

Two related mechanisms must not be confused:

- **An ordinary datastore operation** uses `executeTransaction()` to provide a snapshot/restore boundary around the asynchronous callback. Nested calls in the same asynchronous transaction scope participate in that boundary.
- **An explicit multi-request transaction** begins with an API transaction identifier. Individual requests still perform datastore operations; registered commit and rollback actions form a **compensating-action journal**, allowing a caller to finalize or attempt to undo work across requests. This is not an isolated, deferred-commit database transaction.

## Ordinary datastore operations

`InMemoryDataStore.executeTransaction()` is implemented in `api/src/storage/in-memory-data-store.ts`.

1. At the outermost boundary, clone the complete in-memory `DatabaseState` using `structuredClone()`.
2. Execute the supplied asynchronous business operation; nested `executeTransaction()` calls reuse the current `AsyncLocalStorage` transaction scope and do not take separate snapshots.
3. On success, call `JsonFilePersistence.save(state)` and then return the operation's result.
4. On failure (including a failed persistence attempt), restore the cloned collections and rethrow the originating error.

**Preserved object identity is important.** The rollback implementation does not replace repository objects or the Maps referenced by long-lived services. `restoreState()` delegates to `restoreMap()` for each registered collection, clearing and repopulating those Maps in place. This prevents services from continuing to reference detached objects after an unsuccessful transaction.

The ordinary transaction model is a process-local behavioral mechanism. The source does not establish general cross-request serializable isolation, database lock semantics or crash-proof distributed transactions.

## JSON persistence and durability

`JsonFilePersistence.save()` materializes a complete `PersistedDatabaseState`, writes it to a temporary file next to the configured JSON database path, and renames that file over the destination.

```text
Current in-memory Maps
        |
        v
Object-to-record serialization
        |
        v
    <database path>.tmp
        |
        | successful write
        v
rename(temp, configured JSON file)
        |
        v
Operation reports success
```

A temporary-file replacement reduces the risk of leaving a partially written JSON document. It does **not**, by itself, prove an `fsync`-backed power-failure guarantee, multiple-process write coordination, archival recovery or cross-volume atomicity. The current implementation uses `writeFile()` and `rename()`; it does not explicitly synchronize the file and containing directory before returning success.

On load, absence of the JSON file initializes an empty database. Other read/parse failures are propagated as storage errors. Schema migration of specific legacy persisted properties is handled during load, separately from transaction commit.

An explicit `flush()` requests a complete persistence write and returns the provider/persistence identity and timestamp. It is not a substitute for application transaction boundaries.

## Explicit API transactions and ownership

The API exposes an explicit transaction family under its transaction router:

- `POST /api/v1/transactions` — begin an owner-bound transaction and return its identifier.
- `POST /api/v1/transactions/{id}/$commit` — finalize registered commit actions.
- `POST /api/v1/transactions/{id}/$rollback` — execute registered rollback actions.

The API mounts these routes in `api/src/app.ts`; the router itself defines `/`, `/:id/$commit` and `/:id/$rollback`. Transaction ownership is tied to the authenticated API session token identifier. A different session cannot adopt an existing transaction merely by knowing its ID.

`TransactionsSupport` maintains an active journal of commit and rollback actions, registers work with descriptions, leases a transaction while a participating API request is active, rejects finalization while operations are in flight, and expires abandoned transactions after their allowed idle lifetime.

During explicit participation, a successful JSON datastore operation has **already persisted** its resulting snapshot. It registers an undo action to restore the earlier in-memory state and persist that restored state if an explicit rollback is later requested. Registered rollback actions execute in reverse order. Finalization returns information about cleanup failures; callers must not infer that a failed compensation restored every side effect.

```text
Begin (API-session owner)
          |
          v
  Request A: write + persist JSON --> register compensating undo A
          |
          v
  Request B: write + persist JSON --> register compensating undo B
          |
          +---- Commit ----> execute commit actions; finalize journal
          |
          +---- Rollback --> undo B, undo A; report any failures
```

**Consequences:** other requests are not guaranteed to be isolated from intermediate persisted states of an explicit transaction. Rollback is compensation, not a database engine's atomic rollback of an uncommitted transaction. An interrupted process can also lose its in-process transaction journal. These are properties of the concrete adapter, not defects to conceal in cross-adapter documentation.

## Persistence errors and rollback failures

If JSON saving fails inside an ordinary operation, the in-memory state is restored and the original error propagates. If an explicit transaction was active and saving was attempted, the datastore additionally registers a compensation to persist the restored state: the on-disk result of the failed write might be uncertain.

This means **both an originating write error and a compensation error can be reported**. The finalization result exposes failures from rollback or commit cleanup. The original application failure must remain distinguishable from errors that occur while attempting to undo work.

File-based binary pictures and attachments have a separate resource-storage implementation (`picture-file-storage.ts`). Do not assume that the JSON snapshot and every binary-file operation form one indivisible filesystem transaction; use the explicit resource/compensation contracts of the caller and the [Workspace Commit](../entities/Workspace-Commit-and-Recovery.md) reference.

## Concurrency, isolation and operational boundaries

| Concern | Implemented contract / boundary |
|---|---|
| Nested service writes | One outer `executeTransaction()` snapshot/save boundary within the active async scope |
| Ordinary callback failure | Restore registered Maps in place and rethrow |
| Successful ordinary write | Serialize complete state, write temporary JSON, rename destination |
| Explicit multi-request coordination | Session-owned journal with operation leases and finalization |
| Explicit rollback | Reverse registered compensations; failures are reported |
| Process restart | Persistent JSON snapshot can be loaded; in-process transaction journal does not survive |
| Concurrent writers / isolation | No claim of relational-engine isolation or multi-process serializability |
| Crash durability | No explicit file/directory `fsync` guarantee in `JsonFilePersistence.save()` |
| Binary resources | Separate file operations; cross-resource atomicity requires orchestration |

In particular, an atomic rename should not be used to claim that concurrent independent processes cannot overwrite each other's updates, that all requests are serialized, or that a partially completed explicit transaction is invisible to other readers.

## Source and verification contracts

The authoritative implementation is concentrated in:

- `api/src/storage/in-memory-data-store.ts` — state, repositories, `executeTransaction()`, snapshot restoration and `flush()`.
- `api/src/storage/json-file-persistence.ts` — snapshot serialization, temporary write and rename.
- `api/src/storage/transactions-support.ts` — owner-bound explicit transactions, leases, compensation and expiry.
- `api/src/http/routes/transaction-router.ts` and `api/src/http/middleware/explicit-transaction.ts` — HTTP transaction lifecycle and request participation.
- `api/src/logging/transaction-execution-log.ts` and `api/src/logging/transaction-failure-log.ts` — transaction finalization/failure diagnostics.

Verification of this adapter should cover successful nested changes, callback failure, JSON write/rename failure, in-place Map identity after rollback, cross-session transaction rejection, reverse compensation order, expiry, and cleanup-failure reporting. Tests must distinguish semantic recovery from guarantees that this adapter does not provide.

The API operation trace can describe the nested storage action and the failed persistence leaf; see [Error Model](../system/Error-Model.md).
