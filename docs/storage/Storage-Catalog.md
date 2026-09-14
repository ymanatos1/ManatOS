# Storage Catalog

This catalog is the lookup companion to [Data and Storage Architecture](Data-and-Storage-Architecture.md). It lists the stable storage concepts currently represented in code/configuration. Architecture rationale belongs in the architecture document.

## Adapter families

| Family           | Parent       | Meaning                                                                         |
| ---------------- | ------------ | ------------------------------------------------------------------------------- |
| `document-file`  | —            | document/file-oriented persistence                                              |
| `relational`     | —            | relational database capabilities common to relational engines                   |
| `server-rdbms`   | `relational` | server-hosted relational engines with server programmability/multiple databases |
| `embedded-rdbms` | `relational` | embedded relational engines                                                     |

## Registered concrete adapters

Current registry definitions include:

- In-memory / JSON file;
- SQL Server;
- MariaDB;
- PostgreSQL;
- SQLite.

A registered definition may be configurable before it is runtime-available. Use the adapter's `runtimeAvailable` value rather than assuming registration means it can serve as the active datastore.

## Capability keys

### Data model

- `model.relational`
- `model.document-records`

### Transactions

- `transactions.atomic`
- `transactions.savepoints`

### Schema

- `schema.tables`
- `schema.indexes`

### Integrity

- `integrity.primary-keys`
- `integrity.unique-constraints`
- `integrity.foreign-keys`
- `integrity.check-constraints`

### Calculated data

- `calculation.generated-columns`
- `calculation.triggers`

### Programmability

- `programmability.views`
- `programmability.functions`
- `programmability.stored-procedures`

### Administration

- `administration.multiple-databases`

Every effective capability also reports support status and provenance (family/adapter source).

## System behavioral guarantees

| Key                          | Meaning                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `writes.atomic`              | logical writes are all-or-nothing                       |
| `integrity.unique`           | metadata uniqueness semantics are enforced              |
| `integrity.references`       | relationship/reference semantics are preserved          |
| `calculations.persisted`     | persisted calculations are materialized                 |
| `schema.semantic-projection` | canonical metadata can project a desired storage schema |

## Current strategy mechanisms

Depending on capabilities, current strategy resolution can select mechanisms such as:

- `native-transaction` / `adapter-transaction`;
- `native-unique-constraint` / `adapter-unique-check`;
- `native-foreign-key` / `adapter-reference-integrity`;
- persisted-calculation application evaluation, with native calculated-data mechanisms as future/conditional candidates;
- semantic schema planner.

These mechanism names are implementation strategy, not business semantics.

## Relational desired schema

The current semantic relational projection includes:

- table name;
- canonical object key;
- column name/type;
- required state;
- max length;
- uniqueness semantic;
- referenced object key;
- persisted calculation expression.

Current schema version constant: `MANATOS_RDBMS_SCHEMA_VERSION`.

The current planner is additive (create missing table/add missing column). Do not treat it as the versioned migration subsystem.

## Target operations

Relational adapters may expose:

- connection test;
- database/catalog discovery;
- database inspection;
- database preparation/creation;
- schema inspection;
- schema preparation.

These target operations do not switch the active datastore.

## Storage configuration stages

The persisted workflow uses stages including:

- Configuration;
- Connection;
- Database;
- Schema;
- Data;
- Complete.

Status is separate from stage (for example Incomplete/Ready/Error). Current/running configuration is separate from the selected-next-start configuration.

## API CTX storage resources

A nested storage level exposes a `resources.storage` projection containing:

- `adapterId`;
- `familyId`;
- effective `capabilities`;
- resolved `behaviors`/strategies.

## Debug snapshot layout

When enabled:

```text
<debug-root>/<request-id>/api.json
<debug-root>/<request-id>/storage/<storage-level-id>/ctx.json
<debug-root>/<request-id>/storage/<storage-level-id>/levels/<child-level-id>/ctx.json
```

See [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).
