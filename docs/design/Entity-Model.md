# Entity Model

A SysBO has a stable metadata key independent of record IDs. Canonical metadata describes fields, relationships, calculations, entry representation and persistence semantics. UI metadata is a separate projection describing how a UI-capable client presents and interacts with it.

Supported canonical field categories include identifiers, strings, email/telephone values, booleans, numbers, dates/date-times, durations, versions, enums and references. Reference fields identify another entity; relationship metadata supplies the broader referential semantics.

Canonical entry representation gives generic surfaces a consistent name/type/description/status model. Lists, selectors, related collections and hierarchy views should consume that representation rather than inventing entity-specific labels.

Current entities and value/link objects are catalogued in [Entity Catalog](../reference/Entity-Catalog.md).
