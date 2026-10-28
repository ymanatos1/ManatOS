# Data and Storage Architecture

## Purpose

Storage in ManatOS is a replaceable infrastructure boundary, not a property of individual entities or business services. Business behavior is defined in canonical metadata, services, policies and shared runtime contracts. A storage adapter is responsible for preserving those semantics using the facilities of its underlying engine.

The design therefore separates four questions that are easy to conflate:

1. **What semantics must the system guarantee?** These are system behavioral guarantees and are invariant across providers.
2. **What can a storage engine do natively?** These are effective adapter capabilities.
3. **How will a particular adapter realize the required semantics?** This is adapter strategy.
4. **How is a prospective target configured and prepared without changing the active datastore?** This is the storage configuration/target workflow.

This separation is foundational. Entity code must not contain branches such as `if SQL Server ...` or `if JSON ...`. A capability is not permission to weaken a semantic guarantee. It is information used by the adapter layer to choose the most appropriate physical mechanism.

## Architectural position

The current execution path is conceptually:

```text
HTTP/API operation
      |
      v
application/service behavior
      |
      v
canonical entity + relationship metadata
      |
      v
storage-neutral repository/DataStore operations
      |
      v
active StorageAdapter implementation
      |
      +-----------------------------+
      |                             |
      v                             v
InMemoryDataStore              future/current RDBMS adapters
      |                             |
      v                             v
JsonFilePersistence            relational engine
```

The current production-capable provider keeps records in GUID-keyed Maps and persists them as JSON. Business code does not know the JSON filename, persistence directory or file format. The same service and metadata contracts are intended to execute against relational adapters as those runtime implementations become available.

The active datastore and a configured **target datastore** are distinct concepts. An administrator may configure, validate and prepare a SQL target while the application continues to run against JSON. Target administration is deliberately not a hidden switchover mechanism.

## Canonical storage concepts

### Storage adapter

A storage adapter is the runtime implementation behind the persistence contract. It owns physical storage mechanics and any engine-specific translation. The common `StorageAdapter` contract currently includes picture/blob operations and explicit flush semantics and is expected to expand as relational runtime implementations mature.

A concrete adapter is identified by a stable adapter ID and has:

- a human-readable name and description;
- a family ID;
- configuration tabs and fields;
- runtime availability state;
- optional target-workflow operations;
- effective native capabilities resolved by the registry.

Concrete adapters currently registered include the in-memory/JSON provider and relational definitions for SQL Server, MariaDB, PostgreSQL and SQLite. A definition may exist for configuration/target preparation before the corresponding adapter is ready to serve as the active business datastore. `runtimeAvailable` makes that distinction explicit.

### Adapter family

An adapter family describes capabilities shared by a class of engines. Families are internal architecture, not selectable datastore instances.

The current hierarchy is:

```text
document-file

relational
├── server-rdbms
│   ├── SQL Server adapter
│   ├── MariaDB adapter
│   └── PostgreSQL adapter
└── embedded-rdbms
    └── SQLite adapter
```

The hierarchy prevents repeated declarations such as “supports tables, indexes and foreign keys” on every relational engine. A family may inherit from another family and add or override capabilities. A concrete adapter may then override a family value when the engine differs from the family default.

The family hierarchy is resolved centrally by the adapter registry. Consumers receive the effective result and provenance rather than reimplementing inheritance.

### Storage configuration

A storage configuration is an administrator-created instance describing how ManatOS should connect to or persist through a concrete adapter. A configuration is not the adapter definition itself.

For example, two SQL Server configurations may use the same adapter but point at different servers/databases. Conversely, selecting an adapter definition in the registry does not create or activate a configuration.

Bootstrap storage selection is persisted in `system-settings.json`. The selected configuration is the configuration intended for the **next API start**. The running API keeps its active provider for its process lifetime; editing settings does not mutate the provider underneath live operations.

This distinction is intentional because storage replacement is a system lifecycle decision, not an ordinary live UI preference.

## System behavioral guarantees

