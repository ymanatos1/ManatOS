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

## Bootstrap selection and concrete adapter registry

Storage-provider selection is bootstrap infrastructure, so it is persisted in `system-settings.json`, independently of the selected business datastore. The API creates that file on first startup with the current in-memory/JSON configuration. If the selected configuration is missing or is not runnable in the current build, startup repairs the selection to a runnable default rather than silently activating an unrelated relational configuration.

The Admin UI receives only **concrete adapters** from the storage adapter registry (`In-memory / JSON file`, `SQL Server`, `MariaDB`, ...). Adapter-family structure is intentionally private implementation detail under `api/src/storage/`.

Relational implementations are organized under `storage/adapters/relational/`. Common relational contracts and reusable implementation belong at that level; engine-specific dialect/connection code belongs below `sql-server/`, `mariadb/`, and future engine folders. The UI never asks an administrator to choose an "RDBMS family" adapter.

SQL Server and MariaDB configuration metadata may be introduced before their full repository runtime is complete. Such configurations can be created and edited, but cannot become the active datastore until that concrete runtime reports itself available. This keeps the persisted bootstrap model forward-compatible without implying that unfinished persistence code is safe to activate.

Secret adapter fields are encrypted by the API before they enter `system-settings.json`. The ciphertext may live in that bootstrap document, but the master key remains deployment configuration (`SECRETS_ENCRYPTION_KEY`) outside the file. Admin projections expose only whether a secret is already configured; they return neither plaintext nor ciphertext.

### Configuration readiness stages

Storage configuration is intentionally staged and provider-neutral:

1. **Configuration** — a unique configuration name plus a concrete adapter is sufficient to persist the configuration.
2. **Connection** — the provider-specific connection settings have been verified successfully.
3. **Database** — the selected target database/catalog exists and is reachable.
4. **Schema** — the target contains the required ManatOS schema, or the Admin has reviewed/applied the proposed preparation changes.
5. **Data** — reserved for later data consistency/migration checks when an adapter declares such a requirement.
6. **Complete** — every currently required preparation stage for the concrete adapter has been reached.

`stage` and intrinsic `status` (`Incomplete`, `Ready`, `Error`) are persisted in the bootstrap storage-configuration record as the last saved workflow projection. They are system-maintained fields, not editable settings. `Current` and `Selected` are runtime/boot-selection overlays: `Current` means the configuration actually serving the running API process, while `Selected` means the ready configuration chosen for the next API start. Only a saved `Ready` configuration whose adapter runtime is available can be selected for activation.

Completing one stage unlocks the operational actions of the next. Reopening the editor restores the last saved workflow stage without automatically retesting external infrastructure. Persisted later-stage settings are never hidden merely because no validation has run in the current popup session: the Admin can inspect or continue from saved state, and can explicitly revalidate through Test/Refresh/Inspect actions. A fresh authoritative failure downgrades only the working state until Update persists the new projection.

Database selection follows the same rule. `settings.database` is the remembered target database name. When it is empty, the adapter may expose a UI-only suggested creation name (for relational server adapters, `ManatOS_DB`); that suggestion is not persisted until the Admin explicitly chooses/creates it. A remembered database is shown immediately on reopen even before discovery. If an explicit refresh later proves it absent, the UI reports the mismatch and switches to Create-new while retaining the same remembered name as the proposal.

Saving a configuration remains independent from automatic target verification. Adapter field requirements are enforced by the operational stage that consumes them, while the saved stage/status records the last known progress. This allows Admins to save an incomplete or temporarily offline target and finish validation later.

For SQL Server, the concrete adapter may expose more than one client transport. Transport/driver choice remains SQL Server configuration detail rather than a separate storage adapter: the cross-platform TDS/Tedious path and the native Windows/ODBC path share the same SQL Server target semantics while supporting different authentication capabilities.

## Capability families and implementation strategy

Concrete adapters belong to capability families. A family defines native facilities shared by its descendants; concrete adapters inherit those declarations and may override them. The registry projects the effective capability set, including provenance, for System Settings diagnostics.

Keep three concepts separate:

- **behavioral contract** — the system semantic result that every adapter must guarantee;
- **native capability** — a datastore facility such as transactions, savepoints, generated columns, foreign keys or stored procedures;
- **implementation strategy** — how one adapter realizes the behavioral contract using its capabilities.

Do not branch generic planners/services on concrete adapter IDs when the decision can be expressed through capabilities/strategy.

### Persisted calculations

A field marked as a persisted calculation must have its calculated value represented in stored state regardless of adapter. The InMemory/JSON adapter evaluates and materializes it in ManatOS code. A relational adapter may later use a generated column, trigger/procedure or the same application-side evaluator where appropriate. Native schema support is an optimization/realization choice, not a different semantic contract.

## Prospective-target validation and schema preparation

System Settings can open a short-lived administrative connection to a configured SQL Server or MariaDB target **without changing the active business datastore**. The target workflow is intentionally separate from the runtime provider instance: Admins may test credentials, discover databases, create a missing database, inspect the required ManatOS schema and apply the currently planned additive schema changes while ManatOS continues serving requests from another storage configuration.

The initial relational schema plan is derived from canonical ManatOS object metadata under `@manatos/shared`; engine-specific code only translates that plan into SQL Server or MariaDB DDL/type syntax. This prevents the two concrete engines from maintaining independent copies of entity structure. Calculated fields that are not persisted are excluded from the physical schema.

Schema inspection is read-only. Schema preparation is an explicit Admin command. Startup of a relational runtime will use the same inspect/prepare boundary as a safety net, so preparing a target ahead of time is optional: if it is already ready, startup should find no changes; if preparation was skipped, startup can apply the same required plan before normal services are initialized.

The first schema planner is deliberately additive: it can create missing tables and columns. Destructive/transformational migrations, type changes, constraint evolution and migration ordering require the later versioned migration subsystem rather than being guessed automatically.

## Implementation source map

The storage implementation is intentionally split by concern rather than by one giant provider class:

```text
api/src/storage/
├── adapter-definition.ts       # declarative adapter/configuration contract
├── adapter-registry.ts         # concrete registry + capability resolution
├── capabilities.ts             # family hierarchy + capability catalog
├── behavior-contract.ts        # invariant behaviors + strategy resolution
├── execution-context.ts        # nested API STORAGE CTX level
├── persisted-calculation.ts    # adapter-neutral calculation materialization
├── storage-adapter.ts          # active runtime adapter contract
├── target-operations.ts        # prospective-target admin contract
├── in-memory-data-store.ts     # current runtime data store
├── in-memory-repository.ts     # current repositories/query/persistence behavior
├── json-file-persistence.ts    # durable JSON representation
└── adapters/
    ├── in-memory-json/
    └── relational/
        ├── contracts.ts
        ├── desired-schema.ts
        ├── target-operations.ts
        ├── server-rdbms/
        └── embedded-rdbms/
```

Keep code in the narrowest layer that owns the concept. For example, SQL Server connection details belong under the SQL Server adapter, while the meaning of a foreign-key capability belongs in `capabilities.ts` and the semantic relationship belongs in canonical entity metadata.

## Adding a concrete adapter

A concrete adapter should normally be introduced in this order:

1. **Choose the family** (`document-file`, `server-rdbms`, `embedded-rdbms`, or a genuinely new family).
2. **Declare adapter metadata**: stable ID, display name, description, family ID and configuration tabs/fields.
3. **Declare only capability differences** from the family. Do not copy the whole family matrix into each adapter.
4. **Add target operations** if administrators can validate/prepare a target before runtime activation.
5. **Keep `runtimeAvailable=false`** until the adapter can satisfy the complete active persistence contract safely.
6. **Implement runtime persistence** behind the common contracts.
7. **Run storage behavior/contract tests** against the adapter.
8. **Add engine-specific schema translation** from the canonical desired relational schema where applicable.
9. **Verify diagnostics**: nested storage CTX should identify the new adapter/family/capability/strategy state.
10. **Document limitations as implementation maturity**, not by weakening the system behavioral contract.

