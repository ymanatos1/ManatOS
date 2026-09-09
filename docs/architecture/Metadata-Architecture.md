# Metadata Architecture

Two metadata layers are intentionally distinct.

**Canonical business-object metadata** defines entity identity, fields, calculations, relationships, persistence-relevant semantics and canonical entry representation. **UI metadata** defines list/entry composition, tabs, field presentation, components, actions and dynamic UI policy.

The split prevents a UI screen from becoming the canonical definition of an entity and lets API, storage, relationships, expressions and future clients consume domain semantics without understanding EJS/browser concerns.

Dynamic metadata values may be static or expression-backed. Calculated fields remain fields augmented by calculation metadata; they do not form a parallel entity model. Relationships are domain metadata and therefore own referential/delete semantics rather than UI components.

Registries provide stable keys and discovery. Platform contributions can add entity/navigation/application behavior without turning the generic registry into product-specific branching.

See [Metadata Model](../design/Metadata-Model.md), [Metadata Catalog](../reference/Metadata-Catalog.md), and [Entity Catalog](../reference/Entity-Catalog.md).