Capabilities describe native engine facilities. They do **not** define what callers may rely on. The behavioral contract does that.

The current storage behavioral contract includes:

| Behavior                     | System guarantee                                                             |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `writes.atomic`              | A logical mutation completes as a unit or persisted state remains unchanged. |
| `integrity.unique`           | Metadata-declared uniqueness is enforced consistently.                       |
| `integrity.references`       | Metadata-declared relationships preserve reference/delete semantics.         |
| `calculations.persisted`     | Fields declared as persisted calculations are materialized consistently.     |
| `schema.semantic-projection` | Canonical metadata can be projected into a storage-neutral desired schema.   |

These guarantees belong to the system contract even when the active engine lacks a corresponding native facility.

For example, the JSON provider does not have native database transactions, UNIQUE constraints or foreign keys. ManatOS still promises atomic logical writes, uniqueness and relationship integrity by implementing those semantics in adapter/application code. A relational provider can use native transactions, constraints and foreign keys where appropriate.

## Native capability model

Capabilities answer only one question: **what can this adapter/engine realize natively?**

The current capability catalog is grouped into:

- data model — relational and document-record storage;
- transactions — atomic transactions and savepoints;
- schema — tables and indexes;
- integrity — primary keys, unique constraints, foreign keys and check constraints;
- calculated data — generated/computed columns and triggers;
- programmability — views, stored functions and stored procedures;
- administration — multiple databases/catalogs.

Each effective capability includes:

- the capability key;
- category, label and description;
- supported/not-supported value;
- source ID/name;
- whether the value came from a family or concrete adapter.

The System Settings **Capabilities** tab is therefore diagnostic/administrative projection of the registry result. It is not a second policy engine and it does not decide business behavior.

## Capability inheritance

Capability resolution walks the family lineage from parent to child and then applies concrete-adapter overrides.

Conceptually:

```text
relational defaults
      |
      v
server-rdbms additions
      |
      v
SQL Server overrides (if any)
      |
      v
effective SQL Server capabilities
```

The provenance shown in the UI is part of the design. It explains why a capability has its value and avoids duplicating family knowledge in each adapter definition.

The system must reject family cycles and unknown family IDs rather than silently producing an ambiguous capability set.

## Behavior-to-capability strategy

The adapter strategy layer maps invariant behavior to a mechanism appropriate for the effective capabilities.

Examples from the current strategy resolver:

| Required behavior      | Native capability                     | Native strategy               | Fallback strategy                     |
| ---------------------- | ------------------------------------- | ----------------------------- | ------------------------------------- |
| atomic writes          | `transactions.atomic`                 | native transaction            | adapter transaction/snapshot          |
| uniqueness             | `integrity.unique-constraints`        | native UNIQUE constraint      | adapter uniqueness check              |
| references             | `integrity.foreign-keys`              | native foreign key            | adapter relationship integrity        |
| persisted calculations | generated columns/triggers where safe | translated native calculation | application evaluator/materialization |
| semantic schema        | n/a                                   | n/a                           | schema planner from metadata          |

The strategy resolver is the correct place for capability-driven implementation choice. Business services, entity metadata and UI code should not ask which adapter is active in order to decide semantics.

A strategy may deliberately choose a fallback even when a native capability exists. Capability means “possible,” not “always preferable.” Translation safety, expression semantics, portability and operational complexity remain relevant.

## Canonical semantic schema

Relational storage requires a physical schema, but ManatOS does not define that schema independently in each SQL adapter. It first projects a **semantic desired schema** from canonical entity metadata.

The current desired relational model contains tables and columns derived from registered object metadata. Column semantics include:

- field type;
- required/nullability state;
- maximum length;
- uniqueness requirement;
- referenced business-object key;
- persisted calculation expression.

This desired model describes requirements, not SQL syntax. For example, `referenceBOKey` means the field semantically references another entity. A relational adapter may realize that as a native foreign key; another adapter may enforce the same relationship in code.

