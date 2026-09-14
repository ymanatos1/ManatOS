# Metadata Architecture

## Why metadata is architectural

Metadata in ManatOS is not a collection of UI hints. It is a canonical description of entity semantics consumed by multiple infrastructures: API behavior, storage/schema projection, relationships, expressions, entry representation and presentation composition.

The architecture deliberately separates **canonical entity metadata** from **UI metadata** so presentation does not become the definition of the business model.

## Canonical entity metadata

Canonical metadata describes durable/business semantics such as:

- stable entity key/name/labels;
- fields and field types;
- required/nullability/length/uniqueness semantics;
- enum values/items;
- references and relationships;
- canonical entry representation;
- calculations and whether they are persisted;
- create defaults that belong to entity semantics;
- exposure/internal-support status;
- relationship/delete/integrity behavior.

Canonical metadata is UI-neutral. It must remain meaningful to the API, storage planner and future clients without understanding EJS, Bootstrap or browser DOM structure.

## UI metadata

UI metadata describes framework-neutral presentation and interaction composition:

- list visible/filter/sort fields;
- record tabs and ordering;
- field presentation overrides;
- components and layouts;
- actions and declarative action state;
- related collections;
- selector/list presentation behavior;
- dynamic expression-backed presentation policy.

UI metadata does not own the persisted meaning of a field or relationship.

## Metadata flow

```text
canonical entity metadata
      |
      +--> API contracts / validation / relationships
      +--> storage semantic schema / calculations
      +--> canonical entry representation
      |
      +--> effective UI metadata
                |
                +--> lists / entries / selectors / components
                +--> browser CTX + expressions
```

The same canonical metadata is exposed through the API so the UI server does not maintain a private duplicate definition.

## Generic entity infrastructure versus SysBO

`SysBO` is a naming/category convention for system-owned business objects belonging to ManatOS company scope or platform scope. It is **not** the name of the generic entity framework.

The reusable infrastructure should therefore be described as entity infrastructure, metadata-driven entity runtime, or business-object infrastructure depending context.

Future Application-defined entities can use the same metadata, API, CTX, expression, storage and component mechanisms without being SysBO-prefixed system objects.

This terminology matters because otherwise implementation names accidentally constrain the architecture.

## Fields

A field is the canonical unit for scalar/entity value semantics. Calculated fields remain fields augmented with calculation metadata; they do not create a parallel “calculated entity model.”

Persistence-related properties such as uniqueness, references and persisted calculations belong in canonical metadata because storage adapters must preserve them.

Pure presentation details such as layout span, tab placement or visual component belong in UI metadata.

## Defaults

A default that defines the initial canonical value of a new entity belongs with entity metadata, not only in UI metadata. This lets API/storage creation and every future client observe the same default semantics.

UI-only convenience state may still belong in UI metadata/runtime when it does not redefine the created business record.

## Relationships

Relationships are canonical metadata because they affect integrity, authorization/query semantics, aggregate operations and storage schema.

A relationship definition can describe source/target fields, cardinality, inverse semantics and delete behavior. UI related-collection components consume that definition/presentation projection; they do not invent referential semantics.

## Calculations

Calculation metadata contains expression source and persistence semantics. A persisted calculation declares an invariant that storage must materialize; it does not prescribe generated columns/triggers/application evaluation.

This is an important metadata/storage boundary: canonical metadata states **what**, adapter strategy decides **how**.

## Canonical entry representation

Entity presentation often needs one canonical “what is this record called and what icon/type represents it?” model. Entry representation is resolved from canonical metadata plus optional UI presentation metadata and reference data.

Lists, selectors, references and breadcrumbs should reuse that representation rather than reconstructing entity-specific display names independently.

## Internal/support entities

Some entities exist to support relationships or normalized values and intentionally have no standalone administration UI. Their canonical metadata remains complete because API/storage/relationship infrastructure still uses them.

Generic reference infrastructure must not assume every referenced entity has `$metadata-ui`; internal entities are a normal architectural case, not an exception to hardcode by key.

## Metadata registries

Registries provide stable discovery by entity/platform/component keys. They prevent callers from importing every entity definition directly and provide one composition boundary for platform/company contributions.

A registry should compose definitions, not become a switch statement full of product-specific behavior.

## Platform contributions

Company and platform layers can contribute metadata-driven entities and presentation/navigation behavior. Ownership remains explicit: Users, Principals, Licenses and External Authentication Providers are company-owned; Applications is currently protoCRM platform-owned.

Platform composition must not move company entities under protoCRM merely because protoCRM consumes their services/licensing.

## Expressions in metadata

Metadata can contain expression-backed decisions/calculations where the decision is side-effect-free and depends on observable context.

The golden rule is:

> If a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs as a declarative expression.

If necessary state is not yet observable, the second question is whether extending CTX safely would make the decision reusable and declarative without violating ownership/lifecycle boundaries.

## Metadata and storage

The storage layer projects semantic requirements from canonical metadata. Relational desired schema currently derives columns, uniqueness, references and persisted calculations from the registry.

A storage adapter must not maintain an independent hand-written copy of the entity schema as canonical truth.

See [Data and Storage Architecture](Data-and-Storage-Architecture.md).

## Metadata and authorization

Metadata may describe actions/presentation dependencies, but authoritative authorization remains server policy. UI metadata can consume capability facts to hide/disable actions; it must not encode a competing role matrix that grants permission.

## Metadata and runtime state

Metadata is definition, not live state. CTX/runtime owns current values, facts, validation and lifecycle state. Keeping definition and instance state distinct avoids mutating global metadata objects to represent one page/session.

## Extension rules

When adding metadata:

1. decide whether the property is canonical/domain semantics or presentation semantics;
2. avoid entity-key branching when the concept is reusable;
3. keep defaults with canonical metadata when they define stored creation semantics;
4. model relationships/calculations declaratively where possible;
5. expose safe metadata through the API rather than creating UI-server copies;
6. add registry/contract tests to prevent drift;
7. verify internal entities remain usable without UI metadata;
8. preserve generic entry representation/reference behavior.

## Audience-specific follow-up

- **Designers/implementers:** [Metadata Model](../design/Metadata-Model.md), [Entity Model](../design/Entity-Model.md), [Relationships](../design/Relationships.md).
- **Developers:** [Adding an Entity](../development/Adding-an-Entity.md), [Adding UI Metadata](../development/Adding-UI-Metadata.md).
- **Reference:** [Metadata Catalog](../reference/Metadata-Catalog.md), [Entity Catalog](../reference/Entity-Catalog.md).
- **Storage:** [Data and Storage Architecture](Data-and-Storage-Architecture.md).
- **Runtime:** [Context Architecture](Context-Architecture.md), [Expression Architecture](Expression-Architecture.md).
