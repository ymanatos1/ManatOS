# Entity Model

An entity is the canonical metadata-driven definition of a business object. The model describes business identity, fields, relationships and entry representation independently of any particular list, form, client or storage technology.

Current systemic objects use the `SysBO` naming/category convention. The infrastructure itself is generic and is intended to support future Application-defined entities that need not use the SysBO prefix.

## Canonical identity

An entity definition includes a stable metadata/storage/API `key` (for example `sys-principals`) and a canonical symbolic `name`. These are definition identities, not record ids. Individual records have their own `id` values.

Human-facing labels (`label`, `pluralLabel`) are presentation metadata and must not become technical entity identity.

## Canonical contents

```text
Entity metadata
├── key / name / labels
├── primary field
├── entry representation
│   ├── name
│   ├── type
│   ├── description
│   └── status
├── fieldDefinition
│   ├── canonical types/constraints
│   ├── defaults/normalization
│   └── calculations
└── relationships
    ├── target object/fields
    ├── cardinality / through
    └── delete policy
```

The API, storage/schema projection, expression/runtime infrastructure and clients consume this shared semantic definition.

## Entry representation

`entry` can define canonical sources for a record's human-facing name/type/description/status. A source can point directly to a field or to an expression.

This gives lists, selectors, related collections, breadcrumbs and visualizations a consistent way to represent the same record without each UI inventing a different "display name" rule.

## Fields

Fields use the canonical type vocabulary and can declare defaults, normalization, calculations, references, enum semantics and persistence-related traits. See [Fields](Fields.md) for the complete supported type/capability map.

A calculated field is still a normal typed field. Calculation is a value-source concern, not a separate field type.

## Relationships

Relationships are first-class metadata contracts. They explicitly declare source fields, target object/fields, cardinality, optional junction/through semantics and delete policy.

This allows integrity, inverse navigation and reusable UI behavior to be derived centrally rather than inferred from field names.

See [Relationships](Relationships.md).

## Exposure

System entities can be standard independently managed resources or internal supporting entities. Internal entities still retain canonical metadata because persistence, relationships, expressions and compound components need their semantics; they simply do not acquire standalone administration UI merely because they exist.

Contact value/link entities are examples of useful internal infrastructure.

## Entity metadata versus UI metadata

Entity metadata defines **what the object means**. UI metadata defines **how one client/surface presents/interacts with it**.

A UI can rearrange fields, choose tabs/components, restrict an enum for a specific invocation or make an editable canonical field read-only in one context. It should not redefine the canonical type, relationship target or persisted calculation.

## Entity metadata versus storage

Storage adapters consume projected semantic requirements but do not define the entity. A JSON adapter and PostgreSQL adapter must preserve the same entity-level behavior even when they realize constraints/calculations differently.

## Example: Principal

`sys-principals` combines:

- canonical typed fields;
- enum-driven Principal type;
- parent/root references;
- persisted name/root calculations;
- relationships to contact information;
- reusable hierarchy and collection components.

The generic entity infrastructure provides the mechanics; company-domain documentation defines what a Principal means.

See [Metadata Model](../metadata/Metadata-Model.md), [Entity Catalog](Entity-Catalog.md), and [Working with Entities](Working-with-Entities.md).