Similarly, a persisted calculation is represented by its canonical expression and persisted requirement, not by a SQL computed-column expression. Translation into an engine-specific expression is a later physical strategy.

This indirection prevents the SQL Server schema from becoming the canonical definition of the business model.

## Physical schema planning

Engine-specific DDL logic translates the semantic desired schema into physical changes.

The current relational planner is intentionally conservative and additive. It can describe missing tables/columns and prepare an initial target schema. It does not yet claim to be the final migration engine for destructive or transformational changes.

Future versioned migration work must explicitly own operations such as:

- changing column types or lengths;
- adding/removing constraints where data may violate them;
- renaming/splitting/merging fields;
- data transformations;
- destructive removal;
- migration ordering and rollback/recovery policy.

Schema readiness and migration history must not be inferred only from “the current shape looks approximately right.”

## Persisted calculations

A field may declare a calculation whose result is itself persisted. The invariant is the resulting stored value, not the physical calculation mechanism.

Current examples include:

- Principal canonical/full name for Person principals;
- Principal `rootPrincipalId`, derived by traversing the parent hierarchy;
- Telephone `fullNumber`;
- Address `formattedAddress`.

The JSON provider evaluates these expressions in ManatOS code before persistence. Where a calculation can affect dependent records, metadata-driven refresh/cascade logic recalculates the affected collection. Principal root propagation is an important example: changing a parent can change the root of descendants.

A relational adapter may later choose among:

- application-side evaluation identical to JSON;
- generated/computed columns;
- triggers;
- stored functions/procedures;
- another engine-native mechanism.

The adapter must use a native mechanism only when the canonical expression can be translated safely and the resulting behavior remains equivalent. The existence of generated columns does not imply that every persisted expression belongs in a generated column.

## Relationship integrity

Relationships are declared in canonical entity metadata. Storage is responsible for preserving their persistence semantics, but the relationship definition is not storage-specific.

Relationship metadata can describe:

- source and target fields;
- cardinality;
- inverse relationships;
- delete behavior such as restrict, cascade, unlink or set-null;
- aggregate transaction requirements.

The in-memory/JSON implementation executes the required integrity logic in ManatOS code. A relational strategy may map suitable relationships to native foreign keys and ON DELETE behavior. If a native mechanism cannot represent the full semantic rule, adapter/application logic remains responsible for the remainder.

## Uniqueness and constraints

Metadata-declared unique fields are part of the semantic contract. The JSON repository currently enforces uniqueness case-insensitively where the metadata requires it.

Relational adapters should realize compatible invariants with native UNIQUE constraints/indexes, taking canonical normalization/case semantics into account. A database default collation must not accidentally redefine ManatOS uniqueness rules.

The same principle applies to check constraints: native checks are useful only when they accurately represent the canonical validation/integrity semantics.

## Atomicity and transactions

The active JSON adapter snapshots its Maps at the outer ordinary `executeTransaction()` boundary, persists the complete resulting JSON state through temporary-file replacement, and restores Maps in place when that operation fails. Explicit **multi-request** transactions use a session-owned compensation journal: participating operations persist as they execute and rollback attempts to re-persist earlier state. This is not a relational transaction with isolation across the multi-request interval. See [In-Memory/JSON Transactions](InMemory-JSON-Transactions.md) for the implemented guarantees and limits.

A relational adapter should normally use a native transaction. Savepoints may be used for nested/partial units where the system transaction model requires them, but savepoint support is a capability, not itself a behavioral requirement.

The transaction boundary follows the logical business operation, including relationship and aggregate writes. It must not be reduced to “each repository write succeeded independently.”

## Binary/picture persistence

Picture fields are part of the storage boundary but need not be embedded in the main record representation. `StorageAdapter` exposes read/write/delete operations for scalar pictures and collection picture items.

This keeps entity metadata/storage semantics stable while allowing adapters to choose appropriate blob/file mechanisms. The record stores canonical picture metadata; bytes may be stored separately according to the adapter.

## Storage configuration lifecycle

