# Adding an Entity

1. Define the canonical SysBO metadata in the appropriate `shared/src/metadata/bo/` domain module and register it.
2. Define fields once, including references/calculations/entry representation and relationships where applicable.
3. Add UI metadata under `shared/src/metadata/ui/` only for presentation/interaction concerns.
4. Reuse generic list/entry/field/selector/relationship infrastructure. Add a component only when the semantics genuinely require one.
5. Add service/storage behavior only where generic SysBO behavior is insufficient.
6. Add authorization/capability policy at the server boundary.
7. Test canonical metadata, API behavior, UI presentation/runtime behavior and architecture boundaries affected by the change.
8. Update [Entity Catalog](../reference/Entity-Catalog.md) and relevant application-design documentation.

A new entity should not require its own parallel CRUD framework.