A configuration UI appearing successfully is not evidence that an adapter is ready to become the active datastore.

## Adding a capability

When a new native engine feature matters to strategy:

1. add one canonical capability key/category/description to the capability catalog;
2. define the family default at the highest common family level;
3. add concrete overrides only where an adapter differs;
4. update strategy resolution only if the capability changes how a system behavior can be realized;
5. add capability inheritance/provenance tests;
6. update the [Storage Catalog](../reference/Storage-Catalog.md).

Do not add a capability merely to mirror every vendor feature. Capabilities exist when ManatOS needs the fact for planning, administration or diagnostics.

## Adding or changing a system behavioral guarantee

A behavior is more consequential than a capability because every active adapter must satisfy it.

Before adding one:

- define the caller-visible invariant precisely;
- identify how the current JSON adapter will satisfy it;
- identify native and fallback strategies for relational adapters;
- ensure canonical metadata/query contracts can represent the required semantics;
- add provider-independent contract tests;
- avoid exposing adapter-specific mechanism as the behavior itself.

For example, “foreign keys” is not a system behavior. “Metadata-declared references remain valid according to relationship policy” is the behavior; a foreign key is one possible mechanism.

## Implementing query/policy pushdown

The current Map-backed provider can materialize rows and then apply authorization/filter predicates before final paging. A relational implementation should not preserve that implementation shape if the database can filter safely.

The desired flow is:

```text
canonical structured query
+ authorization/visibility predicate
+ list exception predicate
          |
          v
adapter translation
          |
          v
SELECT ... WHERE ... ORDER BY ... OFFSET/FETCH
```

Translation must remain safe and canonical. Do not serialize arbitrary browser JavaScript into SQL. Unsupported predicates may require a documented fallback, but the adapter should preserve paging/visibility semantics correctly.

## Persisted calculation implementation guidance

`persisted-calculation.ts` owns generic application-side materialization. Keep this path valid even as relational-native calculation support grows; it is the portability fallback.

Before translating a calculation natively, answer:

- Can the full expression semantics be represented by this engine?
- Are null/string/date/enum semantics equivalent?
- Can hierarchy/entity traversal be represented safely?
- Does the calculation depend on another row/collection and therefore require cascade/trigger strategy?
- Will reads/writes through every supported path produce the same persisted result?

If any answer is uncertain, use application evaluation rather than a superficially attractive generated-column implementation.

## Schema translator guidance

The relational desired schema is semantic. Engine translators should consume it and produce engine-specific DDL/type operations.

Do not put SQL Server types or quoting rules into canonical metadata. Conversely, do not lose canonical semantics merely because the first additive planner currently handles only tables and columns.

Future constraint/index/calculation translation should consume the same semantic model and capability strategy.

## Target workflow guidance

Target operations must remain administrative and ephemeral. A connection test or schema prepare command:

- may use credentials from the saved/working configuration;
- may connect to an inactive target;
- may inspect/prepare that target explicitly;
- must not swap the active `StorageAdapter` instance;
- should report actionable target status without leaking secrets.

This separation is what allows an administrator to prepare a future database while the current application continues to run safely on another provider.

## Storage tests to preserve

At minimum, changes should keep coverage for:

- adapter registry and unknown-adapter handling;
- family capability inheritance/provenance;
- behavior-strategy selection;
- system-settings storage lifecycle and selection rules;
- storage contract/transaction semantics;
- persisted calculations and cascades;
- desired-schema projection;
- target inspection/preparation logic;
- API STORAGE CTX creation/resources;
- snapshot behavior/redaction/non-fatal I/O;
- authorization/query behavior that storage adapters must later push down.

The authoritative full repository `npm run verifyrun` remains the final integration gate.

## Related documentation

Start with [Data and Storage Architecture](../architecture/Data-and-Storage-Architecture.md) for the complete model. Use [Storage Catalog](../reference/Storage-Catalog.md) for exact keys and [Configuration Catalog](../reference/Configuration-Catalog.md) for settings. Diagnostics are covered by [Diagnostics and Observability Architecture](../architecture/Diagnostics-and-Observability-Architecture.md).