Configuration progresses through explicit stages rather than a single “connected/not connected” flag.

The current workflow is conceptually:

```text
Configuration
    |
    v
Connection
    |
    v
Database
    |
    v
Schema
    |
    v
Data / migration readiness
```

The first stage establishes a valid named configuration and concrete adapter. Later stages establish progressively stronger operational readiness.

Important lifecycle rules are:

- later-stage values are not discarded merely because an earlier stage becomes invalid;
- tabs may remain visible when persisted settings exist so an administrator can inspect/repair them;
- actions requiring an unmet prerequisite are disabled/blocked, rather than deleting state;
- readiness/status are distinct from configuration existence;
- selection for next API start requires a configuration that is eligible for runtime use.

This staged model is shared by adapter definitions and the generic System Settings UI; individual storage engines contribute fields and workflow capabilities instead of receiving custom pages.

## Prospective target operations

Relational target administration is explicitly separated from active persistence.

A configured relational adapter may provide target operations for:

- testing an ephemeral connection;
- discovering databases/catalogs;
- inspecting whether a database exists;
- creating/preparing a database;
- inspecting schema differences;
- preparing the additive schema.

These operations execute against a prospective target and do not replace the current active store. This lets an administrator prepare a migration target while ManatOS remains fully operational on another provider.

The same target contracts can later participate in startup readiness for an active relational provider.

## Runtime storage selection

Storage selection has two distinct moments:

1. **Administrative selection** persists which ready configuration should be used on the next API start.
2. **API bootstrap** resolves that selection and constructs the active provider for the process lifetime.

The running provider is intentionally stable. Live replacement would require explicit quiescing, consistency, migration and failure-recovery semantics and is not implied by the current settings UI.

## API CTX integration

Storage operations executed inside an HTTP API request create nested API CTX levels through `runStorageOperation()`.

Conceptually:

```text
$.api.level-<request-id>
    |
    +-- user
    |
    +-- level-<storage-operation>
           resources.storage.adapterId
           resources.storage.familyId
           resources.storage.capabilities
           resources.storage.behaviors
```

The storage level is marked with the `storage` diagnostic group. Descendant operations may create deeper levels while retaining request ancestry.

Bootstrap/background storage activity does not manufacture a fake HTTP request CTX. It executes normally when no request context exists.

## Diagnostics and snapshots

When API storage CTX debugging is enabled, request and storage CTX are captured before their ephemeral runtime levels are disposed.

The configured debug directory is an API-process setting. A request is keyed by the same request/correlation ID used by API Traffic and API logging. Typical artifacts are:

```text
<debug-root>/<request-id>/api.json
<debug-root>/<request-id>/storage/<storage-level-id>/ctx.json
<debug-root>/<request-id>/storage/<storage-level-id>/levels/<child-level-id>/ctx.json
```

Snapshots are diagnostic representations, not persistence. Sensitive names are centrally redacted; buffers/circular values are sanitized; snapshot-write failure must never fail the business request.

For the wider correlation model, see [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).

## Configuration and secret storage

Storage configuration itself is system configuration. Secret adapter fields are marked declaratively and encrypted before being written to `system-settings.json`.

Normal settings projections do not expose either plaintext secrets or encrypted ciphertext. The encryption root/key is deployment configuration and is deliberately not persisted in the datastore/settings document that it protects.

`SysConfiguration` business configuration records use the normal business persistence boundary; bootstrap/system settings are a different lifecycle concern.

## What is intentionally outside business storage

Authentication/session runtime material such as active sessions, reset tokens and verification tokens is not treated as ordinary business persistence. Their lifecycle/security semantics are separate from company/entity data.

This boundary prevents “replace the business datastore” from silently redefining ephemeral authentication state.

## Adding another adapter without changing business code

A new adapter should fit the architecture by:

1. defining a concrete adapter ID and family;
2. declaring only genuine capability overrides;
3. providing configuration fields/tabs and any target workflow;
4. implementing required runtime persistence contracts when `runtimeAvailable` becomes true;
5. selecting strategies from the system behavioral contract rather than changing entity behavior;
6. translating the semantic desired schema when relational/native schema is applicable;
7. preserving relationship, uniqueness, calculation and transaction invariants;
8. participating in the same API CTX/diagnostic model.

If adding an adapter requires entity-specific conditionals throughout services or metadata, the adapter boundary is being violated.

## Worked example: one persisted calculation across providers

Consider Principal `rootPrincipalId`.

The semantic definition says that the value is a persisted calculation derived by parent traversal. The entity/service layer does not say “use a trigger.”

With JSON:

```text
metadata expression
   -> shared evaluator
   -> persisted-calculation materializer
   -> descendant refresh when hierarchy changes
   -> JSON persistence
```

With a relational adapter, a strategy may decide:

```text
metadata expression
   -> translator can safely represent semantics?
        yes -> generated/trigger/procedure/native strategy
        no  -> same application materializer
   -> transactional persistence
```

Both paths must yield the same persisted semantic result. The physical mechanism is secondary.

## Worked example: relationship integrity across providers

A License references its customer Principal. Canonical relationship metadata owns that semantic link.

With JSON, ManatOS checks/maintains the relationship during persistence. With an RDBMS, a compatible physical schema can add a foreign key. If delete semantics require behavior beyond the engine constraint, adapter/application logic completes the contract.

Again, callers rely on the relationship invariant, not on the presence of a particular DDL construct.

## Design rules

The storage architecture should continue to obey these rules:

- no entity/business branching on adapter IDs;
- no capability checks in UI/business code to weaken semantic guarantees;
- canonical metadata defines storage-neutral semantics;
- adapter families remove repeated engine facts but remain internal infrastructure;
- concrete adapters remain independently selectable/configurable;
- capability provenance is observable;
- target preparation never silently changes active storage;
- desired schema is semantic before it is physical;
- native mechanisms are implementation strategies, not canonical truth;
- application fallback remains legitimate when native translation is unsafe;
- authorization/query predicates should move toward datastore selection for capable adapters rather than post-materialization filtering;
- diagnostic CTX/logging must not become part of persistence semantics.

## Available implementation and architectural boundary

The JSON provider is the active business-data persistence implementation. Relational adapter definitions, capability inheritance, target operations, semantic desired-schema preparation and additive preparation are present, but they are not equivalent to runnable relational business-data adapters. Provider-neutral storage architecture is described independently from the concrete availability of each engine.

That is an intentional staged development path: configuration and architecture are established before claiming runtime readiness.

## Audience-specific follow-up

- **Architects/designers:** this document is the canonical storage architecture narrative.
- **Adapter implementers:** see [Storage Adapters](Storage-Adapters.md).
- **Reference readers:** see [Storage Catalog](Storage-Catalog.md) and [Configuration Catalog](../system/Configuration-Catalog.md).
- **Administrators:** see [Administration](../system/Administration.md) and [Configuration](../system/Configuration.md).
- **Readers new to ManatOS:** see [Concepts](../overview/Concepts.md) and [System Map](../overview/System-Map.md).

Related architecture: [Metadata Architecture](../metadata/Metadata-Architecture.md), [API Architecture](../api/API-Architecture.md), [Runtime Architecture](../system/Runtime-Architecture.md), [Context Architecture](../context/Context-Architecture.md), and [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).

## Cross-record commits and pending resources

The workspace commit API provides a multi-operation boundary over the generic entity/storage layer. Plans identify operations and dependency order, including temporary identities that must be mapped to persistent records. Pending picture data is transmitted as bounded, validated resource content rather than being silently treated as an already persisted image reference.

The storage implementation must preserve failure semantics: a successful response means the authoritative operation completed according to the adapter's guarantees; a failed operation must not leave UI assumptions about mapped identities or dirty state inconsistent with the server outcome. Source availability of a route is not a substitute for validating transaction behavior under the active adapter. See [Workspace Commit](../entities/Workspace-Commit-and-Recovery.md).
