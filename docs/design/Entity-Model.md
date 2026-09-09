# Entity Model

System Business Objects (SysBOs) are canonical entity definitions shared by the API, UI metadata and persistence contracts. An entity model describes business identity and structure independently of a particular list, form or storage implementation.

## Canonical contents

An entity definition can include fields, types, defaults, calculations, relationships, entry representation and persistence semantics. UI metadata references this canonical model to decide how those facts are presented; it should not redefine their business meaning.

```text
Entity metadata
├── identity / entity key
├── fields and canonical types
├── calculations
├── relationships
├── entry representation
└── persistence semantics
```

Relationships are first-class contracts rather than implied foreign-key conventions. Calculated fields can remain transient or be explicitly materialized/persisted according to metadata. Canonical entry representation gives the same record a consistent semantic name/type/description/status across lists, selectors and related views.

See [Metadata Model](Metadata-Model.md), [Relationships](Relationships.md), and [Metadata Catalog](../reference/Metadata-Catalog.md).
